// multiplayer.js
import { db } from './firebase.js';
import { state, colors } from './state.js';
import { hideModal } from './ui.js';

export function handleHostSetup() {
    // NEW: Don't let them host until they pick a game!
    if (!state.activeCartridgeId) {
        alert("Please select a Game Cartridge from the Main Menu first!");
        hideModal('multiplayer-modal');
        return;
    }

    hideModal('multiplayer-modal');
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('start-btn-top').innerText = "▶ CREATE MULTIPLAYER ROOM";
    document.getElementById('start-btn-top').onclick = createRoom;
    document.getElementById('daily-btn-top').parentElement.classList.add('hidden'); 
    document.getElementById('players-group').parentElement.classList.add('hidden'); 
    document.getElementById('cancel-setup-btn').classList.remove('hidden');
    document.getElementById('stats-btn').classList.add('hidden');
    state.isMultiplayer = true;
    state.isHost = true;
}

export function handleJoinScreen() {
    hideModal('multiplayer-modal');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('join-screen').classList.remove('hidden');
    document.getElementById('stats-btn').classList.add('hidden');
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
        cartridgeId: state.activeCartridgeId, // <--- ADD THIS LINE!
        createdAt: firebase.database.ServerValue.TIMESTAMP
    });

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

    state.roomCode = codeInput;
    state.myPlayerId = "player_" + Date.now() + Math.floor(Math.random()*1000); 

    await db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).set({ name: nameInput, score: 0, status: 'waiting' });
    db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).onDisconnect().remove();

    document.getElementById('join-screen').classList.add('hidden');
    
    const waitScreen = document.createElement('div');
    waitScreen.id = 'client-wait-screen';
    waitScreen.innerHTML = `<h2 style="color:var(--brand);">You're in!</h2><p style="font-size:1.2rem;">Look at the big screen.</p>`;
    document.querySelector('.container').appendChild(waitScreen);

    // Dynamic Game Start
    db.ref(`rooms/${state.roomCode}/state`).on('value', (snap) => {
        if (!snap.exists()) { location.reload(); }
        else if (snap.val() === 'playing') {
            db.ref(`rooms/${state.roomCode}/cartridgeId`).once('value', cartSnap => {
                if(cartSnap.exists() && window.loadCartridge) window.loadCartridge(cartSnap.val());
            });
            document.getElementById('client-wait-screen').classList.add('hidden');
            document.getElementById('client-play-screen').classList.remove('hidden');
        } else if (snap.val() === 'finished') {
            document.getElementById('client-play-screen').classList.add('hidden');
            document.getElementById('client-end-screen').classList.remove('hidden');
            db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}/finalScore`).on('value', scoreSnap => {
                if (scoreSnap.exists()) document.getElementById('client-final-score').innerText = scoreSnap.val();
            });
        }
    });

    // 1. THE LIFELINE LISTENER: Wakes up instantly when Host pushes Multiple Choice
    db.ref(`rooms/${state.roomCode}/currentMC`).on('value', mcSnap => {
        if(mcSnap.exists()) {
            document.getElementById('client-text-inputs').classList.add('hidden');
            renderClientMC(mcSnap.val());
        }
    });

    // 2. THE AUTO-WAKEUP LISTENER: Resets the phone perfectly for every new round
    db.ref(`rooms/${state.roomCode}/currentRound`).on('value', snap => {
        if(snap.exists() && document.getElementById('client-status')) {
            document.getElementById('client-status').innerText = `ROUND ${snap.val()}`;
            
            // Wake phone up, clear old UI
            document.getElementById('client-locked-screen').classList.add('hidden');
            document.getElementById('client-mc-inputs').classList.add('hidden');
            
            // Only show text boxes if the active game is Song Trivia!
            if (window.activeCartridge && window.activeCartridge.manifest.id === 'song_trivia') {
                document.getElementById('client-text-inputs').classList.remove('hidden');
            }
            
            // Wipe old answers from the screen
            if(document.getElementById('client-guess-artist')) document.getElementById('client-guess-artist').value = '';
            if(document.getElementById('client-guess-song')) document.getElementById('client-guess-song').value = '';
            if(document.getElementById('client-guess-movie')) document.getElementById('client-guess-movie').value = '';

            // Reset Firebase status so the TV knows you are ready
            db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update({ status: 'guessing', guess: null });
        }
    });

    // Sync Timer
    db.ref(`rooms/${state.roomCode}/timeLeft`).on('value', snap => {
        if(snap.exists() && document.getElementById('client-timer-display')) document.getElementById('client-timer-display').innerText = snap.val();
    });

    // Sync Math Target Prompts
    db.ref(`rooms/${state.roomCode}/currentPrompt`).on('value', snap => {
        const promptDiv = document.getElementById('client-prompt');
        if (snap.exists() && promptDiv) {
            promptDiv.innerText = snap.val();
            promptDiv.classList.remove('hidden');
        } else if (promptDiv) {
            promptDiv.classList.add('hidden');
        }
    });
}

export async function startMultiplayerGame() {
    document.getElementById('host-lobby-screen').classList.add('hidden');
    
    await db.ref(`rooms/${state.roomCode}`).update({ state: 'playing', currentRound: 1, mode: state.gameState.mode });

    // The normal host listener (just waits for everyone to lock in)
    db.ref(`rooms/${state.roomCode}/players`).on('value', (snap) => {
        if (!state.isHost || !snap.exists()) return;
        
        const players = snap.val();
        let allLocked = true; let lockedCount = 0; let totalPlayers = 0;
        
        Object.keys(players).forEach(pid => {
            const p = players[pid]; totalPlayers++;
            if (p.status === 'locked') lockedCount++; else allLocked = false;
        });

        const lockStatusDiv = document.getElementById('host-lock-status');
        if (lockStatusDiv) lockStatusDiv.innerText = `LOCKED IN: ${lockedCount} / ${totalPlayers}`;

        if (allLocked && totalPlayers > 0 && !state.isProcessing) {
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
    // 1. Grab what the player typed
    const artist = document.getElementById('client-guess-artist').value.trim();
    const song = document.getElementById('client-guess-song').value.trim();
    const movie = document.getElementById('client-guess-movie').value.trim();
    
    // 2. Note how fast they answered
    const currentTime = parseInt(document.getElementById('client-timer-display').innerText) || 0;
    
    // 3. Push it to Firebase so the Host (TV) can grade it!
    db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update({
        guess: { isMC: false, artist: artist, song: song, movie: movie, time: currentTime },
        status: 'locked'
    });
    
    // 4. Hide the text boxes and show the "Locked" screen
    document.getElementById('client-text-inputs').classList.add('hidden');
    document.getElementById('client-locked-screen').classList.remove('hidden');
    
    // 5. Clear the text boxes so they are empty for the next round
    document.getElementById('client-guess-artist').value = '';
    document.getElementById('client-guess-song').value = '';
    document.getElementById('client-guess-movie').value = '';
}

export function requestClientLifeline() {
    // The phone secretly grabs the pre-generated buttons from the background!
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
    const currentTime = parseInt(document.getElementById('client-timer-display').innerText) || 0;
    db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update({
        guess: { isMC: true, correct: isCorrect, time: currentTime },
        status: 'locked'
    });
    document.getElementById('client-mc-inputs').classList.add('hidden');
    document.getElementById('client-locked-screen').classList.remove('hidden');
}
