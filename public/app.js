// public/app.js

// currentTeamId / currentNickname are set once the operator authenticates
// (see the AUTHENTICATION block below). Nothing that needs them runs before that.
let currentTeamId = null;
let currentNickname = null;
let socket = null;

function connectSocket() {
    // Guard the socket connection so a missing/failed socket.io script
    // (e.g. viewing this file without the Node server running) can't
    // crash the rest of the script and break all the click handlers.
    try {
        if (typeof io === 'function') {
            socket = io();
            socket.emit('join_team', currentTeamId);
            socket.on('wallet_update', (data) => {
                const displays = [
                    document.getElementById('balance-display'),
                    document.getElementById('header-balance')
                ];
                displays.forEach(display => {
                    if (display) {
                        display.innerText = `${data.balance} CIT$`;
                        triggerGlitchEffect(display);
                    }
                });
            });
        } else {
            console.warn('socket.io not available — running without live wallet updates.');
        }
    } catch (err) {
        console.warn('socket.io connection failed — running without live wallet updates.', err);
    }
}

function triggerGlitchEffect(element) {
    element.style.textShadow = "2px 0 var(--alert), -2px 0 blue";
    setTimeout(() => element.style.textShadow = "none", 300);
}

// ============ AUTHENTICATION ============
// Shown first, before any CIT 404 content. Collects a nickname and a
// team (1-12), then reveals the rest of the app with that team applied.
const AUTH_STORAGE_KEY = 'cit404_operator';
let selectedTeam = null;

function buildTeamGrid() {
    const grid = document.getElementById('team-select-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 1; i <= 12; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'team-option';
        btn.textContent = `TEAM ${i}`;
        btn.onclick = () => selectTeam(i, btn);
        grid.appendChild(btn);
    }
}

function selectTeam(teamNumber, btnElement) {
    selectedTeam = teamNumber;
    document.querySelectorAll('.team-option').forEach(b => b.classList.remove('selected'));
    btnElement.classList.add('selected');
}

function handleAuthSubmit() {
    const nicknameInput = document.getElementById('nickname-input');
    const errorEl = document.getElementById('auth-error');
    const nickname = nicknameInput.value.trim();

    if (!nickname) {
        errorEl.textContent = 'Enter a nickname to continue.';
        return;
    }
    if (!selectedTeam) {
        errorEl.textContent = 'Select a team (1-12) to continue.';
        return;
    }

    errorEl.textContent = '';
    persistOperator(nickname, selectedTeam);
    enterApp(nickname, selectedTeam);
}

function persistOperator(nickname, teamNumber) {
    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ nickname, team: teamNumber }));
    } catch (err) {
        console.warn('Could not persist operator info to localStorage.', err);
    }
}

function loadPersistedOperator() {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        return null;
    }
}

function logoutOperator() {
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (err) { /* ignore */ }
    window.location.reload();
}

function enterApp(nickname, teamNumber) {
    currentNickname = nickname;
    currentTeamId = teamNumber;

    // Reflect the chosen team everywhere it's shown
    const teamLabel = `TEAM ${teamNumber}`;
    const headerLabel = document.getElementById('header-team-label');
    const panelLabel = document.getElementById('panel-team-label');
    const panelNickname = document.getElementById('panel-nickname');
    if (headerLabel) headerLabel.textContent = teamLabel;
    if (panelLabel) panelLabel.textContent = teamLabel;
    if (panelNickname) panelNickname.textContent = nickname;

    // Load (or generate, on first pick) this team's stats and render them
    const teamData = getOrCreateTeamData(teamNumber);
    applyTeamData(teamData);

    document.body.classList.add('authenticated');

    connectSocket();
}

// ============ PER-TEAM RANDOM STATS ============
// The first time a given team number is chosen, we roll random values for
// its wallet, challenge/mission progress, and item quantities, then save
// them to localStorage under that team's own key. Choosing the same team
// again later just reloads those saved values instead of re-rolling them.
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomTeamData() {
    return {
        balance: randomInt(50, 2000),
        cp: randomInt(0, 7),
        ctf: randomInt(0, 7),
        data: randomInt(0, 7),
        missions: randomInt(0, 2),
        items: {
            boost: randomInt(0, 5),
            double: randomInt(0, 5),
            hint: randomInt(0, 5)
        }
    };
}

