const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db_config');
const rt = require('../lib/realtime');
const economy = require('../lib/economy');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

function handleEconomyError(err, res, next) {
    if (err instanceof economy.EconomyError) {
        return res.status(err.status).json({ error: 'DENIED', message: err.message });
    }
    next(err);
}

// ---------------------------------------------------------------------
// OVERVIEW
// ---------------------------------------------------------------------

/** GET /api/admin/overview - headline numbers for the dashboard. */
router.get('/overview', async (_req, res, next) => {
    try {
        const [totals, phase, byCategory, itemsSold, timeline] = await Promise.all([
            db.query(
                `SELECT
                    (SELECT COUNT(*)::int FROM teams)                                    AS teams,
                    (SELECT COUNT(*)::int FROM operators)                                AS operators,
                    (SELECT COALESCE(SUM(cit_balance),0)::int FROM teams)                AS circulating,
                    (SELECT COALESCE(SUM(amount),0)::int FROM ledger WHERE amount > 0)   AS total_issued,
                    (SELECT COALESCE(-SUM(amount),0)::int FROM ledger WHERE amount < 0)  AS total_spent,
                    (SELECT COUNT(*)::int FROM submissions WHERE is_correct)             AS solves,
                    (SELECT COUNT(*)::int FROM submissions)                              AS attempts,
                    (SELECT COUNT(*)::int FROM team_missions)                            AS missions_bought,
                    (SELECT COUNT(*)::int FROM sessions
                      WHERE revoked_at IS NULL AND expires_at > NOW())                   AS active_sessions`
            ),
            db.query('SELECT phase, phase_ends_at FROM game_state WHERE id = 1'),
            db.query(
                `SELECT c.category,
                        COUNT(*) FILTER (WHERE s.is_correct)::int AS solves,
                        COUNT(*)::int                             AS attempts
                   FROM submissions s JOIN challenges c ON c.id = s.challenge_id
                  GROUP BY c.category`
            ),
            db.query('SELECT code, name, item_type, units_sold, revenue, teams_owning FROM v_item_popularity ORDER BY units_sold DESC'),
            db.query(
                `SELECT date_trunc('minute', created_at) AS t,
                        SUM(amount) FILTER (WHERE amount > 0)::int  AS earned,
                        -SUM(amount) FILTER (WHERE amount < 0)::int AS spent
                   FROM ledger
                  WHERE created_at > NOW() - INTERVAL '2 hours'
                  GROUP BY 1 ORDER BY 1`
            ),
        ]);

        res.json({
            totals: totals.rows[0],
            phase: phase.rows[0],
            byCategory: byCategory.rows,
            itemsSold: itemsSold.rows,
            timeline: timeline.rows,
        });
    } catch (err) { next(err); }
});

/** GET /api/admin/teams - the full stats table. */
router.get('/teams', async (_req, res, next) => {
    try {
        const { rows } = await db.query('SELECT * FROM v_team_stats ORDER BY core_energy DESC, cit_balance DESC');
        res.json(rows);
    } catch (err) { next(err); }
});

/** GET /api/admin/teams/:id - the drill-down view for one team. */
router.get('/teams/:id', async (req, res, next) => {
    try {
        const teamId = Number(req.params.id);

        const [stats, items, ledger, missions, operators, sessions, subs] = await Promise.all([
            db.query('SELECT * FROM v_team_stats WHERE id = $1', [teamId]),
            db.query('SELECT * FROM v_team_items WHERE team_id = $1 ORDER BY item_type, name', [teamId]),
            db.query(
                `SELECT l.id, l.kind, l.amount, l.balance_after, l.quantity, l.note, l.created_at,
                        o.nickname AS operator, i.name AS item_name
                   FROM ledger l
              LEFT JOIN operators o ON o.id = l.operator_id
              LEFT JOIN items i     ON i.id = l.item_id
                  WHERE l.team_id = $1
                  ORDER BY l.created_at DESC LIMIT 200`,
                [teamId]
            ),
            db.query(
                `SELECT tm.id, tm.status, tm.has_insurance, tm.paid_amount, tm.purchased_at,
                        tm.deadline_at, tm.resolved_at, m.mission_name, m.code, m.reward
                   FROM team_missions tm JOIN missions m ON m.id = tm.mission_id
                  WHERE tm.team_id = $1 ORDER BY tm.purchased_at DESC`,
                [teamId]
            ),
            db.query('SELECT id, nickname, created_at FROM operators WHERE team_id = $1', [teamId]),
            db.query(
                `SELECT id, user_agent, ip, created_at, expires_at
                   FROM sessions
                  WHERE team_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
                  ORDER BY created_at DESC`,
                [teamId]
            ),
            db.query(
                `SELECT c.code, c.category, c.reward, s.is_correct, s.submitted_at, o.nickname
                   FROM submissions s
                   JOIN challenges c ON c.id = s.challenge_id
              LEFT JOIN operators o ON o.id = s.operator_id
                  WHERE s.team_id = $1 ORDER BY s.submitted_at DESC LIMIT 100`,
                [teamId]
            ),
        ]);

        if (!stats.rows[0]) return res.status(404).json({ error: 'NOT FOUND' });

        res.json({
            team: stats.rows[0],
            items: items.rows,
            ledger: ledger.rows,
            missions: missions.rows,
            operators: operators.rows,
            sessions: sessions.rows,
            submissions: subs.rows,
        });
    } catch (err) { next(err); }
});

