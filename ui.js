// ui.js
import { state, subOptions } from './state.js';
import { startDailyChallenge } from './gameLogic.js';

export function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
export function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

export function setMode(mode, element) {
    document.querySelectorAll('#mode-group .select-card').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    state.gameState.mode = mode;
    state.gameState.sub = subOptions[mode][0]; 
    
    document.getElementById('sub-label').innerText = mode === 'movie' ? 'Select Cinema Region' : (mode === 'artist' ? 'Select Artist' : 'Select Era / Genre');
    document.getElementById('custom-input').classList.add('hidden');
    renderSubPills();

    const levelGroup = document.getElementById('level-group');
    if (mode === 'movie') {
        setLevel('medium', document.getElementById('lvl-medium'));
        levelGroup.style.opacity = '0.5';
        levelGroup.style.pointerEvents = 'none';
    } else {
        levelGroup.style.opacity = '1';
        levelGroup.style.pointerEvents = 'auto';
    }
}

export function renderSubPills() {
    const container = document.getElementById('sub-pills');
    container.innerHTML = '';
    subOptions[state.gameState.mode].forEach(opt => {
        const pill = document.createElement('div');
        pill.className = `pill pill-wide ${state.gameState.sub === opt ? 'active' : ''}`;
        pill.innerText = opt === 'shwe-special' ? 'Shwe Special (90s)' : (opt.charAt(0).toUpperCase() + opt.slice(1).replace(/-/g, ' '));
        pill.onclick = () => setSub(opt, pill);
        container.appendChild(pill);
    });
}

export function setSub(val, element) {
    document.querySelectorAll('#sub-pills .pill').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    state.gameState.sub = val;

    const customInput = document.getElementById('custom-input');
    if (val === 'custom') {
        customInput.classList.remove('hidden');
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
    }
}

export function setPill(groupId, element, val) {
    document.querySelectorAll(`#${groupId} .pill`).forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    if(groupId === 'players-group') state.gameState.players = val;
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
    
    // SAFELY check if the user has played today using the new nested structure
    const isPlayed = state.userStats.song_trivia ? state.userStats.song_trivia.playedDailyToday : false;
    
    if (isPlayed) {
        dailyBtn.innerText = "🌍 TODAY THREE (PLAYED)";
        dailyBtn.style.opacity = "0.5";
        dailyBtn.style.cursor = "not-allowed";
        dailyBtn.onclick = (e) => { e.preventDefault(); alert("You already crushed today's challenge! Come back tomorrow."); };
    } else {
        dailyBtn.innerText = "🌍 PLAY TODAY THREE";
        dailyBtn.style.opacity = "1";
        dailyBtn.onclick = () => window.activeCartridge.startDailyChallenge();
    }
}

