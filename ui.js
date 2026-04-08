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
    document.getElementById('stat-games').innerText = state.userStats.gamesPlayed;
    let acc = state.userStats.totalGuesses > 0 ? Math.round((state.userStats.correctGuesses / state.userStats.totalGuesses) * 100) : 0;
    document.getElementById('stat-acc').innerText = `${acc}%`;
    document.getElementById('stat-hs-text').innerText = state.userStats.hsText;
    document.getElementById('stat-snip').innerText = state.userStats.sniperHits;
    
    if(state.userStats.trophies.perf) document.getElementById('trophy-perf').classList.add('unlocked');
    if(state.userStats.trophies.mara) document.getElementById('trophy-mara').classList.add('unlocked');
    if(state.userStats.trophies.snip) document.getElementById('trophy-snip').classList.add('unlocked');
    if(state.userStats.trophies.streak) document.getElementById('trophy-streak').classList.add('unlocked');
    if(state.userStats.trophies.expl) document.getElementById('trophy-expl').classList.add('unlocked');
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

// Add this to the bottom of ui.js
export function buildSetupScreen(manifest) {
    // --- ADD THIS LINE ---
    document.getElementById('main-title').innerText = manifest.title;
    
    // 1. Build the Mode Cards
    const modeGroup = document.getElementById('mode-group');
    modeGroup.innerHTML = ''; // Clear old cards
    
    manifest.modes.forEach((mode, index) => {
        const card = document.createElement('div');
        card.className = `select-card ${index === 0 ? 'active' : ''}`;
        card.onclick = () => window.setMode(mode.id, card); // We use window because of the HTML onclick
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
    
    // Hide the Era/Genre and Player/Rounds selection if not Song Trivia
    document.getElementById('sub-selection-area').classList.toggle('hidden', !isSongTrivia);
    document.getElementById('players-rounds-area').classList.toggle('hidden', !isSongTrivia);

    // Hide the "Play Today Three" button and its subtitle if not Song Trivia
    const dailyContainer = document.getElementById('daily-btn-top').parentElement;
    if (dailyContainer) dailyContainer.classList.toggle('hidden', !isSongTrivia);
}

export function updatePlatformUI(context) {
    // 1. Toggle the hamburger menu based on where we are
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.classList.toggle('hidden', context === 'main_menu');
    
    const rulesContent = document.querySelector('#rules-modal .modal-content');
    const statsContent = document.querySelector('#stats-modal .modal-content');
    
    if (context === 'main_menu') {
        rulesContent.innerHTML = `<h2>Welcome to Yardbird's</h2><p style="color:#ccc; line-height: 1.6;">Select a game cartridge from the main menu to begin.<br><br><strong>Party Mode:</strong> Want to play with friends? Select a game first, then click the menu icon (☰) in the top left to host a game on your TV and use phones as Kahoot-style controllers!</p><button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px;">Got it!</button>`;
        statsContent.innerHTML = `<h2>Platform Stats</h2><div class="stat-box" style="margin-bottom:20px;"><div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Total Games Played</div><div class="stat-val">${state.userStats.platformGamesPlayed || 0}</div></div><p style="color:#aaa; font-size:0.9rem; text-align:center;">Load a specific game to view its detailed stats and trophies!</p><button class="btn btn-main" onclick="hideModal('stats-modal')">Close</button>`;
    } 
    else if (context === 'fast_math') {
        rulesContent.innerHTML = `<h2>Fast Math Rules</h2><p style="color:#ccc; line-height: 1.6;">Solve the arithmetic problem shown on the screen as fast as possible. The faster you answer, the more points you get. <br><br>Get 3 in a row correct for a +50 Streak Bonus!</p><button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px;">Let's Go!</button>`;
        statsContent.innerHTML = `<h2>Fast Math Stats</h2><div class="stat-box" style="margin-bottom:20px;"><div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Games Played</div><div class="stat-val">${state.userStats.fast_math ? state.userStats.fast_math.gamesPlayed : 0}</div></div><button class="btn btn-main" onclick="hideModal('stats-modal')">Close</button>`;
    }
    else if (context === 'song_trivia') {
        rulesContent.innerHTML = `<h2>How to Play</h2><ul style="padding-left: 20px; font-size: 0.95rem; line-height: 1.6; color: #ccc;"><li><strong>Modes:</strong> Play Classic Genre, Artist-Specific, or Guess the Movie!</li><li><strong>Today Three:</strong> A daily synced challenge.</li><li><strong>The Lifeline:</strong> Multiple Choice options drop at 10s.</li></ul><button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px;">Got it! Let's Play</button>`;
        statsContent.innerHTML = `<h2>Trivia Stats</h2><div class="stat-box" style="margin-bottom:20px;"><div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Games Played</div><div class="stat-val">${state.userStats.song_trivia ? state.userStats.song_trivia.gamesPlayed : 0}</div></div><button class="btn btn-main" onclick="hideModal('stats-modal')">Close</button>`;
    }
}
