// app.js
import { state } from './state.js';
import { showModal, hideModal, setMode, setSub, setPill, setLevel, renderPlaylist, renderSubPills, setupDailyButton, buildSetupScreen, updatePlatformUI } from './ui.js';
import { handleHostSetup, handleJoinScreen, createRoom, joinRoom, startMultiplayerGame, cancelLobby, cancelActiveGame, submitClientTextGuess, requestClientLifeline } from './multiplayer.js';

import * as SongTrivia from './gameLogic.js';
import * as FastMath from './mathLogic.js';

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

window.loadCartridge = (gameId) => {
    window.activeCartridge = gameId === 'fast_math' ? FastMath : SongTrivia;
    state.activeCartridgeId = gameId;
    document.getElementById('main-title').innerText = window.activeCartridge.manifest.title;
    updatePlatformUI(gameId); 
};

window.selectGame = (gameId) => {
    try {
        window.loadCartridge(gameId); 
        buildSetupScreen(window.activeCartridge.manifest);
        if (gameId === 'song_trivia') renderSubPills();

        document.getElementById('main-menu-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
    } catch(e) {
        console.error("Cartridge Load Error:", e);
        alert("Oops! The engine hit an error loading this game. Check the console.");
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

window.onload = () => {
    document.getElementById('main-title').innerText = "YARDBIRD'S GAMES";
    updatePlatformUI('main_menu'); 
    
    // Safely check the nested song_trivia stats
    const todayStr = new Date().toDateString();
    if (state.userStats.song_trivia && state.userStats.song_trivia.lastPlayedDate !== todayStr && state.userStats.song_trivia.lastPlayedDate !== null) {
        state.userStats.song_trivia.playedDailyToday = false;
        localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
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