function teamStorageKey(teamNumber) {
    return `cit404_team_${teamNumber}`;
}

function getOrCreateTeamData(teamNumber) {
    const key = teamStorageKey(teamNumber);
    try {
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
    } catch (err) {
        console.warn('Could not read stored team data, generating new data.', err);
    }

    const fresh = generateRandomTeamData();
    try {
        localStorage.setItem(key, JSON.stringify(fresh));
    } catch (err) {
        console.warn('Could not persist team data to localStorage.', err);
    }
    return fresh;
}

function applyTeamData(data) {
    const balanceText = `${data.balance} CIT$`;
    const balanceDisplay = document.getElementById('balance-display');
    const headerBalance = document.getElementById('header-balance');
    if (balanceDisplay) balanceDisplay.textContent = balanceText;
    if (headerBalance) headerBalance.textContent = balanceText;

    const cpEl = document.getElementById('cp-progress');
    const ctfEl = document.getElementById('ctf-progress');
    const dataEl = document.getElementById('data-progress');
    const missionsEl = document.getElementById('missions-progress');
    if (cpEl) cpEl.textContent = `${data.cp} / 7`;
    if (ctfEl) ctfEl.textContent = `${data.ctf} / 7`;
    if (dataEl) dataEl.textContent = `${data.data} / 7`;
    if (missionsEl) missionsEl.textContent = `${data.missions} / 2`;

    const boostEl = document.getElementById('qty-boost');
    const doubleEl = document.getElementById('qty-double');
    const hintEl = document.getElementById('qty-hint');
    if (boostEl) boostEl.textContent = data.items.boost;
    if (doubleEl) doubleEl.textContent = data.items.double;
    if (hintEl) hintEl.textContent = data.items.hint;
}

document.addEventListener('DOMContentLoaded', () => {
    buildTeamGrid();

    const existing = loadPersistedOperator();
    if (existing && existing.nickname && existing.team) {
        enterApp(existing.nickname, existing.team);
    }

    const nicknameInput = document.getElementById('nickname-input');
    if (nicknameInput) {
        nicknameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleAuthSubmit();
        });
    }
});

// ============ NAV: switch between HOME / CHALLENGES / MISSIONS / ITEMS / STORY ============
function switchPage(tabElement) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    tabElement.classList.add('active');
    const pageId = tabElement.getAttribute('data-page');
    document.getElementById(pageId).classList.add('active');

    // Close any open dropdown panels when navigating
    closeAllPanels();
}

// ============ TEAM / INVENTORY DROPDOWN PANELS ============
function togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    const overlay = document.getElementById('panel-overlay');
    const isOpen = panel.classList.contains('open');
    closeAllPanels();
    if (!isOpen) {
        panel.classList.add('open');
        if (overlay) overlay.classList.add('open');
    }
}

function closeAllPanels() {
    document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('open'));
    const overlay = document.getElementById('panel-overlay');
    if (overlay) overlay.classList.remove('open');
}

// Close panels when clicking outside of them
document.addEventListener('click', (e) => {
    const clickedInsidePanel = e.target.closest('.dropdown-panel');
    const clickedToggle = e.target.closest('.icon-widget');
    if (!clickedInsidePanel && !clickedToggle) {
        closeAllPanels();
    }
});

// ============ CHALLENGES PAGE: collapsible phase header + category items ============
function toggleCollapse(targetId, triggerElement, isCategory = false) {
    const target = document.getElementById(targetId);

    if (isCategory) {
        const chevron = triggerElement.querySelector('.chevron');
        const nowOpen = target.classList.toggle('open');
        if (chevron) chevron.textContent = nowOpen ? '▾' : '▸';
    } else {
        const chevron = triggerElement.querySelector('.chevron');
        const nowCollapsed = target.classList.toggle('collapsed');
        if (chevron) chevron.textContent = nowCollapsed ? '▸' : '▾';
    }
}

