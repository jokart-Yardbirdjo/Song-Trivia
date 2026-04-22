// multiplayer.js
import { db } from './firebase.js';
import { state, colors } from './state.js';
import { hideModal } from './ui.js';

export function handleHostSetup() {
    if (!state.activeCartridgeId) {
        alert("Please select a Game Cartridge from the Main Menu first!");
        hideModal('multiplayer-modal');
        return;
    }

    hideModal('multiplayer-modal');
    document.getElementById('setup-screen').classList.remove('hidden');
    
    document.getElementById('start-btn-top').innerText = "🚀 CREATE MULTIPLAYER ROOM";
    document.getElementById('start-btn-top').onclick = createRoom;
    
    const dailyContainer = document.getElementById('daily-btn-top').parentElement;
    if (dailyContainer) dailyContainer.classList.add('hidden');
    
    const separator = document.querySelector('#setup-screen .separator-line');
    if (separator) separator.classList.add('hidden'); 
    
    document.getElementById('menu-btn').classList.add('hidden');
    document.getElementById('stats-btn').classList.add('hidden');
    
    const backBtn = document.getElementById('back-to-main-btn');
    if (backBtn) backBtn.innerText = "CANCEL MULTIPLAYER";
    
    state.isMultiplayer = true;
    state.isHost = true;
}