/** GET /api/admin/items - catalogue with sales figures. */
router.get('/items', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT i.*, p.units_sold, p.revenue, p.teams_owning
               FROM items i JOIN v_item_popularity p ON p.id = i.id
              ORDER BY i.item_type, i.cost`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/** GET /api/admin/inventory - every (team, item) pair in one grid. */
router.get('/inventory', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM v_team_items WHERE quantity > 0 ORDER BY team_name, item_type'
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/** GET /api/admin/ledger - the global audit trail. */
router.get('/ledger', async (req, res, next) => {
    try {
        const limit = Math.min(500, Number(req.query.limit) || 200);
        const kind = req.query.kind || null;
        const { rows } = await db.query(
            `SELECT l.id, l.kind, l.amount, l.balance_after, l.quantity, l.note, l.created_at,
                    t.team_name, o.nickname AS operator, i.name AS item_name
               FROM ledger l
               JOIN teams t      ON t.id = l.team_id
          LEFT JOIN operators o  ON o.id = l.operator_id
          LEFT JOIN items i      ON i.id = l.item_id
              WHERE ($1::text IS NULL OR l.kind = $1)
              ORDER BY l.created_at DESC LIMIT $2`,
            [kind, limit]
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/** GET /api/admin/challenges - solve rate per challenge. */
router.get('/challenges', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT c.id, c.code, c.category, c.difficulty, c.reward, c.title, c.is_active,
                    COUNT(s.id) FILTER (WHERE s.is_correct)::int     AS solves,
                    COUNT(s.id)::int                                 AS attempts,
                    COUNT(DISTINCT s.team_id)::int                   AS teams_tried
               FROM challenges c LEFT JOIN submissions s ON s.challenge_id = c.id
              GROUP BY c.id ORDER BY c.category, c.difficulty`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/** GET /api/admin/missions - purchases and outcomes per mission. */
router.get('/missions', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT m.*,
                    COUNT(tm.id)::int                                    AS purchases,
                    COUNT(tm.id) FILTER (WHERE tm.status='COMPLETED')::int AS completed,
                    COUNT(tm.id) FILTER (WHERE tm.status='FAILED')::int    AS failed,
                    COUNT(tm.id) FILTER (WHERE tm.status='PURCHASED')::int AS in_progress
               FROM missions m LEFT JOIN team_missions tm ON tm.mission_id = m.id
              GROUP BY m.id ORDER BY m.entry_cost`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

/** GET /api/admin/missions/pending - what needs manual resolution. */
router.get('/missions/pending', async (_req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT tm.id, tm.purchased_at, tm.deadline_at, tm.has_insurance, tm.paid_amount,
                    t.team_name, t.id AS team_id, m.mission_name, m.reward
               FROM team_missions tm
               JOIN teams t    ON t.id = tm.team_id
               JOIN missions m ON m.id = tm.mission_id
              WHERE tm.status = 'PURCHASED'
              ORDER BY tm.deadline_at NULLS LAST, tm.purchased_at`
        );
        res.json(rows);
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------
// ACTIONS
// ---------------------------------------------------------------------

/** POST /api/admin/missions/:id/resolve  { outcome: COMPLETED | FAILED } */
router.post('/missions/:id/resolve', async (req, res, next) => {
    try {
        const outcome = (req.body || {}).outcome === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
        const result = await economy.resolveMission({
            teamMissionId: Number(req.params.id),
            adminId: req.auth.adminId,
            outcome,
        });
        rt.broadcastWallet(result.teamId, result.wallet);
        rt.toTeam(result.teamId, 'mission_resolved', { outcome, missionName: result.missionName });
        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

/** POST /api/admin/teams/:id/adjust  { amount, note } */
router.post('/teams/:id/adjust', async (req, res, next) => {
    try {
        const { amount, note } = req.body || {};
        if (!Number.isInteger(amount) || amount === 0) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'NON-ZERO INTEGER AMOUNT REQUIRED.' });
        }
        const result = await economy.adminAdjust({
            teamId: Number(req.params.id),
            adminId: req.auth.adminId,
            amount,
            note: note || 'Manual adjustment',
        });
        rt.broadcastWallet(Number(req.params.id), result.wallet);
        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

/** POST /api/admin/teams/:id/grant-item  { itemCode, quantity } */
router.post('/teams/:id/grant-item', async (req, res, next) => {
    try {
        const { itemCode, quantity } = req.body || {};
        const teamId = Number(req.params.id);
        const result = await economy.adminGrantItem({
            teamId, adminId: req.auth.adminId, itemCode,
            quantity: Math.max(1, Number(quantity) || 1),
        });
        rt.broadcastInventory(teamId, result.inventory);
        res.json({ success: true, ...result });
    } catch (err) { handleEconomyError(err, res, next); }
});

/** POST /api/admin/teams/:id/lock  { locked: boolean } */
router.post('/teams/:id/lock', async (req, res, next) => {
    try {
        const locked = Boolean((req.body || {}).locked);
        await db.query('UPDATE teams SET is_locked = $1 WHERE id = $2', [locked, Number(req.params.id)]);
        rt.toTeam(Number(req.params.id), 'team_locked', { locked });
        res.json({ success: true, locked });
    } catch (err) { next(err); }
});

/** DELETE /api/admin/sessions/:id - kick one device off a team account. */
router.delete('/sessions/:id', async (req, res, next) => {
    try {
        await db.query('UPDATE sessions SET revoked_at = NOW() WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { next(err); }
});

/** POST /api/admin/phase  { phase, endsAt } - drives the whole game. */
router.post('/phase', async (req, res, next) => {
    try {
        const { phase, endsAt } = req.body || {};
        const allowed = ['LOBBY', 'PHASE_I', 'PHASE_II', 'ENDGAME', 'CLOSED'];
        if (!allowed.includes(phase)) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'UNKNOWN PHASE.' });
        }
        const { rows } = await db.query(
            'UPDATE game_state SET phase = $1, phase_ends_at = $2, updated_at = NOW() WHERE id = 1 RETURNING *',
            [phase, endsAt || null]
        );
        rt.toFeed('phase_change', rows[0]);
        rt.toAdmins('phase_change', rows[0]);
        res.json({ success: true, state: rows[0] });
    } catch (err) { next(err); }
});

/** POST /api/admin/challenges  - create a challenge (flag is hashed here). */
router.post('/challenges', async (req, res, next) => {
    try {
        const { code, category, difficulty, reward, title, description, flag } = req.body || {};
        if (!code || !category || !flag || !title) {
            return res.status(400).json({ error: 'BAD REQUEST', message: 'CODE, CATEGORY, TITLE AND FLAG REQUIRED.' });
        }
        const { rows } = await db.query(
            `INSERT INTO challenges (code, category, difficulty, reward, title, description, flag_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (code) DO UPDATE SET
                category = EXCLUDED.category, difficulty = EXCLUDED.difficulty,
                reward = EXCLUDED.reward, title = EXCLUDED.title,
                description = EXCLUDED.description, flag_hash = EXCLUDED.flag_hash
             RETURNING id, code, category, difficulty, reward, title`,
            [code, category, difficulty || 1, reward || 50, title, description || null,
             await bcrypt.hash(flag.trim(), 10)]
        );
        res.json({ success: true, challenge: rows[0] });
    } catch (err) { next(err); }
});

/** PATCH /api/admin/challenges/:id/active  { active: boolean } */
router.patch('/challenges/:id/active', async (req, res, next) => {
    try {
        const active = Boolean((req.body || {}).active);
        await db.query('UPDATE challenges SET is_active = $1 WHERE id = $2', [active, Number(req.params.id)]);
        res.json({ success: true, active });
    } catch (err) { next(err); }
});

module.exports = router;
