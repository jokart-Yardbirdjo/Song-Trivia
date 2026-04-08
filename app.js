// app.js
import { state } from './state.js';
import { showModal, hideModal, setMode, setSub, setPill, setLevel, renderPlaylist, renderSubPills, populateStats, setupDailyButton, buildSetupScreen } from './ui.js';
import { handleHostSetup, handleJoinScreen, createRoom, joinRoom, startMultiplayerGame, cancelLobby, cancelActiveGame, submitClientTextGuess, requestClientLifeline } from './multiplayer.js';

// 🎮 IMPORT ALL AVAILABLE CARTRIDGES
import * as SongTrivia from './gameLogic.js';
import * as FastMath from './mathLogic.js';

// 🔌 Use 'let' so we can dynamically swap it when the user clicks a button!
let activeCartridge = SongTrivia; // Default fallback

window.showModal = showModal; window.hideModal = hideModal;
window.setMode = setMode; window.setSub = setSub; window.setPill = setPill; window.setLevel = setLevel;
window.renderPlaylist = renderPlaylist;
window.handleHostSetup = handleHostSetup; window.handleJoinScreen = handleJoinScreen;
window.createRoom = createRoom; window.joinRoom = joinRoom;
window.startMultiplayerGame = startMultiplayerGame; window.cancelLobby = cancelLobby;
window.cancelActiveGame = cancelActiveGame; window.submitClientTextGuess = submitClientTextGuess;
window.requestClientLifeline = requestClientLifeline;

// 🕹️ NEW: THE CARTRIDGE LOADER
window.selectGame = (gameId) => {
    // 1. Swap the internal active cartridge
    activeCartridge = gameId === 'fast_math' ? FastMath : SongTrivia;
    
    // 2. Build the UI specifically for the chosen game!
    buildSetupScreen(activeCartridge.manifest);
    if (activeCartridge.manifest.id === 'song_trivia') renderSubPills();

    // 3. Hide the main menu, and reveal the setup screen
    document.getElementById('main-menu-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
};

// Route universal buttons to the active cartridge
window.startDailyChallenge = () => activeCartridge.startDailyChallenge();
window.startGame = () => activeCartridge.startGame();
window.handleStop = () => activeCartridge.handleStop();
window.forceLifeline = () => activeCartridge.forceLifeline();
window.evaluateGuess = (isCorrect) => activeCartridge.evaluateGuess(isCorrect);
window.resetStats = () => activeCartridge.resetStats();
window.shareChallenge = () => activeCartridge.shareChallenge();
window.evaluateMultiplayerRound = (players) => activeCartridge.evaluateMultiplayerRound(players);

window.onload = () => {
    const todayStr = new Date().toDateString();
    if (state.userStats.lastPlayedDate !== todayStr && state.userStats.lastPlayedDate !== null) {
        state.userStats.playedDailyToday = false;
        localStorage.setItem('yardbirdStatsV6', JSON.stringify(state.userStats));
    }
    populateStats();
    setupDailyButton();

    // Handle Auto-Join via QR Code
    const urlParams = new URLSearchParams(window.location.search);
    const autoRoom = urlParams.get('room');
    if (autoRoom) {
        document.getElementById('main-menu-screen').classList.add('hidden'); // Hide menu for phones!
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
