// app.js
import { state } from './state.js';
import { showModal, hideModal, setMode, setSub, setPill, setLevel, renderPlaylist, setupDailyButton, buildSetupScreen, updatePlatformUI } from './ui.js';
import { handleHostSetup, handleJoinScreen, createRoom, joinRoom, startMultiplayerGame, cancelLobby, cancelActiveGame, submitClientTextGuess, requestClientLifeline } from './multiplayer.js';

import * as SongTrivia from './gameLogic.js';
import * as FastMath from './mathLogic.js';
import * as Consensus from './consensusLogic.js';
import * as QuoteTrivia from './quoteLogic.js';

// Attach to window so buttons can always find the active cartridge
window.activeCartridge = SongTrivia; 

window.showModal = showModal; window.hideModal = hideModal;
window.setMode = setMode; window.setSub = setSub; window.setPill = setPill; window.setLevel = setLevel;
window.renderPlaylist = renderPlaylist;
window.handleHostSetup = handleHostSetup; window.handleJoinScreen = handleJoinScreen;
window.createRoom = createRoom; window.joinRoom = joinRoom;
window.startMultiplayerGame = startMultiplayerGame; window.cancelLobby = cancelLobby;
window.cancelActiveGame = cancelActiveGame; window.submitClientTextGuess = submitClientTextGuess;
window.requestClientLifeline = requestClientLifeline;

// 👇 ADD THIS VALIDATOR 👇
function validateCartridge(cartridge) {
    // 👇 Added 'renderStatsUI' to the strict contract 👇
    const requiredExports = ['manifest', 'startGame', 'handleStop', 'resetStats', 'shareChallenge', 'renderStatsUI', 'evaluateGuess'];
    const missing = requiredExports.filter(req => typeof cartridge[req] === 'undefined');
    
    if (missing.length > 0) {
        throw new Error(`Cartridge Contract Violation: Missing ${missing.join(', ')}`);
    }
    return true;
}

window.loadCartridge = (gameId) => {
    let targetCartridge;
    
    // Routing logic
    if (gameId === 'fast_math') targetCartridge = FastMath;
    else if (gameId === 'consensus') targetCartridge = Consensus;
    else if (gameId === 'who_said_it') targetCartridge = QuoteTrivia;
    else targetCartridge = SongTrivia;
    
    // Validate BEFORE making it active
    validateCartridge(targetCartridge);
    
    window.activeCartridge = targetCartridge;
    state.activeCartridgeId = gameId;
    document.getElementById('main-title').innerText = window.activeCartridge.manifest.title;
    updatePlatformUI(gameId); 
};

window.selectGame = (gameId) => {
    try {
        window.loadCartridge(gameId); 
        buildSetupScreen(window.activeCartridge.manifest);

        // 👇 ADD THIS BLOCK RIGHT HERE 👇
        if (window.activeCartridge && window.activeCartridge.checkDailyReset) {
            window.activeCartridge.checkDailyReset();
        }

        document.getElementById('main-menu-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
    } catch(e) {
        console.error("Cartridge Load Error:", e);
        // 👇 Premium Error Boundary UX 👇
        const titleEl = document.getElementById('main-title');
        if (titleEl) titleEl.innerText = "SYSTEM ERROR";
        
        document.getElementById('main-menu-screen').innerHTML = `
            <div style="background: rgba(214, 48, 49, 0.1); border: 2px solid var(--fail); padding: 30px; border-radius: 16px; text-align: center; margin-top: 20px;">
                <h2 style="color: var(--fail); font-size: 2rem; margin-top: 0;">Corrupt Cartridge</h2>
                <p style="color: var(--dark-text); font-size: 1.1rem;">The engine caught an error while trying to load this game. It's missing required core functions.</p>
                <div style="background: #111; color: #ff6b6b; padding: 10px; border-radius: 8px; font-family: monospace; font-size: 0.85rem; margin: 15px 0;">${e.message}</div>
                <button class="btn btn-main" onclick="location.reload()" style="margin-top: 10px;">Reboot System</button>
            </div>
        `;
    }
};

window.startDailyChallenge = () => window.activeCartridge.startDailyChallenge();
window.startGame = () => window.activeCartridge.startGame();
window.handleStop = () => window.activeCartridge.handleStop();
window.forceLifeline = () => window.activeCartridge.forceLifeline();
window.evaluateGuess = (isCorrect) => window.activeCartridge.evaluateGuess(isCorrect);
window.resetStats = () => window.activeCartridge.resetStats();
window.shareChallenge = () => window.activeCartridge.shareChallenge();
window.evaluateMultiplayerRound = (players) => window.activeCartridge.evaluateMultiplayerRound(players);

// In app.js window.onload
window.onload = () => {
    document.getElementById('main-title').innerText = "YARDBIRD'S GAMES";
    updatePlatformUI('main_menu'); 
    
    // 👇 THE FIX: Ask the cartridge to check its own daily reset logic
    if (window.activeCartridge && window.activeCartridge.checkDailyReset) {
        window.activeCartridge.checkDailyReset();
    }
    
    setupDailyButton();

    const urlParams = new URLSearchParams(window.location.search);
    const autoRoom = urlParams.get('room');
    if (autoRoom) {
        document.getElementById('main-menu-screen').classList.add('hidden'); 
        handleJoinScreen(); 
        document.getElementById('join-code').value = autoRoom; 
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => document.getElementById('join-name').focus(), 100);
    }
};

document.addEventListener("DOMContentLoaded", () => {
    const triggerSubmit = (e) => { if (e.key === 'Enter') document.getElementById('submit-btn').click(); };
    if(document.getElementById('guess-artist')) document.getElementById('guess-artist').addEventListener('keypress', triggerSubmit);
    if(document.getElementById('guess-song')) document.getElementById('guess-song').addEventListener('keypress', triggerSubmit);
    if(document.getElementById('guess-movie')) document.getElementById('guess-movie').addEventListener('keypress', triggerSubmit);
});