export function populateStats() {
    if(!document.getElementById('stat-games')) return;
    const st = state.userStats.song_trivia || {}; // Use the nested structure!
    
    document.getElementById('stat-games').innerText = state.userStats.platformGamesPlayed || 0;
    let acc = st.totalGuesses > 0 ? Math.round((st.correctGuesses / st.totalGuesses) * 100) : 0;
    document.getElementById('stat-acc').innerText = `${acc}%`;
    document.getElementById('stat-hs-text').innerText = st.hsText || 0;
    document.getElementById('stat-snip').innerText = st.sniperHits || 0;
    
    if(st.trophies) {
        if(st.trophies.perf && document.getElementById('trophy-perf')) document.getElementById('trophy-perf').classList.add('unlocked');
        if(st.trophies.mara && document.getElementById('trophy-mara')) document.getElementById('trophy-mara').classList.add('unlocked');
        if(st.trophies.snip && document.getElementById('trophy-snip')) document.getElementById('trophy-snip').classList.add('unlocked');
        if(st.trophies.streak && document.getElementById('trophy-streak')) document.getElementById('trophy-streak').classList.add('unlocked');
        if(st.trophies.expl && document.getElementById('trophy-expl')) document.getElementById('trophy-expl').classList.add('unlocked');
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
    
    // 1. Build the Mode Cards
    const modeGroup = document.getElementById('mode-group');
    modeGroup.innerHTML = ''; 
    
    manifest.modes.forEach((mode, index) => {
        const card = document.createElement('div');
        card.className = `select-card ${index === 0 ? 'active' : ''}`;
        card.onclick = () => window.setMode(mode.id, card); 
        card.innerHTML = `
            <div class="card-title">${mode.title}</div>
            <div class="card-desc">${mode.desc}</div>
        `;
        modeGroup.appendChild(card);
    });

    // 2. Build the Difficulty Cards
    const levelGroup = document.getElementById('level-group');
    levelGroup.innerHTML = '';
    
    manifest.levels.forEach((lvl, index) => {
        const card = document.createElement('div');
        card.className = `select-card ${index === 0 ? 'active' : ''}`;
        card.onclick = () => window.setLevel(lvl.id, card);
        card.innerHTML = `
            <div class="card-title">${lvl.title}</div>
            <div class="card-desc">${lvl.desc}</div>
        `;
        levelGroup.appendChild(card);
    });

    // 3. Set Default State Values
    state.gameState.mode = manifest.modes[0].id;
    state.gameState.level = manifest.levels[0].id;
    
    // 4. Clean up UI based on Cartridge requirements
    const isSongTrivia = manifest.id === 'song_trivia';
    
    document.getElementById('sub-selection-area').classList.toggle('hidden', !isSongTrivia);
    document.getElementById('players-rounds-area').classList.toggle('hidden', !isSongTrivia);

    const dailyContainer = document.getElementById('daily-btn-top').parentElement;
    if (dailyContainer) dailyContainer.classList.toggle('hidden', !isSongTrivia);
}

// --- NEW SMART LOCKER ROOM LOGIC ---
export function openStatsLocker() {
    // Sync the HTML with the latest data in state
    populateStats(); 
    
    // Show the modal
    if (window.showModal) {
        window.showModal('stats-modal');
    } else {
        document.getElementById('stats-modal').classList.remove('hidden');
    }
}
window.openStatsLocker = openStatsLocker;


export function updatePlatformUI(context) {
    // 1. Toggle the hamburger menu based on where we are
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.classList.toggle('hidden', context === 'main_menu');
    
    const rulesContent = document.querySelector('#rules-modal .modal-content');
    
    // Note: We removed the statsContent overrides here so your Trophy Cabinet doesn't get deleted!
    
    if (context === 'main_menu') {
        rulesContent.innerHTML = `<h2>Welcome to Yardbird's</h2><p style="color:#ccc; line-height: 1.6;">Select a game cartridge from the main menu to begin.<br><br><strong>Party Mode:</strong> Want to play with friends? Select a game first, then click the menu icon (☰) in the top left to host a game on your TV and use phones as Kahoot-style controllers!</p><button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px;">Got it!</button>`;
    } 
    else if (context === 'fast_math') {
        rulesContent.innerHTML = `<h2>Fast Math Rules</h2><p style="color:#ccc; line-height: 1.6;">Solve the arithmetic problem shown on the screen as fast as possible. The faster you answer, the more points you get. <br><br>Get 3 in a row correct for a +50 Streak Bonus!</p><button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px;">Let's Go!</button>`;
    }
    else if (context === 'song_trivia') {
        rulesContent.innerHTML = `<h2>How to Play</h2><ul style="padding-left: 20px; font-size: 0.95rem; line-height: 1.6; color: #ccc;"><li><strong>Modes:</strong> Play Classic Genre, Artist-Specific, or Guess the Movie!</li><li><strong>Today Three:</strong> A daily synced challenge.</li><li><strong>The Lifeline:</strong> Multiple Choice options drop at 10s.</li></ul><button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px;">Got it! Let's Play</button>`;
    }
}
