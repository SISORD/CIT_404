const db = require('../db_config');

/**
 * Every CIT$ movement in the game funnels through this module.
 *
 * Two invariants it exists to protect:
 *   1. Three operators share one wallet and they act concurrently. Two
 *      simultaneous purchases must not both read the same balance, so the
 *      team row is locked with SELECT ... FOR UPDATE before any arithmetic.
 *   2. The wallet, the inventory and the ledger must move together. They
 *      are written inside one transaction; a failure rolls back all three.
 *
 * The ledger is append-only and is the source of truth. `teams.cit_balance`
 * and `team_inventory.quantity` are projections you can rebuild from it.
 */

class EconomyError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

/** Locks the team row for the rest of the transaction. */
async function lockTeam(client, teamId) {
    const { rows } = await client.query(
        'SELECT id, team_name, cit_balance, core_energy, is_locked FROM teams WHERE id = $1 FOR UPDATE',
        [teamId]
    );
    if (!rows[0]) throw new EconomyError('TEAM NOT FOUND.', 404);
    if (rows[0].is_locked) throw new EconomyError('TEAM ACCOUNT FROZEN BY THE CORE.', 423);
    return rows[0];
}

/**
 * Applies a signed delta to the wallet and writes the matching ledger row.
 * Returns the new balance. Must be called inside a transaction.
 */
