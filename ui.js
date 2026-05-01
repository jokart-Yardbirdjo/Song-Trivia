/**
 * ==============================================================================
 * YARDBIRD'S GAMES - THE VIEW CONTROLLER (ui.js)
 * ==============================================================================
 * Role: Manages all DOM manipulation and screen state.
 * Responsibilities:
 * 1. Dynamically build the Setup Screen by reading a Cartridge's "manifest".
 * 2. Handle Asymmetric UI (hiding nav menus when a phone is a "Client Controller").
 * 3. Act as a "Bridge" for clicks: Update the visual state (active pills), 
 * then fire the corresponding hook inside the active Cartridge.
 * ==============================================================================
 */

import { state } from './state.js';

// ==========================================
// PHASE 1: MODAL MANAGEMENT
// ==========================================

/**
 * Toggles for the Settings, Rules, and Stats overlay modals.
 */
export function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
export function hideModal(id) { document.getElementById(id).classList.add('hidden'); }


// ==========================================
// PHASE 2: THE SETUP ENGINE (MANIFEST READER)
// ==========================================

/**
 * Dynamically constructs the setup lobby based on the plugged-in Cartridge's manifest.
 * @param {Object} manifest - The configuration object exported by the active game.
 */
export function buildSetupScreen(manifest) {
    document.getElementById('main-title').innerText = manifest.title;
    
    // Build Mode Selection Cards
    const modeGroup = document.getElementById('mode-group');
    modeGroup.innerHTML = ''; 
    manifest.modes.forEach((mode, index) => {
        const card = document.createElement('div');
        card.className = `select-card ${index === 0 ? 'active' : ''}`;
        card.onclick = () => window.setMode(mode.id, card); 
        card.innerHTML = `<div class="card-title">${mode.title}</div><div class="card-desc">${mode.desc}</div>`;
        modeGroup.appendChild(card);
    });

    // Build Difficulty Level Cards
    const levelGroup = document.getElementById('level-group');
    levelGroup.innerHTML = '';
    manifest.levels.forEach((lvl, index) => {
        const card = document.createElement('div');
        card.id = `lvl-${lvl.id}`; 
        card.className = `select-card ${index === 0 ? 'active' : ''}`;
        card.onclick = () => window.setLevel(lvl.id, card);
        card.innerHTML = `<div class="card-title">${lvl.title}</div><div class="card-desc">${lvl.desc}</div>`;
        levelGroup.appendChild(card);
    });

    // Reset visibility for standard setup areas
    document.getElementById('sub-selection-area').classList.add('hidden');
    document.getElementById('players-rounds-area').classList.remove('hidden');

    // Toggle the Daily Challenge button if the Cartridge supports it
    const dailyContainer = document.getElementById('daily-btn-top').parentElement;
    if (dailyContainer) dailyContainer.classList.toggle('hidden', !manifest.hasDaily);

    // Initializer: Force the UI to draw the sub-menu immediately on load
    if (modeGroup.firstChild) {
        window.setMode(manifest.modes[0].id, modeGroup.firstChild);
    } else {
        state.gameState.mode = manifest.modes[0].id;
    }
    state.gameState.level = manifest.levels[0].id;
}

/**
 * buildCartridgeMenu(registry)
 * ─────────────────────────────
 * Dynamically generates the horizontal Console menu by reading the 
 * manifests exported by each Cartridge module. 
 */
export function buildCartridgeMenu(registry) {
    const carousel = document.getElementById('cartridge-carousel');
    if (!carousel) return;

    carousel.innerHTML = '';

    registry.forEach(cart => {
        // Read the public metadata from the cartridge
        const manifest = cart.module.manifest;
        
        const card = document.createElement('div');
        card.className = 'cartridge-card';
        // Calls the global platform router when tapped
        card.onclick = () => { window.selectGame(manifest.id); }; 

        card.innerHTML = `
            <div style="font-size:3.5rem; margin-bottom:15px; filter: drop-shadow(0 0 15px rgba(255,255,255,0.1));">
                ${cart.icon}
            </div>
            <div style="font-size:1.5rem; color:var(--primary); font-weight:900; letter-spacing:1px;">
                ${manifest.title}
            </div>
            <div style="font-size:0.95rem; color:var(--text-muted); margin-top:12px; line-height:1.4;">
                ${manifest.subtitle || 'Insert cartridge to play.'}
            </div>
        `;
        
        carousel.appendChild(card);
    });
}


// ==========================================
// PHASE 3: DELEGATION STATE SETTERS
// ==========================================
// When a user clicks a setup option, the UI updates visually, records the 
// state globally, and then explicitly asks the Cartridge if it needs to react.