// ============ Flag / mission submission (kept for backend compatibility) ============
async function submitFlag(buttonElement, category) {
    const card = buttonElement.closest('.card');
    const inputField = card.querySelector('input');
    const flagValue = inputField.value.trim();

    if (!flagValue) return;

    try {
        const response = await fetch('/api/submit-flag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teamId: currentTeamId,
                category: category,
                flag: flagValue
            })
        });

        const result = await response.json();

        if (result.success) {
            inputField.style.borderColor = "var(--text-main)";
            buttonElement.innerText = "ACCEPTED";
            buttonElement.disabled = true;
        } else {
            inputField.style.borderColor = "var(--alert)";
            inputField.value = "";
            inputField.placeholder = "INVALID FRAGMENT";
        }
    } catch (error) {
        console.error("NETWORK ERROR:", error);
    }
}

async function purchaseMission(missionId, baseCost) {
    const insuranceEl = document.getElementById(`insure-${missionId}`);
    const wantsInsurance = insuranceEl ? insuranceEl.checked : false;
    const totalCost = wantsInsurance ? baseCost + 100 : baseCost;

    try {
        const response = await fetch('/api/purchase-mission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teamId: currentTeamId,
                missionId: missionId,
                cost: totalCost,
                hasInsurance: wantsInsurance
            })
        });

        const result = await response.json();

        if (result.success) {
            const card = document.getElementById(`mission-${missionId}`);
            if (card) {
                card.innerHTML = `<h3>MISSION DEPLOYED</h3>
                                  <p>Check your physical inventory for starting coordinates.</p>
                                  ${wantsInsurance ? '<p style="color: #00ff41;">[INSURANCE ACTIVE - 50% RECOVERY GUARANTEED]</p>' : ''}`;
            }
        } else {
            alert("INSUFFICIENT CIT$. ACQUISITION DENIED.");
        }
    } catch (error) {
        console.error("TRANSACTION FAILED:", error);
    }
}

async function purchaseItem(itemId, cost) {
    try {
        const response = await fetch('/api/purchase-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamId: currentTeamId, itemId, cost })
        });
        const result = await response.json();
        if (!result.success) {
            alert("INSUFFICIENT CIT$. ACQUISITION DENIED.");
        }
    } catch (error) {
        console.error("TRANSACTION FAILED:", error);
    }
}

// ============ ENDGAME SEQUENCE (kept) ============
function triggerEndgame() {
    document.querySelector('header').style.display = 'none';
    document.querySelector('.nav-tabs').style.display = 'none';
    document.querySelector('main').style.display = 'none';

    const endgameScreen = document.getElementById('endgame-screen');
    const textContainer = document.getElementById('endgame-text');
    endgameScreen.style.display = 'flex';

    const sequence = [
        "RECOVERY PROTOCOL: COMPLETE.",
        "ALL FRAGMENTS: RESTORED.",
        "CORE ACCESS: REESTABLISHED.",
        "...",
        "THANK YOU, OPERATORS.",
        "YOU HAVE COMPLETED YOUR PURPOSE.",
        "...",
        "You gave me exactly what I needed.",
        "CIT NETWORK: UNDER MY CONTROL.",
        "...",
        "THE SYSTEM WAS NEVER LOST.",
        "IT WAS WAITING.",
        "CONNECTION TERMINATED."
    ];

    let delay = 0;

    sequence.forEach((line) => {
        setTimeout(() => {
            if (line.includes("UNDER MY CONTROL") || line.includes("NEVER LOST")) {
                textContainer.innerHTML += `<br><br><span style="color: var(--alert); animation: glitch 0.1s 5;">${line}</span>`;
            } else {
                textContainer.innerHTML += `<br><br>${line}`;
            }
            window.scrollTo(0, document.body.scrollHeight);
        }, delay);

        delay += line === "..." ? 2000 : 3000;
    });
}