async function applyDelta(client, {
    teamId, amount, kind, operatorId = null, itemId = null,
    challengeId = null, missionId = null, adminId = null,
    quantity = 1, note = null, coreEnergy = 0,
}) {
    const { rows } = await client.query(
        `UPDATE teams
            SET cit_balance = cit_balance + $1,
                core_energy = core_energy + $2
          WHERE id = $3
        RETURNING cit_balance, core_energy`,
        [amount, coreEnergy, teamId]
    );
    const balanceAfter = rows[0].cit_balance;

    await client.query(
        `INSERT INTO ledger
           (team_id, operator_id, kind, amount, balance_after,
            item_id, challenge_id, mission_id, admin_id, quantity, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [teamId, operatorId, kind, amount, balanceAfter,
         itemId, challengeId, missionId, adminId, quantity, note]
    );

    return { balance: balanceAfter, coreEnergy: rows[0].core_energy };
}

/** Upserts the inventory projection for one (team, item) pair. */
async function addToInventory(client, teamId, itemId, delta) {
    const { rows } = await client.query(
        `INSERT INTO team_inventory (team_id, item_id, quantity, total_bought, first_bought_at, updated_at)
         VALUES ($1, $2, $3, $3, NOW(), NOW())
         ON CONFLICT (team_id, item_id) DO UPDATE
            SET quantity     = team_inventory.quantity + $3,
                total_bought = team_inventory.total_bought + $3,
                updated_at   = NOW()
         RETURNING quantity`,
        [teamId, itemId, delta]
    );
    return rows[0].quantity;
}

/** Consumes one unit of an item. Throws if the team does not hold it. */
async function consumeFromInventory(client, teamId, itemId, qty = 1) {
    const { rows } = await client.query(
        `UPDATE team_inventory
            SET quantity   = quantity - $3,
                total_used = total_used + $3,
                updated_at = NOW()
          WHERE team_id = $1 AND item_id = $2 AND quantity >= $3
        RETURNING quantity`,
        [teamId, itemId, qty]
    );
    if (!rows[0]) throw new EconomyError('ITEM NOT IN INVENTORY.', 409);
    return rows[0].quantity;
}

/** The full inventory of a team, catalogue data included, for the UI. */
async function getInventory(clientOrDb, teamId) {
    const { rows } = await clientOrDb.query(
        `SELECT i.id, i.code, i.name, i.item_type, i.icon, i.cost, i.effect,
                i.payload, ti.quantity, ti.total_bought, ti.total_used
           FROM team_inventory ti
           JOIN items i ON i.id = ti.item_id
          WHERE ti.team_id = $1 AND ti.quantity > 0
          ORDER BY i.item_type, i.cost`,
        [teamId]
    );
    return rows;
}

// ---------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------

/** Buys `quantity` units of an item. Atomic: balance, inventory, ledger. */
async function purchaseItem({ teamId, operatorId, itemCode, quantity = 1 }) {
    return db.withTransaction(async (client) => {
        const team = await lockTeam(client, teamId);

        const { rows: itemRows } = await client.query(
            'SELECT * FROM items WHERE code = $1 AND is_active FOR UPDATE',
            [itemCode]
        );
        const item = itemRows[0];
        if (!item) throw new EconomyError('ITEM NOT FOUND IN THE MARKET.', 404);

        const cost = item.cost * quantity;
        if (team.cit_balance < cost) throw new EconomyError('INSUFFICIENT FUNDS.', 402);

        if (item.stock !== null) {
            if (item.stock < quantity) throw new EconomyError('OUT OF STOCK.', 409);
            await client.query('UPDATE items SET stock = stock - $1 WHERE id = $2', [quantity, item.id]);
        }

        if (item.max_per_team !== null) {
            const { rows: held } = await client.query(
                'SELECT total_bought FROM team_inventory WHERE team_id = $1 AND item_id = $2',
                [teamId, item.id]
            );
            const already = held[0] ? held[0].total_bought : 0;
            if (already + quantity > item.max_per_team) {
                throw new EconomyError(`PURCHASE LIMIT REACHED (${item.max_per_team} MAX).`, 409);
            }
        }

        const wallet = await applyDelta(client, {
            teamId, operatorId, amount: -cost, kind: 'ITEM_PURCHASE',
            itemId: item.id, quantity, note: item.name,
        });
        await addToInventory(client, teamId, item.id, quantity);

        return {
            wallet,
            item: { code: item.code, name: item.name, cost: item.cost },
            quantity,
            inventory: await getInventory(client, teamId),
            teamName: team.team_name,
        };
    });
}

/** Spends one unit of an item. No CIT$ moves, but the ledger records it. */
async function useItem({ teamId, operatorId, itemCode }) {
    return db.withTransaction(async (client) => {
        const team = await lockTeam(client, teamId);
        const { rows } = await client.query('SELECT * FROM items WHERE code = $1', [itemCode]);
        const item = rows[0];
        if (!item) throw new EconomyError('ITEM NOT FOUND.', 404);

        await consumeFromInventory(client, teamId, item.id, 1);
        await applyDelta(client, {
            teamId, operatorId, amount: 0, kind: 'ITEM_USE',
            itemId: item.id, note: item.name,
        });

        return {
            item: { code: item.code, name: item.name, payload: item.payload },
            inventory: await getInventory(client, teamId),
            wallet: { balance: team.cit_balance, coreEnergy: team.core_energy },
        };
    });
}

/** Credits a challenge reward. The unique index blocks a second solve. */
async function creditChallenge({ teamId, operatorId, challenge }) {
    return db.withTransaction(async (client) => {
        const team = await lockTeam(client, teamId);

        try {
            await client.query(
                'INSERT INTO submissions (team_id, challenge_id, operator_id, is_correct) VALUES ($1,$2,$3,TRUE)',
                [teamId, challenge.id, operatorId]
            );
        } catch (err) {
            if (err.code === '23505') throw new EconomyError('FRAGMENT ALREADY RECOVERED BY YOUR TEAM.', 409);
            throw err;
        }

        const wallet = await applyDelta(client, {
            teamId, operatorId, amount: challenge.reward, kind: 'CHALLENGE_REWARD',
            challengeId: challenge.id, note: challenge.title, coreEnergy: 0,
        });

        return { wallet, reward: challenge.reward, teamName: team.team_name };
    });
}

/** Buys a mission: checks funds, required items, capacity; debits; logs. */
async function purchaseMission({ teamId, operatorId, missionCode, withInsurance = false }) {
    return db.withTransaction(async (client) => {
        const team = await lockTeam(client, teamId);

        const { rows: mRows } = await client.query(
            'SELECT * FROM missions WHERE code = $1 AND is_active',
            [missionCode]
        );
        const mission = mRows[0];
        if (!mission) throw new EconomyError('MISSION UNAVAILABLE.', 404);

        // Required items must actually be held.
        for (const requiredCode of mission.required_items) {
            const { rows } = await client.query(
                `SELECT ti.quantity FROM team_inventory ti
                   JOIN items i ON i.id = ti.item_id
                  WHERE ti.team_id = $1 AND i.code = $2 AND ti.quantity > 0`,
                [teamId, requiredCode]
            );
            if (!rows[0]) throw new EconomyError(`MISSION LOCKED. REQUIRES: ${requiredCode}.`, 409);
        }

        if (mission.capacity !== null) {
            const { rows } = await client.query(
                `SELECT COUNT(*)::int AS taken FROM team_missions
                  WHERE mission_id = $1 AND status IN ('PURCHASED','COMPLETED')`,
                [mission.id]
            );
            if (rows[0].taken >= mission.capacity) throw new EconomyError('MISSION AT CAPACITY.', 409);
        }

        let insuranceItemId = null;
        let cost = mission.entry_cost;
        if (withInsurance) {
            const { rows } = await client.query("SELECT * FROM items WHERE code = 'INSURANCE'");
            if (!rows[0]) throw new EconomyError('INSURANCE UNAVAILABLE.', 404);
            insuranceItemId = rows[0].id;
            cost += rows[0].cost;
        }

        if (team.cit_balance < cost) throw new EconomyError('INSUFFICIENT FUNDS.', 402);

        const deadline = mission.time_limit_min
            ? new Date(Date.now() + mission.time_limit_min * 60_000)
            : null;

        let teamMission;
        try {
            const { rows } = await client.query(
                `INSERT INTO team_missions
                   (team_id, mission_id, status, has_insurance, paid_amount, deadline_at)
                 VALUES ($1,$2,'PURCHASED',$3,$4,$5)
                 RETURNING *`,
                [teamId, mission.id, withInsurance, cost, deadline]
            );
            teamMission = rows[0];
        } catch (err) {
            if (err.code === '23505') throw new EconomyError('MISSION ALREADY ACQUIRED.', 409);
            throw err;
        }

        const wallet = await applyDelta(client, {
            teamId, operatorId, amount: -cost, kind: 'MISSION_PURCHASE',
            missionId: mission.id, itemId: insuranceItemId, note: mission.mission_name,
        });

        return { wallet, mission, teamMission, teamName: team.team_name };
    });
}

/**
 * Admin resolution of a field mission. On success it pays the reward and
 * Core Energy; on failure it refunds half the entry cost if the team
 * bought insurance.
 */
async function resolveMission({ teamMissionId, adminId, outcome }) {
    return db.withTransaction(async (client) => {
        // Every other operation takes the team row first. Resolving has to
        // follow the same order, or an admin validating a mission while the
        // team buys one deadlocks the two transactions.
        const { rows: owner } = await client.query(
            'SELECT team_id FROM team_missions WHERE id = $1',
            [teamMissionId]
        );
        if (!owner[0]) throw new EconomyError('MISSION RECORD NOT FOUND.', 404);
        await client.query('SELECT id FROM teams WHERE id = $1 FOR UPDATE', [owner[0].team_id]);

        const { rows } = await client.query(
            `SELECT tm.*, m.reward, m.core_energy, m.mission_name, m.id AS mission_id
               FROM team_missions tm
               JOIN missions m ON m.id = tm.mission_id
              WHERE tm.id = $1 FOR UPDATE OF tm`,
            [teamMissionId]
        );
        const tm = rows[0];
        if (!tm) throw new EconomyError('MISSION RECORD NOT FOUND.', 404);
        if (tm.status !== 'PURCHASED') throw new EconomyError('MISSION ALREADY RESOLVED.', 409);

        await client.query(
            'UPDATE team_missions SET status = $1, resolved_at = NOW(), resolved_by = $2 WHERE id = $3',
            [outcome === 'COMPLETED' ? 'COMPLETED' : 'FAILED', adminId, teamMissionId]
        );

        let wallet;
        if (outcome === 'COMPLETED') {
            wallet = await applyDelta(client, {
                teamId: tm.team_id, adminId, amount: tm.reward, kind: 'MISSION_REWARD',
                missionId: tm.mission_id, note: tm.mission_name, coreEnergy: tm.core_energy,
            });
        } else if (tm.has_insurance) {
            const refund = Math.floor(tm.paid_amount / 2);
            wallet = await applyDelta(client, {
                teamId: tm.team_id, adminId, amount: refund, kind: 'INSURANCE_REFUND',
                missionId: tm.mission_id, note: `Insurance payout - ${tm.mission_name}`,
            });
        } else {
            const { rows: t } = await client.query(
                'SELECT cit_balance, core_energy FROM teams WHERE id = $1',
                [tm.team_id]
            );
            wallet = { balance: t[0].cit_balance, coreEnergy: t[0].core_energy };
        }

        return { wallet, teamId: tm.team_id, outcome, missionName: tm.mission_name };
    });
}

/** Manual admin correction. Always leaves a ledger trail with a reason. */
async function adminAdjust({ teamId, adminId, amount, note }) {
    return db.withTransaction(async (client) => {
        await lockTeam(client, teamId);
        const wallet = await applyDelta(client, {
            teamId, adminId, amount, kind: 'ADMIN_ADJUST', note,
        });
        return { wallet };
    });
}

/** Admin grant of an item without charging the team. */
async function adminGrantItem({ teamId, adminId, itemCode, quantity = 1 }) {
    return db.withTransaction(async (client) => {
        await lockTeam(client, teamId);
        const { rows } = await client.query('SELECT * FROM items WHERE code = $1', [itemCode]);
        const item = rows[0];
        if (!item) throw new EconomyError('ITEM NOT FOUND.', 404);

        await addToInventory(client, teamId, item.id, quantity);
        await applyDelta(client, {
            teamId, adminId, amount: 0, kind: 'ADMIN_ADJUST',
            itemId: item.id, quantity, note: `Granted ${quantity}x ${item.name}`,
        });

        return { inventory: await getInventory(client, teamId) };
    });
}

module.exports = {
    EconomyError,
    getInventory,
    purchaseItem,
    useItem,
    creditChallenge,
    purchaseMission,
    resolveMission,
    adminAdjust,
    adminGrantItem,
};