export function setMode(mode, element) {
    // 1. Visual UI Update
    document.querySelectorAll('#mode-group .select-card').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    // 2. Global State Update
    state.gameState.mode = mode;

    // 3. Cartridge Delegation Hook (e.g., Song Trivia uses this to show the "Decades" sub-menu)
    if (window.activeCartridge && typeof window.activeCartridge.onModeSelect === 'function') {
        window.activeCartridge.onModeSelect(mode);
    }
}

export function setSub(val, element) {
    document.querySelectorAll('#sub-pills .pill').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    state.gameState.sub = val;

    if (window.activeCartridge && typeof window.activeCartridge.onSubSelect === 'function') {
        window.activeCartridge.onSubSelect(val);
    }
}

export function setLevel(level, element) {
    document.querySelectorAll('#level-group .select-card').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    state.gameState.level = level;
}

export function setPill(groupId, element, val) {
    document.querySelectorAll(`#${groupId} .pill`).forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    if(groupId === 'rounds-group') state.gameState.rounds = val;
}


// ==========================================
// PHASE 4: THE STATS & DAILY BRIDGE
// ==========================================

/**
 * Configures the "Today Three" daily button.
 * Relies on the active cartridge to dictate whether the user has played today.
 */
export function setupDailyButton() {
    const dailyBtn = document.getElementById('daily-btn-top');
    if(!dailyBtn) return;
    
    // Ask the cartridge directly if daily is exhausted
    const isPlayed = (window.activeCartridge && typeof window.activeCartridge.hasPlayedDaily === 'function') 
        ? window.activeCartridge.hasPlayedDaily() 
        : false;
    
    if (isPlayed) {
        dailyBtn.innerText = "🌍 TODAY THREE (PLAYED)";
        dailyBtn.style.opacity = "0.5";
        dailyBtn.style.cursor = "not-allowed";
        dailyBtn.onclick = (e) => { 
            e.preventDefault(); 
            alert("You already crushed today's challenge! Come back tomorrow."); 
        };
    } else {
        dailyBtn.innerText = "🌍 PLAY TODAY THREE";
        dailyBtn.style.opacity = "1";
        dailyBtn.style.cursor = "pointer";
        dailyBtn.onclick = () => {
            if (window.activeCartridge && typeof window.activeCartridge.startDailyChallenge === 'function') {
                window.activeCartridge.startDailyChallenge();
            }
        };
    }
}

/**
 * Builds the Stats Modal. If on the Main Menu, shows global platform stats.
 * If a game is active, delegates the rendering to the Cartridge.
 */
export function openStatsLocker() {
    const rawData = localStorage.getItem('yardbirdPlatformStats');
    const stats = rawData ? JSON.parse(rawData) : {};
    const context = window.activeCartridge ? window.activeCartridge.manifest.id : 'main_menu';
    const modalContent = document.querySelector('#stats-modal .modal-content');

    if(!modalContent) return; 

    // PLATFORM CONTEXT: Show total games aggregated across all cartridges
    if (context === 'main_menu') {
        const stGames = stats.song_trivia?.gamesPlayed || 0;
        const fmGames = stats.fast_math?.gamesPlayed || 0;
        const totalGames = stats.platformGamesPlayed || (stGames + fmGames);
        
        modalContent.innerHTML = `
            <h2 style="color:var(--brand); margin-top:0; text-align:center; border-bottom:1px solid #333; padding-bottom:15px;">Platform Stats</h2>
            <div class="stat-grid">
                <div class="stat-box">
                    <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Song Trivia</div>
                    <div class="stat-val" style="color:var(--p2)">${stGames} <span style="font-size:0.8rem; color:#666;">plays</span></div>
                </div>
                <div class="stat-box">
                    <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Fast Math</div>
                    <div class="stat-val" style="color:var(--p1)">${fmGames} <span style="font-size:0.8rem; color:#666;">plays</span></div>
                </div>
            </div>
            <div style="text-align:center; color:#888; margin: 15px 0;">Total Games Across Platform: ${totalGames}</div>
            <button class="btn btn-main" onclick="hideModal('stats-modal')" style="width: 100%; margin-top: 15px;">Close</button>
        `;
    } 
    // CARTRIDGE CONTEXT: Pass the specific stat block to the active game
    else if (window.activeCartridge && typeof window.activeCartridge.renderStatsUI === 'function') {
        window.activeCartridge.renderStatsUI(stats[context] || {}, modalContent);
    }

    if (window.showModal) window.showModal('stats-modal');
    else document.getElementById('stats-modal').classList.remove('hidden');
}

// Bind to window for HTML onclicks
window.openStatsLocker = openStatsLocker;
export function populateStats() {} // Note: Deprecated placeholder. Kept to prevent legacy HTML crash.


