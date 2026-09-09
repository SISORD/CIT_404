const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db_config');

/**
 * Token strategy for CIT: 404
 * -----------------------------------------------------------------
 * Access token  : JWT, 15 min, signed, kept in memory by the React app.
 *                 Never written to localStorage, so an XSS payload
 *                 cannot read a long-lived credential off disk.
 * Refresh token : 256 bits of randomness, httpOnly + SameSite cookie,
 *                 stored HASHED in `sessions`. Because it lives in the
 *                 database, an admin can list every device attached to
 *                 a team and revoke one without kicking the other two
 *                 operators out.
 */

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 1);
const SECRET = process.env.JWT_SECRET;

if (!SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production.');
}
const EFFECTIVE_SECRET = SECRET || 'cit404-dev-secret-do-not-use-in-production';

function signAccessToken(payload) {
    return jwt.sign(payload, EFFECTIVE_SECRET, {
        expiresIn: ACCESS_TTL,
        issuer: 'cit404',
    });
}

function verifyAccessToken(token) {
    return jwt.verify(token, EFFECTIVE_SECRET, { issuer: 'cit404' });
}

function generateRefreshToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashRefreshToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshExpiry() {
    return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Creates a session row and returns the raw refresh token (shown once). */
async function createSession({ subjectType, teamId = null, adminId = null, operatorId = null, req }) {
    const raw = generateRefreshToken();
    const { rows } = await db.query(
        `INSERT INTO sessions
           (subject_type, team_id, admin_id, operator_id,
            refresh_token_hash, user_agent, ip, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
            subjectType, teamId, adminId, operatorId,
            hashRefreshToken(raw),
            req.get('user-agent') || null,
            req.ip || null,
            refreshExpiry(),
        ]
    );
    return { sessionId: rows[0].id, refreshToken: raw };
}

/** Looks up a live session by raw refresh token. Returns null if unusable. */
async function findSession(rawToken) {
    if (!rawToken) return null;
    const { rows } = await db.query(
        `SELECT * FROM sessions
          WHERE refresh_token_hash = $1
            AND revoked_at IS NULL
            AND expires_at > NOW()`,
        [hashRefreshToken(rawToken)]
    );
    return rows[0] || null;
}

/**
 * Rotates a refresh token: the old one is revoked the moment a new one is
 * issued, so a stolen cookie is only good until the real device refreshes.
 */
async function rotateSession(session, req) {
    const raw = generateRefreshToken();
    await db.query(
        `UPDATE sessions
            SET refresh_token_hash = $1, expires_at = $2, user_agent = $3, ip = $4
          WHERE id = $5`,
        [hashRefreshToken(raw), refreshExpiry(), req.get('user-agent') || null, req.ip || null, session.id]
    );
    return raw;
}

async function revokeSession(rawToken) {
    if (!rawToken) return;
    await db.query(
        `UPDATE sessions SET revoked_at = NOW()
          WHERE refresh_token_hash = $1 AND revoked_at IS NULL`,
        [hashRefreshToken(rawToken)]
    );
}

const REFRESH_COOKIE = 'cit404_rt';

function refreshCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/api/auth',
        maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    };
}

module.exports = {
    signAccessToken,
    verifyAccessToken,
    createSession,
    findSession,
    rotateSession,
    revokeSession,
    hashRefreshToken,
    REFRESH_COOKIE,
    refreshCookieOptions,
};
