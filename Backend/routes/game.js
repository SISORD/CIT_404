const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db_config');
const rt = require('../lib/realtime');
const economy = require('../lib/economy');
const { requireTeam } = require('../middleware/auth');

const router = express.Router();
router.use(requireTeam);

/** Flag submission is the one endpoint worth guessing at, so throttle it. */
const flagLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 15,
    keyGenerator: (req) => `team_${req.auth.teamId}`,
    message: { error: 'THROTTLED', message: 'TOO MANY SUBMISSIONS. SLOW DOWN.' },
});

function handleEconomyError(err, res, next) {
    if (err instanceof economy.EconomyError) {
        return res.status(err.status).json({ error: 'DENIED', message: err.message });
    }
    next(err);
}

/** GET /api/game/state - everything the operator app needs on boot. */
router.get('/state', async (req, res, next) => {
    try {
        const { teamId } = req.auth;

        const [team, phase, inventory, solved, missions] = await Promise.all([
            db.query('SELECT id, team_name, cit_balance, core_energy FROM teams WHERE id = $1', [teamId]),
            db.query('SELECT phase, phase_ends_at FROM game_state WHERE id = 1'),
            economy.getInventory(db, teamId),
            db.query(
                `SELECT c.id, c.code, c.category FROM submissions s
                   JOIN challenges c ON c.id = s.challenge_id
                  WHERE s.team_id = $1 AND s.is_correct`,
                [teamId]
            ),
            db.query(
                `SELECT tm.id, tm.status, tm.has_insurance, tm.paid_amount,
                        tm.purchased_at, tm.deadline_at, m.code, m.mission_name
                   FROM team_missions tm
                   JOIN missions m ON m.id = tm.mission_id
                  WHERE tm.team_id = $1
                  ORDER BY tm.purchased_at DESC`,
                [teamId]
            ),
        ]);

        res.json({
            team: team.rows[0],
            phase: phase.rows[0],
            inventory,
            solvedChallenges: solved.rows,
            missions: missions.rows,
        });
    } catch (err) { next(err); }
});