// ==========================================
// PHASE 5: THE ASYMMETRIC VIEW CONTROLLER
// ==========================================

/**
 * Handles the "Jackbox/Kahoot" UI logic. 
 * If a user is a "Client Controller" (Phone), hide all platform navigation
 * so they cannot accidentally click out of the game.
 * @param {string} context - The current state ('main_menu' or cartridge ID).
 */
export function updatePlatformUI(context) {
    const menuBtn = document.getElementById('menu-btn');
    const statsBtn = document.getElementById('stats-btn');
    const infoBtn = document.getElementById('info-btn');
    const header = document.getElementById('game-header');
    const mainTitle = document.getElementById('main-title');

    const isClient = state.isMultiplayer && !state.isHost;

    if (isClient) {
        // CLIENT MODE: Lockdown the UI
        if (menuBtn) menuBtn.classList.add('hidden');
        if (statsBtn) statsBtn.classList.add('hidden');
        if (infoBtn) infoBtn.classList.add('hidden');
        if (header) header.classList.add('home-screen'); 
    } else {
        // HOST/SOLO MODE: Allow navigation
        if (menuBtn) menuBtn.classList.toggle('hidden', context === 'main_menu');
        if (statsBtn) statsBtn.classList.toggle('hidden', context === 'main_menu');
        if (infoBtn) infoBtn.classList.remove('hidden');

        if (context === 'main_menu') {
            if (header) header.classList.add('home-screen');
            if (mainTitle) mainTitle.innerText = "YARDBIRD'S GAMES";
        } else {
            if (header) header.classList.remove('home-screen');
        }
    }

    const rulesContent = document.querySelector('#rules-modal .modal-content');
    if(!rulesContent) return;

    // Delegate Rules Modal text to the Cartridge
    if (context === 'main_menu') {
        rulesContent.innerHTML = `<h2>Welcome to Yardbird's</h2><p style="color:#ccc; line-height: 1.6;">Select a game cartridge from the main menu to begin.<br><br><strong>Party Mode:</strong> Want to play with friends? Select a game first, then click the menu icon (☰) in the top left to host a game on your TV and use phones as Kahoot-style controllers!</p><button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px;">Got it!</button>`;
    } 
    else if (window.activeCartridge && window.activeCartridge.manifest.rulesHTML) {
        rulesContent.innerHTML = window.activeCartridge.manifest.rulesHTML;
    }
}

/**
 * Generates an exportable playlist grid at the end of the game.
 * Note: Primarily used by Song Trivia, but available globally for future music games.
 */
export function renderPlaylist(platform) {
    document.getElementById('playlist-list-container').style.display = 'block';
    document.querySelectorAll('.plat-btn').forEach(b => b.classList.remove('active-plat'));
    document.getElementById(`plat-${platform}`).classList.add('active-plat');

    let playlistHTML = '';
    state.songs.forEach((s, i) => {
        const query = encodeURIComponent(`${s.artistName} ${s.trackName}`);
        let url = platform === 'apple' ? s.trackViewUrl : (platform === 'spotify' ? `http://googleusercontent.com/spotify.com/8{query}` : `https://music.youtube.com/search?q=${query}`);
        playlistHTML += `<li><a href="${url}" target="_blank">🎵 ${i + 1}. ${s.artistName} - ${s.trackName}</a></li>`;
    });
    document.getElementById('playlist-list').innerHTML = playlistHTML;
}

// ==========================================
// AI SETTINGS MODAL LOGIC (ui.js)
// ==========================================

/**
 * Handles the visual switching of AI provider pills in the settings modal.
 */
export function selectAIProvider(provider, element) {
    // Remove active class from all provider pills
    const pills = document.getElementById('ai-provider-pills').children;
    for (let pill of pills) {
        pill.classList.remove('active');
    }
    // Add active class to the clicked pill
    element.classList.add('active');
    
    // Temporarily store the selection on the window object before saving
    window.tempAIProvider = provider;
}

/**
 * Saves the selected provider and key to localStorage.
 */
export function saveAISettings() {
    const keyInput = document.getElementById('global-ai-key').value.trim();
    const provider = window.tempAIProvider || 'openai'; // Default to OpenAI if none clicked

    if (!keyInput) {
        alert("Please enter a valid API key.");
        return;
    }

    // Save to device
    localStorage.setItem('yardbird_ai_provider', provider);
    localStorage.setItem('yardbird_ai_key', keyInput);

    console.log(`✅ AI Settings Saved: ${provider}`);
    hideModal('settings-modal');
}

// Attach these to the window so the inline HTML onclick attributes can see them
window.selectAIProvider = selectAIProvider;
window.saveAISettings = saveAISettings;

