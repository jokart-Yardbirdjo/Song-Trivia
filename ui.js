// ui.js
import { state, subOptions } from './state.js';

export function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
export function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

export function setMode(mode, element) {
    document.querySelectorAll('#mode-group .select-card').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    state.gameState.mode = mode;

    // Delegate to the Cartridge!
    if (window.activeCartridge && typeof window.activeCartridge.onModeSelect === 'function') {
        window.activeCartridge.onModeSelect(mode);
    }
}

export function setSub(val, element) {
    document.querySelectorAll('#sub-pills .pill').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    state.gameState.sub = val;

    // Delegate to the Cartridge!
    if (window.activeCartridge && typeof window.activeCartridge.onSubSelect === 'function') {
        window.activeCartridge.onSubSelect(val);
    }
}

export function setPill(groupId, element, val) {
    document.querySelectorAll(`#${groupId} .pill`).forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    if(groupId === 'rounds-group') state.gameState.rounds = val;
}

export function setLevel(level, element) {
    document.querySelectorAll('#level-group .select-card').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    state.gameState.level = level;
}

export function setupDailyButton() {
    const dailyBtn = document.getElementById('daily-btn-top');
    if(!dailyBtn) return;
    
    // 👇 The clean delegation: Ask the cartridge directly!
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

export function buildSetupScreen(manifest) {
    document.getElementById('main-title').innerText = manifest.title;
    
    const modeGroup = document.getElementById('mode-group');
    modeGroup.innerHTML = ''; 
    manifest.modes.forEach((mode, index) => {
        const card = document.createElement('div');
        card.className = `select-card ${index === 0 ? 'active' : ''}`;
        card.onclick = () => window.setMode(mode.id, card); 
        card.innerHTML = `<div class="card-title">${mode.title}</div><div class="card-desc">${mode.desc}</div>`;
        modeGroup.appendChild(card);
    });

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

    document.getElementById('sub-selection-area').classList.add('hidden');
    document.getElementById('players-rounds-area').classList.remove('hidden');

    const dailyContainer = document.getElementById('daily-btn-top').parentElement;
    if (dailyContainer) dailyContainer.classList.toggle('hidden', !manifest.hasDaily);

    // 👇 THE LOAD FIX: Force the UI to draw the sub-menu immediately on load! 👇
    if (modeGroup.firstChild) {
        window.setMode(manifest.modes[0].id, modeGroup.firstChild);
    } else {
        state.gameState.mode = manifest.modes[0].id;
    }
    state.gameState.level = manifest.levels[0].id;
}

export function populateStats() {} 

export function openStatsLocker() {
    const rawData = localStorage.getItem('yardbirdPlatformStats');
    const stats = rawData ? JSON.parse(rawData) : {};
    const context = window.activeCartridge ? window.activeCartridge.manifest.id : 'main_menu';
    const modalContent = document.querySelector('#stats-modal .modal-content');

    if(!modalContent) return; 

    // The Platform ONLY handles the Main Menu stats. Everything else is delegated!
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
    // 👇 The Magic Hook: Pass the stats data to the active cartridge to render! 👇
    else if (window.activeCartridge && typeof window.activeCartridge.renderStatsUI === 'function') {
        window.activeCartridge.renderStatsUI(stats[context] || {}, modalContent);
    }

    if (window.showModal) window.showModal('stats-modal');
    else document.getElementById('stats-modal').classList.remove('hidden');
}


window.openStatsLocker = openStatsLocker;

export function updatePlatformUI(context) {
    const menuBtn = document.getElementById('menu-btn');
    const statsBtn = document.getElementById('stats-btn');
    const infoBtn = document.getElementById('info-btn');
    const header = document.getElementById('game-header');
    const mainTitle = document.getElementById('main-title');

    const isClient = state.isMultiplayer && !state.isHost;

    if (isClient) {
        if (menuBtn) menuBtn.classList.add('hidden');
        if (statsBtn) statsBtn.classList.add('hidden');
        if (infoBtn) infoBtn.classList.add('hidden');
        if (header) header.classList.add('home-screen'); 
    } else {
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

    // The Platform only knows about the Main Menu. 
    // Everything else is delegated to the active cartridge!
    if (context === 'main_menu') {
        rulesContent.innerHTML = `<h2>Welcome to Yardbird's</h2><p style="color:#ccc; line-height: 1.6;">Select a game cartridge from the main menu to begin.<br><br><strong>Party Mode:</strong> Want to play with friends? Select a game first, then click the menu icon (☰) in the top left to host a game on your TV and use phones as Kahoot-style controllers!</p><button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px;">Got it!</button>`;
    } 
    else if (window.activeCartridge && window.activeCartridge.manifest.rulesHTML) {
        rulesContent.innerHTML = window.activeCartridge.manifest.rulesHTML;
    }
        
    
}
