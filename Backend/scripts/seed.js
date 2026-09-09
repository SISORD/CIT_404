#!/usr/bin/env node
/**
 * Creates the 12 teams, their join codes, an admin account and a starter
 * set of challenges. Join codes and flags are hashed on the way in, so
 * this script prints them once and they are unrecoverable afterwards.
 *
 *   node scripts/seed.js
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db_config');
require('dotenv').config();

const TEAM_COUNT = Number(process.env.SEED_TEAM_COUNT || 12);
const STARTING_BALANCE = Number(process.env.SEED_STARTING_BALANCE || 150);

/** Human-typable code: no 0/O/1/I ambiguity, 8 characters. */
function joinCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.randomBytes(8))
        .map((b) => alphabet[b % alphabet.length])
        .join('');
}

const CHALLENGES = [
    ['CP-01',  'CP',   1,  50,  'Base Case',           'Return the nth term of the recovery sequence.',        'CIT{r3curs10n_r3st0r3d}'],
    ['CP-02',  'CP',   2,  90,  'Corrupted Sort',      'Reorder the fragmented index without losing entries.', 'CIT{st4bl3_s0rt}'],
    ['CP-03',  'CP',   3, 150,  'Shortest Path Home',  'Find the cheapest route across the dead nodes.',       'CIT{d1jkstr4_l1v3s}'],
    ['CP-04',  'CP',   4, 220,  'Memory Leak',         'Reconstruct the allocation table from the dump.',      'CIT{h34p_r3p41r3d}'],
    ['CTF-01', 'CTF',  1,  60,  'Plaintext Ghost',     'Something was left in the response headers.',          'CIT{h34d3rs_t3ll_4ll}'],
    ['CTF-02', 'CTF',  2, 110,  'Rotten Cookie',       'The session cookie is not what it claims to be.',      'CIT{b4s364_1s_n0t_3ncrypt10n}'],
    ['CTF-03', 'CTF',  3, 180,  'Injected Archive',    'The archive query trusts you too much.',               'CIT{un10n_s3l3ct_tru7h}'],
    ['CTF-04', 'CTF',  5, 350,  'Core Dump',           'The final fragment hides inside the binary.',          'CIT{th3_c0r3_w4s_n3v3r_l0st}'],
    ['DATA-01','DATA', 1,  55,  'Signal Noise',        'How many transmissions were lost between 09:00-09:05?','CIT{f1v3_m1nut3s}'],
    ['DATA-02','DATA', 2, 100,  'Anomaly Pattern',     'Identify the sector that failed first.',               'CIT{s3ct0r_7}'],
    ['DATA-03','DATA', 3, 160,  'Ghost Operator',      'One account acted after the shutdown. Which one?',     'CIT{0p3r4t0r_z3r0}'],
    ['DATA-04','DATA', 4, 240,  'Crash Authorization', 'Who signed the shutdown order?',                       'CIT{4uth0r1z3d_by_th3_c0r3}'],
];

async function main() {
    console.log('\n=== CIT: 404 - SEEDING THE NETWORK ===\n');

    // --- Admin -------------------------------------------------------
    const adminUser = process.env.SEED_ADMIN_USER || 'core_admin';
    const adminPass = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    await db.query(
        `INSERT INTO admins (username, password_hash, role)
         VALUES ($1, $2, 'superadmin')
         ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [adminUser, await bcrypt.hash(adminPass, 12)]
    );
    console.log('ADMIN ACCOUNT');
    console.log(`  username : ${adminUser}`);
    console.log(`  password : ${adminPass}`);
    console.log('  (shown once - store it now)\n');

    // --- Teams -------------------------------------------------------
    console.log('TEAM JOIN CODES');
    const codes = [];
    for (let i = 1; i <= TEAM_COUNT; i++) {
        const name = `TEAM ${i}`;
        const code = joinCode();
        const { rows } = await db.query(
            `INSERT INTO teams (team_name, join_code_hash, cit_balance)
             VALUES ($1, $2, $3)
             ON CONFLICT (team_name) DO UPDATE SET join_code_hash = EXCLUDED.join_code_hash
             RETURNING id, cit_balance`,
            [name, await bcrypt.hash(code, 10), STARTING_BALANCE]
        );

        // The starting balance is a ledger event like any other, so the
        // journal always sums to the wallet.
        await db.query(
            `INSERT INTO ledger (team_id, kind, amount, balance_after, note)
             SELECT $1, 'SEED', $2, $2, 'Initial Recovery Protocol allocation'
              WHERE NOT EXISTS (SELECT 1 FROM ledger WHERE team_id = $1 AND kind = 'SEED')`,
            [rows[0].id, STARTING_BALANCE]
        );

        codes.push(`  ${name.padEnd(8)} : ${code}`);
    }
    console.log(codes.join('\n'));
    console.log('  (shown once - print and hand out)\n');

    // --- Challenges --------------------------------------------------
    for (const [code, category, difficulty, reward, title, description, flag] of CHALLENGES) {
        await db.query(
            `INSERT INTO challenges (code, category, difficulty, reward, title, description, flag_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (code) DO UPDATE SET
                 category = EXCLUDED.category, difficulty = EXCLUDED.difficulty,
                 reward = EXCLUDED.reward, title = EXCLUDED.title,
                 description = EXCLUDED.description, flag_hash = EXCLUDED.flag_hash`,
            [code, category, difficulty, reward, title, description, await bcrypt.hash(flag, 10)]
        );
    }
    console.log(`CHALLENGES : ${CHALLENGES.length} loaded (flags hashed)\n`);
    console.log('Flags for the answer key:');
    CHALLENGES.forEach(([code, , , , , , flag]) => console.log(`  ${code.padEnd(8)} : ${flag}`));

    console.log('\n=== RECOVERY PROTOCOL READY ===\n');
    await db.pool.end();
}

main().catch((err) => {
    console.error('SEED FAILED:', err);
    process.exit(1);
});
