// multiplayer.js
import { db } from './firebase.js';
import { state, colors } from './state.js';
import { hideModal } from './ui.js';
import { executeFetchLogic, evaluateMultiplayerRound, submitClientMCGuess } from './gameLogic.js';

export function handleHostSetup() {
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
    
    // NEW PATH: Namespaced to 'songtrivia'
    await db.ref(`rooms/songtrivia/${state.roomCode}`).set({
        state: 'lobby',
        settings: state.gameState,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('host-lobby-screen').classList.remove('hidden');
    document.getElementById('display-room-code').innerText = state.roomCode;

    document.getElementById('qr-container').innerHTML = ""; 
    const joinUrl = window.location.origin + window.location.pathname + "?room=" + state.roomCode;
    new QRCode(document.getElementById("qr-container"), {
        text: joinUrl,
        width: 160, height: 160,
        colorDark : "#0a0a0c", colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.M
    });

    db.ref(`rooms/songtrivia/${state.roomCode}/players`).on('value', (snapshot) => {
        const players = snapshot.val();
        const listDiv = document.getElementById('lobby-player-list');
        listDiv.innerHTML = '';
        
        if (players) {
            const playerIds = Object.keys(players);
            state.numPlayers = playerIds.length;
            document.getElementById('player-count').innerText = state.numPlayers;
            document.getElementById('start-multiplayer-btn').disabled = state.numPlayers === 0;

            playerIds.forEach((pid, index) => {
                const p = players[pid];
                const pTag = document.createElement('div');
                pTag.className = 'pill active';
                pTag.style.borderColor = colors[index % colors.length];
                pTag.innerText = p.name;
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

    const roomSnap = await db.ref(`rooms/songtrivia/${codeInput}`).once('value');
    if (!roomSnap.exists()) {
        fb.innerText = "Room not found. Check the code!";
        return;
    }
    
    const roomData = roomSnap.val();
    if (roomData.state !== 'lobby') {
        fb.innerText = "Game is already in progress!";
        return;
    }

    state.roomCode = codeInput;
    state.myPlayerId = "player_" + Date.now() + Math.floor(Math.random()*1000); 

    await db.ref(`rooms/songtrivia/${state.roomCode}/players/${state.myPlayerId}`).set({
        name: nameInput,
        score: 0,
        status: 'waiting'
    });

    db.ref(`rooms/songtrivia/${state.roomCode}/players/${state.myPlayerId}`).onDisconnect().remove();

    document.getElementById('join-screen').classList.add('hidden');
    
    const waitScreen = document.createElement('div');
    waitScreen.id = 'client-wait-screen';
    waitScreen.innerHTML = `
        <h2 style="color:var(--brand);">You're in!</h2>
        <p style="font-size:1.2rem;">Look at the big screen.</p>
        <div class="visualizer active" style="margin-top:20px;">
            <div class="vis-bar" style="background:var(--p1)"></div>
            <div class="vis-bar" style="background:var(--p2)"></div>
            <div class="vis-bar" style="background:var(--p3)"></div>
        </div>
    `;
    document.querySelector('.container').appendChild(waitScreen);

    db.ref(`rooms/songtrivia/${state.roomCode}/state`).on('value', (snap) => {
        if (!snap.exists()) {
            alert("The host has ended the session!");
            location.reload();
        } else if (snap.val() === 'playing') {
            document.getElementById('client-wait-screen').classList.add('hidden');
            document.getElementById('client-play-screen').classList.remove('hidden');
            
            db.ref(`rooms/songtrivia/${state.roomCode}/mode`).once('value', (modeSnap) => {
                const mode = modeSnap.val();
                document.getElementById('client-guess-artist').classList.toggle('hidden', mode !== 'genre');
                document.getElementById('client-guess-song').classList.toggle('hidden', mode === 'movie');
                document.getElementById('client-guess-movie').classList.toggle('hidden', mode !== 'movie');
            });
        } else if (snap.val() === 'finished') {
            document.getElementById('client-play-screen').classList.add('hidden');
            document.getElementById('client-end-screen').classList.remove('hidden');
            
            db.ref(`rooms/songtrivia/${state.roomCode}/players/${state.myPlayerId}/finalScore`).on('value', scoreSnap => {
                if (scoreSnap.exists()) {
                    document.getElementById('client-final-score').innerText = scoreSnap.val();
                }
            });
        }
    });

    db.ref(`rooms/songtrivia/${state.roomCode}/lifelineForced`).on('value', snap => {
        if (snap.val() === true && document.getElementById('client-locked-screen').classList.contains('hidden') && !document.getElementById('client-play-screen').classList.contains('hidden')) {
            requestClientLifeline();
        }
    });

    db.ref(`rooms/songtrivia/${state.roomCode}/players/${state.myPlayerId}/status`).on('value', snap => {
        if (snap.val() === 'guessing') {
            document.getElementById('client-locked-screen').classList.add('hidden');
            document.getElementById('client-mc-inputs').classList.add('hidden');
            document.getElementById('client-text-inputs').classList.remove('hidden');
            document.getElementById('client-guess-artist').value = "";
            document.getElementById('client-guess-song').value = "";
            document.getElementById('client-guess-movie').value = "";
        }
    });

    db.ref(`rooms/songtrivia/${state.roomCode}/timeLeft`).on('value', snap => {
        if(snap.exists() && document.getElementById('client-timer-display')) {
            document.getElementById('client-timer-display').innerText = snap.val();
        }
    });

    db.ref(`rooms/songtrivia/${state.roomCode}/phase`).on('value', snap => {
        if(snap.exists() && snap.val() === 'grace') {
            document.getElementById('client-grace-msg').classList.remove('hidden');
        } else if (snap.exists() && snap.val() === 'audio') {
            document.getElementById('client-grace-msg').classList.add('hidden');
        }
    });

    db.ref(`rooms/songtrivia/${state.roomCode}/currentRound`).on('value', snap => {
        if(snap.exists() && document.getElementById('client-status')) {
            document.getElementById('client-status').innerText = `ROUND ${snap.val()}`;
        }
    });
}

export async function startMultiplayerGame() {
    document.getElementById('host-lobby-screen').classList.add('hidden');
    
    await db.ref(`rooms/songtrivia/${state.roomCode}`).update({
        state: 'playing',
        currentRound: 1,
        mode: state.gameState.mode
    });

    db.ref(`rooms/songtrivia/${state.roomCode}/players`).on('value', (snap) => {
        if (!state.isHost || !snap.exists()) return;
        
        const players = snap.val();
        let allLocked = true;
        let lockedCount = 0;
        let totalPlayers = 0;
        
        Object.values(players).forEach(p => {
            totalPlayers++;
            if (p.status === 'locked') {
                lockedCount++;
            } else {
                allLocked = false;
            }
        });

        const lockStatusDiv = document.getElementById('host-lock-status');
        if (lockStatusDiv) lockStatusDiv.innerText = `LOCKED IN: ${lockedCount} / ${totalPlayers}`;

        if (allLocked && totalPlayers > 0 && !state.isProcessing) {
            evaluateMultiplayerRound(players);
        }
    });

    document.getElementById('feedback-setup').innerText = "Connecting to iTunes Database...";
    executeFetchLogic();
}

export async function cancelLobby() {
    if (state.roomCode) {
        await db.ref(`rooms/songtrivia/${state.roomCode}`).remove();
    }
    location.reload(); 
}

export async function cancelActiveGame() {
    if (confirm("Are you sure you want to end the game for everyone?")) {
        if (state.isMultiplayer && state.isHost && state.roomCode) {
            await db.ref(`rooms/songtrivia/${state.roomCode}`).remove();
        }
        location.reload(); 
    }
}

export function submitClientTextGuess() {
    const artG = document.getElementById('client-guess-artist').value.trim();
    const sonG = document.getElementById('client-guess-song').value.trim();
    const movG = document.getElementById('client-guess-movie').value.trim();
    
    const currentTime = parseInt(document.getElementById('client-timer-display').innerText) || 0;
    const currentPhase = !document.getElementById('client-grace-msg').classList.contains('hidden') ? 'grace' : 'audio';

    db.ref(`rooms/songtrivia/${state.roomCode}/players/${state.myPlayerId}`).update({
        guess: { artist: artG, song: sonG, movie: movG, isMC: false, time: currentTime, phase: currentPhase },
        status: 'locked'
    });

    document.getElementById('client-text-inputs').classList.add('hidden');
    document.getElementById('client-locked-screen').classList.remove('hidden');
}

export function requestClientLifeline() {
    db.ref(`rooms/songtrivia/${state.roomCode}/currentMC`).once('value', snap => {
        const options = snap.val();
        if(options) renderClientMC(options);
    });
}

function renderClientMC(options) {
    document.getElementById('client-text-inputs').classList.add('hidden');
    const mcContainer = document.getElementById('client-mc-inputs');
    mcContainer.innerHTML = '';
    mcContainer.classList.remove('hidden');

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'mc-btn';
        btn.innerText = opt.str;
        btn.onclick = () => submitClientMCGuess(opt.isCorrect);
        mcContainer.appendChild(btn);
    });
}