export function handleJoinScreen() {
    hideModal('multiplayer-modal');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('join-screen').classList.remove('hidden');
    
    document.body.classList.add('client-mode');

    state.isMultiplayer = true;
    state.isHost = false;
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

export async function createRoom() {
    state.numPlayers = 0; 
    state.timeLimit = state.gameState.level === 'hard' ? 10 : 30; 
    state.roundsPerPlayer = state.gameState.rounds;
    state.maxRounds = state.gameState.rounds; 
    state.roomCode = generateRoomCode();
    
    await db.ref(`rooms/${state.roomCode}`).set({
        state: 'lobby',
        settings: state.gameState,
        cartridgeId: state.activeCartridgeId, 
        createdAt: window.firebase.database.ServerValue.TIMESTAMP
    });

    // 2. The Dead-Man's Switch: If the host disconnects, wipe the room
    db.ref(`rooms/${state.roomCode}`).onDisconnect().remove();

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('host-lobby-screen').classList.remove('hidden');
    document.getElementById('display-room-code').innerText = state.roomCode;

    document.getElementById('qr-container').innerHTML = ""; 
    const joinUrl = window.location.origin + window.location.pathname + "?room=" + state.roomCode;
    new QRCode(document.getElementById("qr-container"), {
        text: joinUrl, width: 160, height: 160,
        colorDark : "#0a0a0c", colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.M
    });

    db.ref(`rooms/${state.roomCode}/players`).on('value', (snapshot) => {
        const players = snapshot.val();
        const listDiv = document.getElementById('lobby-player-list');
        listDiv.innerHTML = '';
        
        if (players) {
            const playerIds = Object.keys(players);
            state.numPlayers = playerIds.length;
            document.getElementById('player-count').innerText = state.numPlayers;
            document.getElementById('start-multiplayer-btn').disabled = state.numPlayers === 0;

            playerIds.forEach((pid, index) => {
                const pTag = document.createElement('div');
                pTag.className = 'pill active';
                pTag.style.borderColor = colors[index % colors.length];
                pTag.innerText = players[pid].name;
                listDiv.appendChild(pTag);
            });
        } else {
            state.numPlayers = 0;
            document.getElementById('player-count').innerText = 0;
            document.getElementById('start-multiplayer-btn').disabled = true;
        }
    });
}

export async function joinRoom() {
    const codeInput = document.getElementById('join-code').value.toUpperCase().trim();
    const nameInput = document.getElementById('join-name').value.trim();
    const fb = document.getElementById('join-feedback');
    
    if (codeInput.length !== 4) { fb.innerText = "Please enter a 4-letter code."; return; }
    if (nameInput.length < 2) { fb.innerText = "Nickname must be at least 2 characters."; return; }

    fb.innerText = "Connecting...";
    const roomSnap = await db.ref(`rooms/${codeInput}`).once('value');
    if (!roomSnap.exists()) { fb.innerText = "Room not found. Check the code!"; return; }
    if (roomSnap.val().state !== 'lobby') { fb.innerText = "Game is already in progress!"; return; }

    const roomData = roomSnap.val();
    const cartId = roomData.cartridgeId;
    if (cartId && window.loadCartridge) window.loadCartridge(cartId);
    
    state.gameState = roomData.settings || state.gameState;

    // Calculate max time for the client timer bar
    if (cartId === 'fast_math') {
        state.timeLimit = state.gameState.level === 'easy' ? 20 : (state.gameState.level === 'medium' ? 15 : 8);
    } else if (cartId === 'consensus') {
        state.timeLimit = state.gameState.level === 'easy' ? 30 : 15;
    } else {
        state.timeLimit = state.gameState.level === 'hard' ? 10 : 30;
    }

    state.roomCode = codeInput;
    state.myPlayerId = "player_" + Date.now() + Math.floor(Math.random()*1000); 

    await db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).set({ name: nameInput, score: 0, status: 'waiting' });
    db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).onDisconnect().remove();

    document.getElementById('join-screen').classList.add('hidden');
    
    const waitScreen = document.createElement('div');
    waitScreen.id = 'client-wait-screen';
    waitScreen.innerHTML = `<h2 style="color:var(--brand);">You're in!</h2><p style="font-size:1.2rem;">Look at the big screen.</p>`;
    document.querySelector('.container').appendChild(waitScreen);

    db.ref(`rooms/${state.roomCode}/state`).on('value', (snap) => {
        if (!snap.exists()) { location.reload(); }
        else if (snap.val() === 'playing') {
            document.getElementById('client-wait-screen').classList.add('hidden');
            document.getElementById('client-play-screen').classList.remove('hidden');
        } else if (snap.val() === 'finished') {
            document.getElementById('client-play-screen').classList.add('hidden');
            document.getElementById('client-end-screen').classList.remove('hidden');
            db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}/finalScore`).on('value', scoreSnap => {
                if (scoreSnap.exists()) document.getElementById('client-final-score').innerText = scoreSnap.val();
            });

            db.ref(`rooms/${state.roomCode}/finalLeaderboard`).once('value', lbSnap => {
                if(lbSnap.exists()) {
                    let results = lbSnap.val();
                    let html = `<div style="text-align:left; background:rgba(0,0,0,0.03); padding:15px; border-radius:12px; border:2px solid var(--border-light);">`;
                    html += `<div style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:10px; font-weight:bold; text-align:center;">Final Standings</div>`;
                    results.forEach((p, idx) => {
                        let medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : '👏'));
                        let color = idx === 0 ? 'var(--p1)' : (idx === 1 ? 'var(--p2)' : 'var(--text-muted)');
                        html += `<div style="display:flex; justify-content:space-between; padding: 10px 5px; border-bottom: 1px solid var(--border-light); font-weight: bold; color: ${color};"><span>${medal} ${p.name}</span><span style="color:var(--dark-text)">${p.score}</span></div>`;
                    });
                    html += `</div>`;
                    const lbContainer = document.getElementById('client-leaderboard-container');
                    if(lbContainer) lbContainer.innerHTML = html;
                }
            });
        }
    });

    db.ref(`rooms/${state.roomCode}/currentMC`).on('value', mcSnap => {
        if(mcSnap.exists()) {
            document.getElementById('client-text-inputs').classList.add('hidden');
            renderClientMC(mcSnap.val());
        }
    });

    db.ref(`rooms/${state.roomCode}/currentRound`).on('value', snap => {
        if(snap.exists() && document.getElementById('client-status')) {
            document.getElementById('client-status').innerText = `ROUND ${snap.val()}`;
            
            document.getElementById('client-locked-screen').classList.add('hidden');
            document.getElementById('client-mc-inputs').classList.add('hidden');
            
            if (window.activeCartridge && window.activeCartridge.manifest.id === 'song_trivia') {
                document.getElementById('client-text-inputs').classList.remove('hidden');
            } else {
                document.getElementById('client-text-inputs').classList.add('hidden');
            }
            
            if(document.getElementById('client-guess-artist')) document.getElementById('client-guess-artist').value = '';
            if(document.getElementById('client-guess-song')) document.getElementById('client-guess-song').value = '';
            if(document.getElementById('client-guess-movie')) document.getElementById('client-guess-movie').value = '';

            db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update({ status: 'guessing', guess: null });
        }
    });

    // 🚀 NEW TIMER BAR LOGIC FOR CLIENT 🚀
    db.ref(`rooms/${state.roomCode}/timeLeft`).on('value', snap => {
        const timerContainer = document.getElementById('client-timer-display');
        if(snap.exists() && timerContainer) {
            const time = snap.val();
            timerContainer.dataset.time = time; 
            
            let percentage = (time / (state.timeLimit || 30)) * 100;
            let bgColor = time <= 3 ? 'var(--fail)' : 'var(--primary)';
            
            // Check if the bar already exists
            let fill = document.getElementById('client-timer-fill');
            
            if (!fill) {
                // If it doesn't exist, inject it for the first time
                timerContainer.innerHTML = `<div class="timer-bar-container" style="margin: 15px 0;"><div id="client-timer-fill" class="timer-bar-fill" style="width: 100%;"></div></div>`;
                fill = document.getElementById('client-timer-fill');
            }
            
            // Apply the new width and color to the EXISTING element
            // This allows the CSS "transition: width 1s linear" to glide smoothly!
            if (fill) {
                fill.style.width = `${percentage}%`;
                fill.style.backgroundColor = bgColor;
            }
        }
    });

    // 🚀 NEW DYNAMIC PROMPT INJECTION FOR CLIENT 🚀
    db.ref(`rooms/${state.roomCode}/currentPrompt`).on('value', snap => {
        let promptDiv = document.getElementById('client-prompt');
        
        if (snap.exists()) {
            if (!promptDiv) {
                promptDiv = document.createElement('div');
                promptDiv.id = 'client-prompt';
                const playScreen = document.getElementById('client-play-screen');
                const mcInputs = document.getElementById('client-mc-inputs');
                if (playScreen && mcInputs) playScreen.insertBefore(promptDiv, mcInputs);
            }
            
            if (promptDiv.parentElement && promptDiv.parentElement.id === 'client-text-inputs') {
                const playScreen = document.getElementById('client-play-screen');
                const mcInputs = document.getElementById('client-mc-inputs');
                if (playScreen && mcInputs) playScreen.insertBefore(promptDiv, mcInputs);
            }

            promptDiv.innerHTML = `<div class="prompt-text" style="text-align:center; margin-top:15px; margin-bottom:20px;">${snap.val()}</div>`;
            promptDiv.classList.remove('hidden');
        } else if (promptDiv) {
            promptDiv.classList.add('hidden');
        }
    });
    
    db.ref(`rooms/${state.roomCode}/hostState`).on('value', snap => {
        if (snap.exists() && window.activeCartridge && window.activeCartridge.renderClientUI) {
            document.getElementById('client-text-inputs').classList.add('hidden');
            document.getElementById('client-mc-inputs').classList.add('hidden');
            document.getElementById('client-locked-screen').classList.add('hidden');
            window.activeCartridge.renderClientUI(snap.val());
        }
    });
}

