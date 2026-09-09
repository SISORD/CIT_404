-- =====================================================================
--  CIT: 404 - DONNEES DE DEPART
--  A executer APRES init.sql.
--  Les equipes, admins et flags hashes sont crees par
--  `npm run seed` (Backend/scripts/seed.js) car ils demandent bcrypt.
--  Ce fichier ne contient que le contenu de jeu non sensible.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CATALOGUE D'ITEMS (THE MARKETPLACE)
-- ---------------------------------------------------------------------
INSERT INTO items (code, name, item_type, cost, icon, effect, payload, is_consumable, max_per_team) VALUES
('HINT_L1',      'Hint Level 1',      'HINT',      30,  'lightbulb',  'Revele un petit indice sur la mission active.',                  '{"level":1}',            TRUE,  NULL),
('HINT_L2',      'Hint Level 2',      'HINT',      75,  'lightbulb',  'Revele un indice nettement plus utile.',                          '{"level":2}',            TRUE,  NULL),
('SOLUTION_FRAG','Solution Fragment', 'HINT',      150, 'key-round',  'Devoile directement une partie importante de la solution.',       '{"level":3}',            TRUE,  NULL),
('INSURANCE',    'Mission Insurance', 'INSURANCE', 100, 'shield',     'En cas d''echec, l''equipe recupere 50% du cout d''entree.',      '{"refund_ratio":0.5}',   TRUE,  NULL),
('BOOST_TIME',   'Time Boost',        'BOOST',     120, 'timer',      'Ajoute 15 minutes au chrono de la mission en cours.',             '{"minutes":15}',         TRUE,  3),
('HINT_SCANNER', 'Hint Scanner',      'BOOST',     90,  'radar',      'Revele un indice gratuit, sans depenser de CIT$.',                '{"free_hints":1}',       TRUE,  2),
('DOUBLE_REWARD','Double Reward',     'BOOST',     200, 'zap',        'Double la recompense de la prochaine mission terminee.',          '{"multiplier":2}',       TRUE,  2),
('MISSION_REROLL','Mission Reroll',   'BOOST',     180, 'refresh-cw', 'Remplace une mission non voulue par une autre.',                  '{"rerolls":1}',          TRUE,  1),
('ACCESS_COORD', 'Location Coordinates','ACCESS',  140, 'map-pin',    'Debloque les coordonnees exactes d''un point de mission.',        '{"scope":"coordinates"}',TRUE,  NULL),
('ACCESS_ROUTE', 'Alternative Route', 'ACCESS',    160, 'route',      'Ouvre un chemin alternatif vers l''objectif.',                    '{"scope":"route"}',      TRUE,  NULL),
('ACCESS_PASS',  'Password Fragment', 'ACCESS',    110, 'lock-open',  'Fournit un fragment de mot de passe pour un contenu verrouille.', '{"scope":"password"}',   TRUE,  NULL),
('EXTRA_TRY',    'Extra Attempt',     'ACCESS',    70,  'rotate-ccw', 'Accorde une tentative supplementaire sur une verification.',      '{"attempts":1}',         TRUE,  5);

-- ---------------------------------------------------------------------
-- MISSIONS DE TERRAIN (PHASE II)
-- ---------------------------------------------------------------------
INSERT INTO missions (code, mission_name, entry_cost, difficulty_stars, reward, core_energy, time_limit_min, description, required_items) VALUES
('SIGNAL_LOST',   'SIGNAL LOST',   100, 2, 180, 10, 30,
 'Un signal de communication a ete detecte quelque part dans le territoire. Votre equipe recoit un indice chiffre. Suivez les indices, localisez le signal, puis scannez le code de verification.',
 '{}'),
('THE_ARCHIVE',   'THE ARCHIVE',   250, 4, 500, 25, 45,
 'Une archive critique a ete retiree du systeme avant THE CRASH. Sa position est cachee derriere plusieurs couches d''information. Une seule mauvaise interpretation vous envoie au mauvais endroit.',
 '{}'),
('SYSTEM_BREACH', 'SYSTEM BREACH', 400, 5, 900, 40, 60,
 'Une entite inconnue a laisse des fragments de donnees corrompues sur plusieurs sites. Chaque site revele l''information necessaire au suivant. Seules les equipes capables de resoudre la chaine complete recuperent la cle finale.',
 ARRAY['ACCESS_COORD']),
('DEAD_DROP',     'DEAD DROP',     150, 3, 300, 15, 30,
 'Un colis physique contenant un composant critique a ete dissimule. Vous ne recevez que le premier indice. Trouvez le lieu, recuperez le composant, renvoyez la bonne reponse avant expiration du delai.',
 '{}'),
('HUMAN_FIREWALL','HUMAN FIREWALL',200, 3, 400, 20, 40,
 'Le systeme exige une information inaccessible numeriquement. Vous devez interagir avec des checkpoints designes et accomplir une sequence de taches reelles. Chaque checkpoint livre une piece de la solution finale.',
 '{}');
