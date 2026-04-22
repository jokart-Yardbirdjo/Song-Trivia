// ui.js
import { state, subOptions } from './state.js';

export function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
export function hideModal(id) { document.getElementById(id).classList.add('hidden'); }

export function setMode(mode, element) {
    document.querySelectorAll('#mode-group .select-card').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    state.gameState.mode = mode;

    const customInput = document.getElementById('custom-input');
    const currentCartridgeId = window.activeCartridge ? window.activeCartridge.manifest.id : '';

    // ==========================================
    // 1. SONG TRIVIA SUB-MENU
    // ==========================================
    if (currentCartridgeId === 'song_trivia' && subOptions[mode]) {
        state.gameState.sub = subOptions[mode][0]; 
        document.getElementById('sub-label').innerText = mode === 'movie' ? 'Select Cinema Region' : (mode === 'artist' ? 'Select Artist' : 'Select Era / Genre');
        customInput.classList.add('hidden');
        customInput.placeholder = "Paste your Public Apple Music Playlist or any custom text comma separated";
        customInput.type = "text";
        renderSubPills();
    } 
    // ==========================================
    // 2. WHO SAID IT SUB-MENU (FIXED)
    // ==========================================
    else if (currentCartridgeId === 'who_said_it') {
        state.gameState.sub = 'party_pack';
        document.getElementById('sub-label').innerText = "Select Data Source";
        const container = document.getElementById('sub-pills');
        
        if (container) {
            container.innerHTML = '';
            
            const pillParty = document.createElement('div');
            pillParty.className = `pill pill-wide active`;
            pillParty.innerText = "Party Pack";
            pillParty.onclick = () => window.setSub('party_pack', pillParty);

            const pillAI = document.createElement('div');
            pillAI.className = `pill pill-wide`;
            pillAI.innerText = "Infinite AI";
            pillAI.onclick = () => window.setSub('ai_infinite', pillAI);

            container.appendChild(pillParty);
            container.appendChild(pillAI);
        }
        customInput.classList.add('hidden');
    }

    // ==========================================
    // 3. API BOX VISIBILITY CONTROLS
    // ==========================================
    if (mode === 'ai_infinite' && currentCartridgeId === 'consensus') {
        customInput.classList.remove('hidden');
        customInput.placeholder = "Paste your OpenAI API Key...";
        customInput.type = "password"; 
        const savedKey = localStorage.getItem('consensus_openai_key');
        if (savedKey) customInput.value = savedKey;
    } else if (mode === 'party_pack' && currentCartridgeId === 'consensus') {
        customInput.classList.add('hidden');
    } else if (currentCartridgeId !== 'who_said_it' && currentCartridgeId !== 'song_trivia' && currentCartridgeId !== 'consensus') {
        if (customInput) customInput.classList.add('hidden');
    }

    // ==========================================
    // 4. DIFFICULTY LEVEL LOCK (Song Trivia Only)
    // ==========================================
    const levelGroup = document.getElementById('level-group');
    if (mode === 'movie' && currentCartridgeId === 'song_trivia') {
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
    if(!container) return; // Cartridges like Consensus might not have this
    container.innerHTML = '';
    
    if (!subOptions[state.gameState.mode]) return;

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
    const currentCartridgeId = window.activeCartridge ? window.activeCartridge.manifest.id : '';

    if (val === 'custom') {
        customInput.classList.remove('hidden');
        customInput.placeholder = "Paste your Public Apple Music Playlist or any custom text comma separated";
        customInput.type = "text";
        customInput.focus();
    } 
    // 👇 THIS IS WHAT TRIGGERS THE API BOX FOR "WHO SAID IT" 👇
    else if (val === 'ai_infinite' && currentCartridgeId === 'who_said_it') {
        customInput.classList.remove('hidden');
        customInput.placeholder = "Paste your OpenAI API Key (sk-...)";
        customInput.type = "password";
        const savedKey = localStorage.getItem('consensus_openai_key');
        if (savedKey) customInput.value = savedKey;
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
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

    const isSongTrivia = manifest.id === 'song_trivia';
    const isWhoSaidIt = manifest.id === 'who_said_it';
    
    document.getElementById('sub-selection-area').classList.toggle('hidden', !(isSongTrivia || isWhoSaidIt));
    document.getElementById('players-rounds-area').classList.remove('hidden');

    const dailyContainer = document.getElementById('daily-btn-top').parentElement;
    if (dailyContainer) dailyContainer.classList.toggle('hidden', !isSongTrivia);

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
    
    const st = stats.song_trivia || {};
    const fm = stats.fast_math || {};
    const context = window.activeCartridge ? window.activeCartridge.manifest.id : 'main_menu';
    const modalContent = document.querySelector('#stats-modal .modal-content');

    if(!modalContent) return; 

    if (context === 'main_menu') {
        const stGames = st.gamesPlayed || 0;
        const fmGames = fm.gamesPlayed || 0;
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

    } else if (context === 'fast_math') {
        modalContent.innerHTML = `
            <h2 style="color:var(--brand); margin-top:0; text-align:center; border-bottom:1px solid #333; padding-bottom:15px;">Fast Math Locker</h2>
            <div class="stat-grid">
                <div class="stat-box">
                    <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Games Played</div>
                    <div class="stat-val">${fm.gamesPlayed || 0}</div>
                </div>
                <div class="stat-box">
                    <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">High Score</div>
                    <div class="stat-val" style="color:var(--p1)">${fm.highScore || fm.hsText || 0}</div>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                <button class="btn btn-main" onclick="hideModal('stats-modal')" style="flex: 1; margin-right: 10px;">Close</button>
                <button class="btn btn-reset" onclick="if(window.activeCartridge && window.activeCartridge.resetStats) { window.activeCartridge.resetStats(); hideModal('stats-modal'); }" style="margin-top: 0; padding: 16px;">Reset</button>
            </div>
        `;

    } else if (context === 'song_trivia') {
        let acc = st.totalGuesses > 0 ? Math.round((st.correctGuesses / st.totalGuesses) * 100) : 0;
        const tr = st.trophies || {};
        
        modalContent.innerHTML = `
            <h2 style="color:var(--brand); margin-top:0; text-align:center; border-bottom:1px solid #333; padding-bottom:15px;">Trivia Locker Room</h2>
            <div class="stat-grid">
                <div class="stat-box">
                    <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Games Played</div>
                    <div class="stat-val">${st.gamesPlayed || 0}</div>
                </div>
                <div class="stat-box">
                    <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Accuracy</div>
                    <div class="stat-val" style="color:var(--brand)">${acc}%</div>
                </div>
                <div class="stat-box">
                    <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">High Score</div>
                    <div class="stat-val" style="color:var(--p1)">${st.hsText || 0}</div>
                </div>
                <div class="stat-box">
                    <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Sniper Hits</div>
                    <div class="stat-val" style="color:var(--p3)">${st.sniperHits || 0}</div>
                </div>
            </div>

            <h3 style="color:#fff; font-size:1rem; border-bottom:1px solid #333; padding-bottom:8px; margin-bottom:15px;">Trophy Cabinet</h3>
            
            <div class="trophy-row ${tr.perf ? 'unlocked' : ''}">
                <div class="trophy-icon">🏆</div>
                <div class="trophy-text"><h4>The Perfectionist</h4><p>Score higher than 900/1000 points.</p></div>
            </div>
            <div class="trophy-row ${tr.mara ? 'unlocked' : ''}">
                <div class="trophy-icon">🏃</div>
                <div class="trophy-text"><h4>The Marathoner</h4><p>Complete a grueling 20-Round game.</p></div>
            </div>
            <div class="trophy-row ${tr.snip ? 'unlocked' : ''}">
                <div class="trophy-icon">🎯</div>
                <div class="trophy-text"><h4>The Sniper</h4><p>Guess 10 songs correctly in under 3 seconds.</p></div>
            </div>
            <div class="trophy-row ${tr.streak ? 'unlocked' : ''}">
                <div class="trophy-icon">🔥</div>
                <div class="trophy-text"><h4>The Daily Devotee</h4><p>Play 5 days in a row.</p></div>
            </div>
            <div class="trophy-row ${tr.expl ? 'unlocked' : ''}">
                <div class="trophy-icon">🗺️</div>
                <div class="trophy-text"><h4>The Explorer</h4><p>Play all 3 game modes.</p></div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                <button class="btn btn-main" onclick="hideModal('stats-modal')" style="flex: 1; margin-right: 10px;">Close</button>
                <button class="btn btn-reset" onclick="if(window.activeCartridge && window.activeCartridge.resetStats) { window.activeCartridge.resetStats(); hideModal('stats-modal'); }" style="margin-top: 0; padding: 16px;">Reset</button>
            </div>
        `;
    } else if (context === 'consensus') {
        const con = stats.consensus || {};
        modalContent.innerHTML = `
            <h2 style="color:var(--brand); margin-top:0; text-align:center; border-bottom:1px solid #333; padding-bottom:15px;">Consensus Locker</h2>
            <div class="stat-grid">
                <div class="stat-box">
                    <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Games Played</div>
                    <div class="stat-val">${con.gamesPlayed || 0}</div>
                </div>
                <div class="stat-box">
                    <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">High Score</div>
                    <div class="stat-val" style="color:var(--p1)">${con.highScore || 0}</div>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                <button class="btn btn-main" onclick="hideModal('stats-modal')" style="flex: 1; margin-right: 10px;">Close</button>
                <button class="btn btn-reset" onclick="if(window.activeCartridge && window.activeCartridge.resetStats) { window.activeCartridge.resetStats(); hideModal('stats-modal'); }" style="margin-top: 0; padding: 16px;">Reset</button>
            </div>
        `;
    }
    // Inside openStatsLocker() in ui.js
    else if (context === 'who_said_it') {
        const wsi = stats.who_said_it || {};
        modalContent.innerHTML = `
            <h2 style="color:var(--brand); margin-top:0; text-align:center; border-bottom:1px solid #333; padding-bottom:15px;">Who Said It Locker</h2>
            <div class="stat-grid">
                <div class="stat-box">
                    <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Games Played</div>
                    <div class="stat-val">${wsi.gamesPlayed || 0}</div>
                </div>
                <div class="stat-box">
                    <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">High Score</div>
                    <div class="stat-val" style="color:var(--p1)">${wsi.highScore || 0}</div>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
                <button class="btn btn-main" onclick="hideModal('stats-modal')" style="flex: 1; margin-right: 10px;">Close</button>
                <button class="btn btn-reset" onclick="if(window.activeCartridge && window.activeCartridge.resetStats) { window.activeCartridge.resetStats(); }" style="margin-top: 0; padding: 16px;">Reset</button>
            </div>
        `;
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

    if (context === 'main_menu') {
        rulesContent.innerHTML = `<h2>Welcome to Yardbird's</h2><p style="color:#ccc; line-height: 1.6;">Select a game cartridge from the main menu to begin.<br><br><strong>Party Mode:</strong> Want to play with friends? Select a game first, then click the menu icon (☰) in the top left to host a game on your TV and use phones as Kahoot-style controllers!</p><button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px;">Got it!</button>`;
    } 
    else if (context === 'fast_math') {
        rulesContent.innerHTML = `<h2>Fast Math Rules</h2><p style="color:#ccc; line-height: 1.6;">Solve the arithmetic problem shown on the screen as fast as possible. The faster you answer, the more points you get. <br><br>Get 3 in a row correct for a +50 Streak Bonus!</p><button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px;">Let's Go!</button>`;
    }
    else if (context === 'song_trivia') {
        rulesContent.innerHTML = `<h2>How to Play</h2><ul style="padding-left: 20px; font-size: 0.95rem; line-height: 1.6; color: #ccc;"><li><strong>Modes:</strong> Play Classic Genre, Artist-Specific, or Guess the Movie!</li><li><strong>Today Three:</strong> A daily synced challenge.</li><li><strong>The Lifeline:</strong> Multiple Choice options drop at 10s.</li></ul><button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px;">Got it! Let's Play</button>`;
    }
    // Inside updatePlatformUI() in ui.js
    else if (context === 'who_said_it') {
        rulesContent.innerHTML = `
            <h2>Who Said It?</h2>
            <p style="color:#ccc; line-height: 1.6;">Read the quote on the screen and identify who said it as fast as possible. The faster you answer, the more points you earn. <br><br>Get 3 right in a row to ignite a streak bonus!</p>
            <button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px;">Got it!</button>
        `;
    }   
    // FIX #4: Add detailed game descriptions to the Info Modal
    else if (context === 'consensus') {
        rulesContent.innerHTML = `
            <h2>The 5 Consensus Games</h2>
            <div style="text-align:left; color:#ccc; line-height:1.5; font-size:0.9rem;">
                <p><strong style="color:var(--highlight);">1. Most Likely To:</strong> Secretly vote for the player in the room who best fits the description.</p>
                <p><strong style="color:var(--highlight);">2. The Great Divide:</strong> Pick between two scenarios, then predict which one the majority of the room will choose.</p>
                <p><strong style="color:var(--highlight);">3. Hive Mind:</strong> This is a Kahoot-style survey. Try to guess the #1 answer from standard Family Feud style data.</p>
                <p><strong style="color:var(--highlight);">4. Guilty as Charged:</strong> Tap "Raise Hand" if you've done the absurdity. Then predict how many TOTAL hands will be raised.</p>
                <p><strong style="color:var(--highlight);">5. Shot in the Dark:</strong> Use your phone to type the closest numeric guess. The closer you are, the more points you get.</p>
            </div>
            <button class="btn btn-main" onclick="hideModal('rules-modal')" style="width:100%; margin-top: 15px;">Let's Go!</button>
        `;
    }
}