// multiplayer.js

export async function startMultiplayerGame() {
    document.getElementById('host-lobby-screen').classList.add('hidden');
    
    // 1. Initialize the Room State
    await db.ref(`rooms/${state.roomCode}`).update({ 
        state: 'playing', 
        currentRound: 1, 
        mode: state.gameState.mode,
        timeLeft: state.timeLimit // Set initial time
    });
    
    await db.ref(`rooms/${state.roomCode}/hostState`).set({ phase: 'loading' });

    // 2. The Master Network Clock (Only the Host runs this)
    let masterClock = setInterval(async () => {
        const snap = await db.ref(`rooms/${state.roomCode}/timeLeft`).once('value');
        let time = snap.val();
        
        if (time > 0) {
            time--;
            await db.ref(`rooms/${state.roomCode}/timeLeft`).set(time);
        } else {
            clearInterval(masterClock);
            // Timer hit zero! Force evaluation of whoever answered
            const playersSnap = await db.ref(`rooms/${state.roomCode}/players`).once('value');
            window.evaluateMultiplayerRound(playersSnap.val());
        }
    }, 1000);

    // 3. The Lock-In Listener (Fires if everyone is ready BEFORE time runs out)
    db.ref(`rooms/${state.roomCode}/players`).on('value', (snap) => {
        if (!state.isHost || !snap.exists() || state.isProcessing) return;
        
        const players = snap.val();
        let allLocked = true; let totalPlayers = 0;
        
        Object.keys(players).forEach(pid => {
            totalPlayers++;
            if (players[pid].status !== 'locked') allLocked = false;
        });

        if (allLocked && totalPlayers > 0) {
            clearInterval(masterClock); // Stop the clock!
            window.evaluateMultiplayerRound(players); 
        }
    });

    window.startGame(); 
}

