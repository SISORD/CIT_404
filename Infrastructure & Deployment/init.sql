-- =====================================================================
--  CIT: 404 - RECOVERY PROTOCOL : SCHEMA
--  PostgreSQL 14+
--
--  Principe directeur : le LEDGER (journal) est la source de verite.
--  team_inventory et teams.cit_balance ne sont que des PROJECTIONS,
--  recalculables a tout moment depuis le ledger. Cela donne a la
--  plateforme admin un audit complet : qui a achete quoi, quand,
--  pour combien, et quel etait le solde apres l'operation.
-- =====================================================================

DROP VIEW  IF EXISTS v_leaderboard        CASCADE;
DROP VIEW  IF EXISTS v_item_popularity    CASCADE;
DROP VIEW  IF EXISTS v_team_items         CASCADE;
DROP VIEW  IF EXISTS v_team_stats         CASCADE;
DROP TABLE IF EXISTS ledger               CASCADE;
DROP TABLE IF EXISTS submissions          CASCADE;
DROP TABLE IF EXISTS team_inventory       CASCADE;
DROP TABLE IF EXISTS team_missions        CASCADE;
DROP TABLE IF EXISTS sessions             CASCADE;
DROP TABLE IF EXISTS operators            CASCADE;
DROP TABLE IF EXISTS admins               CASCADE;
DROP TABLE IF EXISTS items                CASCADE;
DROP TABLE IF EXISTS missions             CASCADE;
DROP TABLE IF EXISTS challenges           CASCADE;
DROP TABLE IF EXISTS teams                CASCADE;
DROP TABLE IF EXISTS game_state           CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1. EQUIPES - un compte partage par 3 operateurs
-- ---------------------------------------------------------------------
CREATE TABLE teams (
    id             SERIAL PRIMARY KEY,
    team_name      VARCHAR(64) UNIQUE NOT NULL,
    -- Code d'acces partage par les 3 operateurs de l'equipe.
    -- Stocke HASHE (bcrypt) : jamais en clair en base.
    join_code_hash TEXT        NOT NULL,
    -- Projection : recalculable via SUM(ledger.amount)
    cit_balance    INTEGER     NOT NULL DEFAULT 0 CHECK (cit_balance >= 0),
    core_energy    INTEGER     NOT NULL DEFAULT 0,
    is_locked      BOOLEAN     NOT NULL DEFAULT FALSE,  -- gel admin / fin de phase
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 2. OPERATEURS - les 3 personnes derriere un compte equipe.
--    Sert a l'attribution ("qui a soumis ce flag ?"), pas a
--    l'authentification : c'est l'equipe qui s'authentifie.
-- ---------------------------------------------------------------------
CREATE TABLE operators (
    id         SERIAL PRIMARY KEY,
    team_id    INTEGER     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    nickname   VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, nickname)
);

