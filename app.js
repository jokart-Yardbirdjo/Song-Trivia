// app.js
import { state } from './state.js';
import { showModal, hideModal, setMode, setSub, setPill, setLevel, renderPlaylist, renderSubPills, populateStats, setupDailyButton } from './ui.js';
import { handleHostSetup, handleJoinScreen, createRoom, joinRoom, startMultiplayerGame, cancelLobby, cancelActiveGame, submitClientTextGuess, requestClientLifeline } from './multiplayer.js';
import { startDailyChallenge, startGame, handleStop, forceLifeline, evaluateGuess, resetStats, shareChallenge } from './gameLogic.js';

window.showModal = showModal; window.hideModal = hideModal;
window.setMode = setMode; window.setSub = setSub; window.setPill = setPill; window.setLevel = setLevel;
window.renderPlaylist = renderPlaylist;

window.handleHostSetup = handleHostSetup; window.handleJoinScreen = handleJoinScreen;
window.createRoom = createRoom; window.joinRoom = joinRoom;
window.startMultiplayerGame = startMultiplayerGame; window.cancelLobby = cancelLobby;
window.cancelActiveGame = cancelActiveGame; window.submitClientTextGuess = submitClientTextGuess;
window.requestClientLifeline = requestClientLifeline;

window.startDailyChallenge = startDailyChallenge; window.startGame = startGame;
window.handleStop = handleStop; window.forceLifeline = forceLifeline;
window.evaluateGuess = evaluateGuess; window.resetStats = resetStats;
window.shareChallenge = shareChallenge;

window.onload = () => {
    renderSubPills();
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