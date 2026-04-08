// app.js
import { state } from './state.js';
import { showModal, hideModal, setMode, setSub, setPill, setLevel, renderPlaylist, renderSubPills, populateStats, setupDailyButton, buildSetupScreen } from './ui.js';
import { handleHostSetup, handleJoinScreen, createRoom, joinRoom, startMultiplayerGame, cancelLobby, cancelActiveGame, submitClientTextGuess, requestClientLifeline } from './multiplayer.js';

// 🎮 1. IMPORT THE CARTRIDGES
import * as SongTrivia from './gameLogic.js';
import * as FastMath from './mathLogic.js';

// 🔌 2. THE CONSOLE SWITCH (Change to SongTrivia to play music!)
const activeCartridge = FastMath; 

// Expose UI & Multiplayer functions to HTML
window.showModal = showModal; window.hideModal = hideModal;
window.setMode = setMode; window.setSub = setSub; window.setPill = setPill; window.setLevel = setLevel;
window.renderPlaylist = renderPlaylist;
window.handleHostSetup = handleHostSetup; window.handleJoinScreen = handleJoinScreen;
window.createRoom = createRoom; window.joinRoom = joinRoom;
window.startMultiplayerGame = startMultiplayerGame; window.cancelLobby = cancelLobby;
window.cancelActiveGame = cancelActiveGame; window.submitClientTextGuess = submitClientTextGuess;
window.requestClientLifeline = requestClientLifeline;

// 🕹️ 3. ROUTE HTML BUTTONS TO THE ACTIVE CARTRIDGE
window.startDailyChallenge = () => activeCartridge.startDailyChallenge();
window.startGame = () => activeCartridge.startGame();
window.handleStop = () => activeCartridge.handleStop();
window.forceLifeline = () => activeCartridge.forceLifeline();
window.evaluateGuess = (isCorrect) => activeCartridge.evaluateGuess(isCorrect);
window.resetStats = () => activeCartridge.resetStats();
window.shareChallenge = () => activeCartridge.shareChallenge();
window.evaluateMultiplayerRound = (players) => activeCartridge.evaluateMultiplayerRound(players);

window.onload = () => {
    // Tell UI to build the screen based on the active cartridge!
    buildSetupScreen(activeCartridge.manifest);

    // Only render the Era/Genre pills if we are playing Song Trivia
    if (activeCartridge.manifest.id === 'song_trivia') {
        renderSubPills();
    }

    const todayStr = new Date().toDateString();
    if (state.userStats.lastPlayedDate !== todayStr && state.userStats.lastPlayedDate !== null) {
        state.userStats.playedDailyToday = false;
        localStorage.setItem('yardbirdStatsV6', JSON.stringify(state.userStats));
    }
    populateStats();
    setupDailyButton();

    const urlParams = new URLSearchParams(window.location.search);
    const autoRoom = urlParams.get('room');
    if (autoRoom) {
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