-- ---------------------------------------------------------------------
-- 3. ADMINS - plateforme de supervision
-- ---------------------------------------------------------------------
CREATE TABLE admins (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(64) UNIQUE NOT NULL,
    password_hash TEXT        NOT NULL,   -- bcrypt / argon2id
    role          VARCHAR(16) NOT NULL DEFAULT 'admin'
                  CHECK (role IN ('admin', 'superadmin')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 4. SESSIONS - refresh tokens revocables (un par appareil)
--    Permet a l'admin de voir "3 appareils connectes sur Team 7"
--    et de revoquer un appareil partage hors equipe.
-- ---------------------------------------------------------------------
CREATE TABLE sessions (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type       VARCHAR(16) NOT NULL CHECK (subject_type IN ('team','admin')),
    team_id            INTEGER     REFERENCES teams(id)     ON DELETE CASCADE,
    admin_id           INTEGER     REFERENCES admins(id)    ON DELETE CASCADE,
    operator_id        INTEGER     REFERENCES operators(id) ON DELETE SET NULL,
    refresh_token_hash TEXT        NOT NULL,      -- SHA-256 du refresh token
    user_agent         TEXT,
    ip                 TEXT,
    expires_at         TIMESTAMPTZ NOT NULL,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (subject_type = 'team'  AND team_id  IS NOT NULL AND admin_id IS NULL) OR
        (subject_type = 'admin' AND admin_id IS NOT NULL AND team_id  IS NULL)
    )
);
CREATE INDEX idx_sessions_lookup ON sessions (refresh_token_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_team   ON sessions (team_id)            WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------
-- 5. PHASE I - Digital Arena
-- ---------------------------------------------------------------------
CREATE TABLE challenges (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(32)  UNIQUE NOT NULL,  -- 'CP-01', 'CTF-04'...
    category    VARCHAR(8)   NOT NULL CHECK (category IN ('CP','CTF','DATA')),
    difficulty  SMALLINT     NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
    reward      INTEGER      NOT NULL CHECK (reward > 0),
    title       VARCHAR(128) NOT NULL,
    description TEXT,
    -- Le flag est HASHE : un dump de la base ne donne pas les reponses.
    flag_hash   TEXT         NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Chaque tentative, bonne ou mauvaise. Alimente les stats admin
-- (taux de reussite par challenge, detection de brute-force).
CREATE TABLE submissions (
    id           BIGSERIAL PRIMARY KEY,
    team_id      INTEGER     NOT NULL REFERENCES teams(id)      ON DELETE CASCADE,
    challenge_id INTEGER     NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    operator_id  INTEGER     REFERENCES operators(id) ON DELETE SET NULL,
    is_correct   BOOLEAN     NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Une equipe ne peut valider un challenge qu'une seule fois.
CREATE UNIQUE INDEX idx_one_solve_per_team
    ON submissions (team_id, challenge_id) WHERE is_correct;
CREATE INDEX idx_submissions_team ON submissions (team_id, submitted_at DESC);

-- ---------------------------------------------------------------------
-- 6. PHASE II - Field Missions
-- ---------------------------------------------------------------------
CREATE TABLE missions (
    id               SERIAL PRIMARY KEY,
    code             VARCHAR(32)  UNIQUE NOT NULL,   -- 'SIGNAL_LOST'
    mission_name     VARCHAR(128) NOT NULL,
    entry_cost       INTEGER  NOT NULL CHECK (entry_cost >= 0),
    difficulty_stars SMALLINT NOT NULL CHECK (difficulty_stars BETWEEN 1 AND 5),
    reward           INTEGER  NOT NULL,
    core_energy      INTEGER  NOT NULL DEFAULT 10,
    time_limit_min   INTEGER,
    description      TEXT     NOT NULL,
    -- Items requis pour acheter la mission : ARRAY['ACCESS_COORD']
    required_items   TEXT[]   NOT NULL DEFAULT '{}',
    capacity         INTEGER,          -- NULL = illimite
    is_active        BOOLEAN  NOT NULL DEFAULT TRUE
);

CREATE TABLE team_missions (
    id            BIGSERIAL PRIMARY KEY,
    team_id       INTEGER     NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
    mission_id    INTEGER     NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    status        VARCHAR(16) NOT NULL DEFAULT 'PURCHASED'
                  CHECK (status IN ('PURCHASED','COMPLETED','FAILED','REFUNDED')),
    has_insurance BOOLEAN     NOT NULL DEFAULT FALSE,
    paid_amount   INTEGER     NOT NULL,
    purchased_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at   TIMESTAMPTZ,
    resolved_at   TIMESTAMPTZ,
    resolved_by   INTEGER     REFERENCES admins(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX idx_one_active_purchase
    ON team_missions (team_id, mission_id)
    WHERE status IN ('PURCHASED','COMPLETED');

-- =====================================================================
--  7. LES ITEMS - reponse a "ou stocker l'item de chaque equipe ?"
-- =====================================================================

-- 7a. CATALOGUE : la definition d'un item, partagee par tout le monde.
--     Modifiable par l'admin sans redeploiement.
CREATE TABLE items (
    id            SERIAL PRIMARY KEY,
    code          VARCHAR(32) UNIQUE NOT NULL,   -- 'BOOST_TIME', 'HINT_L2'
    name          VARCHAR(64) NOT NULL,
    item_type     VARCHAR(16) NOT NULL
                  CHECK (item_type IN ('HINT','INSURANCE','BOOST','ACCESS')),
    cost          INTEGER     NOT NULL CHECK (cost >= 0),
    icon          VARCHAR(24) NOT NULL DEFAULT 'package',
    effect        TEXT        NOT NULL,
    -- Parametres libres de l'effet, sans migration de schema :
    -- {"minutes":15} pour un Time Boost, {"multiplier":2} pour Double Reward
    payload       JSONB       NOT NULL DEFAULT '{}',
    is_consumable BOOLEAN     NOT NULL DEFAULT TRUE,
    max_per_team  INTEGER,          -- NULL = pas de limite
    stock         INTEGER,          -- NULL = stock infini
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE
);

-- 7b. INVENTAIRE : l'etat COURANT de chaque equipe.
--     Une ligne par (equipe, item). C'est ce que lit le front pour
--     afficher le panneau INVENTORY -> une seule requete indexee.
CREATE TABLE team_inventory (
    team_id         INTEGER     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    item_id         INTEGER     NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity        INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    total_bought    INTEGER     NOT NULL DEFAULT 0,   -- cumul historique
    total_used      INTEGER     NOT NULL DEFAULT 0,
    first_bought_at TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, item_id)
);
CREATE INDEX idx_inventory_item ON team_inventory (item_id);

-- 7c. LEDGER : journal append-only de TOUT mouvement de CIT$ et d'item.
--     Jamais d'UPDATE, jamais de DELETE. Source de verite et matiere
--     premiere des statistiques admin.
CREATE TABLE ledger (
    id            BIGSERIAL PRIMARY KEY,
    team_id       INTEGER     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    operator_id   INTEGER     REFERENCES operators(id) ON DELETE SET NULL,
    kind          VARCHAR(24) NOT NULL CHECK (kind IN (
                      'CHALLENGE_REWARD','ITEM_PURCHASE','ITEM_USE',
                      'MISSION_PURCHASE','MISSION_REWARD','INSURANCE_REFUND',
                      'ADMIN_ADJUST','SEED'
                  )),
    -- Signe : positif = credit, negatif = debit. 0 pour un ITEM_USE.
    amount        INTEGER     NOT NULL,
    balance_after INTEGER     NOT NULL,   -- snapshot -> audit trivial
    item_id       INTEGER     REFERENCES items(id)      ON DELETE SET NULL,
    challenge_id  INTEGER     REFERENCES challenges(id) ON DELETE SET NULL,
    mission_id    INTEGER     REFERENCES missions(id)   ON DELETE SET NULL,
    admin_id      INTEGER     REFERENCES admins(id)     ON DELETE SET NULL,
    quantity      INTEGER     NOT NULL DEFAULT 1,
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ledger_team ON ledger (team_id, created_at DESC);
CREATE INDEX idx_ledger_kind ON ledger (kind, created_at DESC);
CREATE INDEX idx_ledger_feed ON ledger (created_at DESC);

-- ---------------------------------------------------------------------
-- 8. ETAT GLOBAL DU JEU - pilote par l'admin (une seule ligne)
-- ---------------------------------------------------------------------
CREATE TABLE game_state (
    id            SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    phase         VARCHAR(16) NOT NULL DEFAULT 'LOBBY'
                  CHECK (phase IN ('LOBBY','PHASE_I','PHASE_II','ENDGAME','CLOSED')),
    phase_ends_at TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO game_state (id, phase) VALUES (1, 'LOBBY');

-- =====================================================================
--  VUES POUR LA PLATEFORME ADMIN
-- =====================================================================

-- Tableau de bord : une ligne par equipe, toutes les stats agregees.
CREATE VIEW v_team_stats AS
SELECT
    t.id,
    t.team_name,
    t.cit_balance,
    t.core_energy,
    t.is_locked,
    COALESCE(s.solved_cp,   0) AS solved_cp,
    COALESCE(s.solved_ctf,  0) AS solved_ctf,
    COALESCE(s.solved_data, 0) AS solved_data,
    COALESCE(s.attempts,    0) AS total_attempts,
    COALESCE(s.wrong,       0) AS wrong_attempts,
    COALESCE(m.missions_bought,    0) AS missions_bought,
    COALESCE(m.missions_completed, 0) AS missions_completed,
    COALESCE(m.missions_failed,    0) AS missions_failed,
    COALESCE(i.items_held,   0) AS items_held,
    COALESCE(i.items_bought, 0) AS items_bought,
    COALESCE(l.earned,       0) AS total_earned,
    COALESCE(l.spent,        0) AS total_spent,
    l.last_activity_at,
    COALESCE(o.operator_count, 0) AS operator_count
FROM teams t
LEFT JOIN (
    SELECT sub.team_id,
           COUNT(*) FILTER (WHERE sub.is_correct AND c.category = 'CP')   AS solved_cp,
           COUNT(*) FILTER (WHERE sub.is_correct AND c.category = 'CTF')  AS solved_ctf,
           COUNT(*) FILTER (WHERE sub.is_correct AND c.category = 'DATA') AS solved_data,
           COUNT(*)                                   AS attempts,
           COUNT(*) FILTER (WHERE NOT sub.is_correct) AS wrong
    FROM submissions sub
    JOIN challenges c ON c.id = sub.challenge_id
    GROUP BY sub.team_id
) s ON s.team_id = t.id
LEFT JOIN (
    SELECT team_id,
           COUNT(*)                                    AS missions_bought,
           COUNT(*) FILTER (WHERE status = 'COMPLETED') AS missions_completed,
           COUNT(*) FILTER (WHERE status = 'FAILED')    AS missions_failed
    FROM team_missions GROUP BY team_id
) m ON m.team_id = t.id
LEFT JOIN (
    SELECT team_id,
           SUM(quantity)     AS items_held,
           SUM(total_bought) AS items_bought
    FROM team_inventory GROUP BY team_id
) i ON i.team_id = t.id
LEFT JOIN (
    SELECT team_id,
           SUM(amount) FILTER (WHERE amount > 0)  AS earned,
           -SUM(amount) FILTER (WHERE amount < 0) AS spent,
           MAX(created_at)                        AS last_activity_at
    FROM ledger GROUP BY team_id
) l ON l.team_id = t.id
LEFT JOIN (
    SELECT team_id, COUNT(*) AS operator_count FROM operators GROUP BY team_id
) o ON o.team_id = t.id;

-- Inventaire lisible : "quel item possede chaque equipe ?"
CREATE VIEW v_team_items AS
SELECT ti.team_id, t.team_name,
       i.id AS item_id, i.code, i.name, i.item_type, i.icon, i.cost,
       ti.quantity, ti.total_bought, ti.total_used, ti.updated_at
FROM team_inventory ti
JOIN items i ON i.id = ti.item_id
JOIN teams t ON t.id = ti.team_id;

-- Popularite des items, toutes equipes confondues.
CREATE VIEW v_item_popularity AS
SELECT i.id, i.code, i.name, i.item_type, i.cost,
       COALESCE(SUM(ti.total_bought), 0)                    AS units_sold,
       COALESCE(SUM(ti.total_bought), 0) * i.cost           AS revenue,
       COUNT(ti.team_id) FILTER (WHERE ti.total_bought > 0) AS teams_owning
FROM items i
LEFT JOIN team_inventory ti ON ti.item_id = i.id
GROUP BY i.id;

-- Classement live.
CREATE VIEW v_leaderboard AS
SELECT id, team_name, cit_balance, core_energy,
       solved_cp + solved_ctf + solved_data AS total_solved,
       missions_completed, total_earned,
       RANK() OVER (ORDER BY core_energy DESC, total_earned DESC) AS rank
FROM v_team_stats;