export async function cancelLobby() {
    if (state.roomCode) await db.ref(`rooms/${state.roomCode}`).remove();
    location.reload(); 
}

export async function cancelActiveGame() {
    if (confirm("Are you sure you want to end the game for everyone?")) {
        if (state.isMultiplayer && state.isHost && state.roomCode) await db.ref(`rooms/${state.roomCode}`).remove();
        location.reload(); 
    }
}

export function submitClientTextGuess() {
    const artist = document.getElementById('client-guess-artist').value.trim();
    const song = document.getElementById('client-guess-song').value.trim();
    const movie = document.getElementById('client-guess-movie').value.trim();
    
    // Read from dataset instead of text
    const timerContainer = document.getElementById('client-timer-display');
    const currentTime = timerContainer ? (parseInt(timerContainer.dataset.time) || 0) : 0;
    
    db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update({
        guess: { isMC: false, artist: artist, song: song, movie: movie, time: currentTime },
        status: 'locked'
    });
    
    document.getElementById('client-text-inputs').classList.add('hidden');
    document.getElementById('client-locked-screen').classList.remove('hidden');
    document.getElementById('client-guess-artist').value = '';
    document.getElementById('client-guess-song').value = '';
    document.getElementById('client-guess-movie').value = '';
}

export function requestClientLifeline() {
    db.ref(`rooms/${state.roomCode}/roundMC`).once('value', snap => {
        if (snap.exists()) {
            document.getElementById('client-text-inputs').classList.add('hidden');
            renderClientMC(snap.val());
        }
    });
}

function renderClientMC(options) {
    const mcContainer = document.getElementById('client-mc-inputs');
    mcContainer.innerHTML = '';
    mcContainer.classList.remove('hidden');

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'mc-btn'; btn.innerText = opt.str;
        btn.onclick = () => submitClientMCGuess(opt.isCorrect);
        mcContainer.appendChild(btn);
    });
}

function submitClientMCGuess(isCorrect) {
    // Read from dataset instead of text
    const timerContainer = document.getElementById('client-timer-display');
    const currentTime = timerContainer ? (parseInt(timerContainer.dataset.time) || 0) : 0;
    
    db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update({
        guess: { isMC: true, correct: isCorrect, time: currentTime },
        status: 'locked'
    });
    document.getElementById('client-mc-inputs').classList.add('hidden');
    document.getElementById('client-locked-screen').classList.remove('hidden');
}
