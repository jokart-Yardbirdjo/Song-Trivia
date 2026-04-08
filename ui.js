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
    if (state.userStats.playedDailyToday) {
        dailyBtn.innerText = "🌍 TODAY THREE (PLAYED)";
        dailyBtn.style.opacity = "0.5";
        dailyBtn.style.cursor = "not-allowed";
        dailyBtn.onclick = (e) => { e.preventDefault(); alert("You already crushed today's challenge! Come back tomorrow for a new mix."); };
    } else {
        dailyBtn.innerText = "🌍 PLAY TODAY THREE";
        dailyBtn.style.opacity = "1";
        dailyBtn.onclick = startDailyChallenge;
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