/** GET /api/game/challenges - never returns flag_hash. */
router.get('/challenges', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT c.id, c.code, c.category, c.difficulty, c.reward, c.title, c.description,
                    EXISTS (
                        SELECT 1 FROM submissions s
                         WHERE s.challenge_id = c.id AND s.team_id = $1 AND s.is_correct
                    ) AS solved
               FROM challenges c
              WHERE c.is_active
              ORDER BY c.category, c.difficulty, c.code`,
            [req.auth.teamId]
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/** POST /api/game/submit-flag */
router.post('/submit-flag', flagLimiter, async (req, res, next) => {
    try {
        const { challengeCode, flag } = req.body || {};
        if (!challengeCode || !flag) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'CHALLENGE AND FLAG REQUIRED.' });
        }

        const { rows } = await db.query(
            'SELECT * FROM challenges WHERE code = $1 AND is_active',
            [challengeCode]
        );
        const challenge = rows[0];
        if (!challenge) return res.status(404).json({ error: 'NOT FOUND', message: 'CHALLENGE OFFLINE.' });

        const correct = await bcrypt.compare(flag.trim(), challenge.flag_hash);
        if (!correct) {
            await db.query(
                'INSERT INTO submissions (team_id, challenge_id, operator_id, is_correct) VALUES ($1,$2,$3,FALSE)',
                [req.auth.teamId, challenge.id, req.auth.operatorId]
            );
            return res.status(400).json({ success: false, message: 'INVALID FLAG OR CORRUPTED DATA.' });
        }

        const result = await economy.creditChallenge({
            teamId: req.auth.teamId,
            operatorId: req.auth.operatorId,
            challenge,
        });

        rt.broadcastWallet(req.auth.teamId, result.wallet);
        rt.broadcastActivity({
            teamName: result.teamName,
            text: `${result.teamName} recovered ${challenge.code}`,
            at: new Date().toISOString(),
        });

        res.json({ success: true, reward: result.reward, wallet: result.wallet });
    } catch (err) { handleEconomyError(err, res, next); }
});

// ---------------------------------------------------------------------
// THE MARKETPLACE
// ---------------------------------------------------------------------

/** GET /api/game/items - catalogue + how many this team already holds. */
router.get('/items', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT i.id, i.code, i.name, i.item_type, i.cost, i.icon, i.effect,
                    i.payload, i.max_per_team, i.stock,
                    COALESCE(ti.quantity, 0)     AS owned,
                    COALESCE(ti.total_bought, 0) AS total_bought
               FROM items i
          LEFT JOIN team_inventory ti ON ti.item_id = i.id AND ti.team_id = $1
              WHERE i.is_active
              ORDER BY i.item_type, i.cost`,
            [req.auth.teamId]
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/** GET /api/game/inventory */
router.get('/inventory', async (req, res, next) => {
    try {
        res.json(await economy.getInventory(db, req.auth.teamId));
    } catch (err) { next(err); }
});

/** POST /api/game/items/purchase */
router.post('/items/purchase', async (req, res, next) => {
    try {
        const { itemCode, quantity } = req.body || {};
        const result = await economy.purchaseItem({
            teamId: req.auth.teamId,
            operatorId: req.auth.operatorId,
            itemCode,
            quantity: Math.max(1, Math.min(10, Number(quantity) || 1)),
        });

        rt.broadcastWallet(req.auth.teamId, result.wallet);
        rt.broadcastInventory(req.auth.teamId, result.inventory);
        rt.broadcastActivity({
            teamName: result.teamName,
            text: `${result.teamName} acquired ${result.item.name}`,
            at: new Date().toISOString(),
        });

        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

/** POST /api/game/items/use */
router.post('/items/use', async (req, res, next) => {
    try {
        const result = await economy.useItem({
            teamId: req.auth.teamId,
            operatorId: req.auth.operatorId,
            itemCode: (req.body || {}).itemCode,
        });
        rt.broadcastInventory(req.auth.teamId, result.inventory);
        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

// ---------------------------------------------------------------------
// PHASE II
// ---------------------------------------------------------------------

/** GET /api/game/missions - locked until the admin opens Phase II. */
router.get('/missions', async (req, res, next) => {
    try {
        const { rows: state } = await db.query('SELECT phase FROM game_state WHERE id = 1');
        if (!['PHASE_II', 'ENDGAME'].includes(state[0].phase)) {
            return res.json({ locked: true, missions: [] });
        }

        const { rows } = await db.query(
            `SELECT m.id, m.code, m.mission_name, m.entry_cost, m.difficulty_stars,
                    m.reward, m.core_energy, m.time_limit_min, m.description,
                    m.required_items, m.capacity,
                    tm.status AS team_status, tm.deadline_at, tm.has_insurance
               FROM missions m
          LEFT JOIN team_missions tm
                 ON tm.mission_id = m.id AND tm.team_id = $1
                AND tm.status IN ('PURCHASED','COMPLETED')
              WHERE m.is_active
              ORDER BY m.entry_cost`,
            [req.auth.teamId]
        );
        res.json({ locked: false, missions: rows });
    } catch (err) { next(err); }
});

/** POST /api/game/missions/purchase */
router.post('/missions/purchase', async (req, res, next) => {
    try {
        const { rows: state } = await db.query('SELECT phase FROM game_state WHERE id = 1');
        if (!['PHASE_II', 'ENDGAME'].includes(state[0].phase)) {
            return res.status(423).json({ error: 'LOCKED', message: 'FIELD OPERATIONS NOT YET AVAILABLE.' });
        }

        const { missionCode, withInsurance } = req.body || {};
        const result = await economy.purchaseMission({
            teamId: req.auth.teamId,
            operatorId: req.auth.operatorId,
            missionCode,
            withInsurance: Boolean(withInsurance),
        });

        rt.broadcastWallet(req.auth.teamId, result.wallet);
        rt.broadcastActivity({
            teamName: result.teamName,
            text: `${result.teamName} deployed on ${result.mission.mission_name}`,
            at: new Date().toISOString(),
        });

        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

/** GET /api/game/ledger - this team's own transaction history. */
router.get('/ledger', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT l.id, l.kind, l.amount, l.balance_after, l.quantity, l.note, l.created_at,
                    o.nickname AS operator
               FROM ledger l
          LEFT JOIN operators o ON o.id = l.operator_id
              WHERE l.team_id = $1
              ORDER BY l.created_at DESC
              LIMIT 100`,
            [req.auth.teamId]
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/** GET /api/game/leaderboard - public standings. */
router.get('/leaderboard', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            'SELECT team_name, core_energy, total_solved, missions_completed, rank FROM v_leaderboard ORDER BY rank LIMIT 20'
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/** GET /api/game/feed - recent public activity. */
router.get('/feed', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT t.team_name, l.kind, l.note, l.created_at
               FROM ledger l JOIN teams t ON t.id = l.team_id
              WHERE l.kind IN ('CHALLENGE_REWARD','ITEM_PURCHASE','MISSION_PURCHASE','MISSION_REWARD')
              ORDER BY l.created_at DESC LIMIT 15`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

module.exports = router;
