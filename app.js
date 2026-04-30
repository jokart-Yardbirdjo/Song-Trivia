/**
 * ==============================================================================
 * YARDBIRD'S GAMES - THE CONSOLE CORE (app.js)
 * ==============================================================================
 * Role: The "Motherboard" of the application.
 * Responsibilities: 
 * 1. Boot up the platform and handle URL routing (e.g., auto-joining multiplayer rooms).
 * 2. Load and validate "Cartridges" (games) to ensure they meet the system contract.
 * 3. Delegate global DOM events (button clicks, form submits) to the active Cartridge.
 * * Architecture Note: NEVER put specific game logic (like math problems or song 
 * fetching) in this file. All logic belongs in the Cartridges.
 * ==============================================================================
 */

// ==========================================
// PHASE 1: IMPORTS & CARTRIDGES
// ==========================================
// Consolidate the state and bgm import here!
import { state, bgm } from './state.js';

import { 
    showModal, hideModal, setMode, setSub, setPill, setLevel, 
    renderPlaylist, setupDailyButton, buildSetupScreen, updatePlatformUI,
    buildCartridgeMenu // <--- ADD THIS HERE
} from './ui.js';
import { 
    handleHostSetup, handleJoinScreen, createRoom, joinRoom, 
    startMultiplayerGame, cancelLobby, cancelActiveGame, 
    submitClientTextGuess, requestClientLifeline 
} from './multiplayer.js';

// The Game Cartridges
import * as SongTrivia from './gameLogic.js';
import * as FastMath from './mathLogic.js';
import * as Consensus from './consensusLogic.js';
import * as QuoteTrivia from './quoteLogic.js';
import * as TheReveal from './revealLogic.js';


// ==========================================
// THE REGISTRY: Single source of truth for games
// ==========================================
export const cartridgeRegistry = [
    { id: 'song_trivia', module: SongTrivia, icon: '🎵' },
    { id: 'fast_math',   module: FastMath,   icon: '⚡' },
    { id: 'the_reveal',  module: TheReveal,  icon: '👁️' },
    { id: 'consensus',   module: Consensus,  icon: '🤔' },
    { id: 'who_said_it', module: QuoteTrivia,  icon: '💬' } // <--- FIXED THIS LINE
];

// Default the system to Song Trivia on load to prevent null references
window.activeCartridge = SongTrivia;


// ==========================================
// PHASE 2: GLOBAL UI & MULTIPLAYER BRIDGE
// ==========================================
// Because we use ES6 Modules, functions aren't automatically available to 
// inline HTML onclick handlers. We "bridge" them to the window object here.

// UI Toggles
window.showModal = showModal; 
window.hideModal = hideModal;
window.setMode = setMode; 
window.setSub = setSub; 
window.setPill = setPill; 
window.setLevel = setLevel;
window.renderPlaylist = renderPlaylist;

// Multiplayer Lifecycle
window.handleHostSetup = handleHostSetup; 
window.handleJoinScreen = handleJoinScreen;
window.createRoom = createRoom; 
window.joinRoom = joinRoom;
window.startMultiplayerGame = startMultiplayerGame; 
window.cancelLobby = cancelLobby;
window.cancelActiveGame = cancelActiveGame; 
window.submitClientTextGuess = submitClientTextGuess;
window.requestClientLifeline = requestClientLifeline;


// ==========================================
// PHASE 3: THE ENGINE CORE (ROUTING & VALIDATION)
// ==========================================

/**
 * THE CARTRIDGE CONTRACT
 * Every new game file MUST export these specific functions and objects.
 * If a developer forgets one, the console will reject the cartridge and show an error,
 * protecting the platform from a hard crash.
 */
function validateCartridge(cartridge) {
    const requiredExports = [
        'manifest', 'startGame', 'handleStop', 'resetStats', 
        'shareChallenge', 'renderStatsUI', 'evaluateGuess'
    ];
    
    const missing = requiredExports.filter(req => typeof cartridge[req] === 'undefined');
    
    if (missing.length > 0) {
        throw new Error(`Cartridge Contract Violation: Missing ${missing.join(', ')}`);
    }
    return true;
}

/**
 * Routes the system to the selected game and validates it.
 * @param {string} gameId - The ID of the game from the main menu.
 */
window.loadCartridge = (gameId) => {
       
    // Automatically find the game in the registry instead of using if/else
    const cartridgeDef = cartridgeRegistry.find(c => c.id === gameId);
    
    if (!cartridgeDef) {
        console.error("Cartridge not found in registry:", gameId);
        return;
    }
    
    let targetCartridge = cartridgeDef.module;
    
    // Strict Validation: Will throw an error if the cartridge is incomplete
    validateCartridge(targetCartridge);
    
    // Engage the Cartridge
    window.activeCartridge = targetCartridge;
    state.activeCartridgeId = gameId;
    
    // Update Global Platform UI
    document.getElementById('main-title').innerText = window.activeCartridge.manifest.title;
    updatePlatformUI(gameId); 
};

/**
 * Triggered when a user clicks a game card on the Main Menu.
 * Wraps loadCartridge in an Error Boundary for Premium UX.
 */
window.selectGame = (gameId) => {
    try {
        window.loadCartridge(gameId); 
        
        // Pass the cartridge's manifest (modes, levels, rules) to the UI builder
        buildSetupScreen(window.activeCartridge.manifest);

        // Transition screens
        document.getElementById('main-menu-screen').classList.add('hidden');
        document.getElementById('setup-screen').classList.remove('hidden');
    } catch(e) {
        console.error("Cartridge Load Error:", e);
        
        // 🚨 Error Boundary: Prevents the app from freezing. Displays a clean tech-error UI.
        const titleEl = document.getElementById('main-title');
        if (titleEl) titleEl.innerText = "SYSTEM ERROR";
        
        document.getElementById('main-menu-screen').innerHTML = `
            <div style="background: rgba(214, 48, 49, 0.1); border: 2px solid var(--fail); padding: 30px; border-radius: 16px; text-align: center; margin-top: 20px;">
                <h2 style="color: var(--fail); font-size: 2rem; margin-top: 0;">Corrupt Cartridge</h2>
                <p style="color: var(--dark-text); font-size: 1.1rem;">The engine caught an error while trying to load this game. It is missing required core functions.</p>
                <div style="background: #111; color: #ff6b6b; padding: 10px; border-radius: 8px; font-family: monospace; font-size: 0.85rem; margin: 15px 0;">${e.message}</div>
                <button class="btn btn-main" onclick="location.reload()" style="margin-top: 10px;">Reboot System</button>
            </div>
        `;
    }
};


// ==========================================
// PHASE 4: THE DELEGATION HOOKS
// ==========================================
// The HTML file only knows to call `window.startGame()`. 
// These hooks intercept that call and pass it down to whatever game is currently active.

window.startDailyChallenge = () => window.activeCartridge.startDailyChallenge();

// ── SILENT AUDIO UNLOCKER ──
window.startGame = () => {
    // Browsers block audio if there are 'await' network calls before play().
    // By playing and instantly pausing exactly when the user clicks "Let's Go!", 
    // we permanently unlock the audio element for the session.
    if (bgm) {
        bgm.play().catch(() => {}); // Catch prevents console errors if it's already playing
        bgm.pause();
    }
    
    // Now trigger the actual game boot sequence
    window.activeCartridge.startGame();
};

window.handleStop = () => window.activeCartridge.handleStop();
window.forceLifeline = () => window.activeCartridge.forceLifeline();
window.evaluateGuess = (isCorrect, clickedBtn) => window.activeCartridge.evaluateGuess(isCorrect, clickedBtn);
window.resetStats = () => window.activeCartridge.resetStats();
window.shareChallenge = () => window.activeCartridge.shareChallenge();
window.evaluateMultiplayerRound = (players) => window.activeCartridge.evaluateMultiplayerRound(players);


// ==========================================
// PHASE 5: PLATFORM BOOT SEQUENCE
// ==========================================

window.onload = () => {
    // 1. Reset visual state
    document.getElementById('main-title').innerText = "YARDBIRD'S GAMES";
    updatePlatformUI('main_menu'); 
    
    // 2. Daily Tracking Check
    // Safely check the nested song_trivia stats to see if a new day has started
    const todayStr = new Date().toDateString();
    if (state.userStats.song_trivia && state.userStats.song_trivia.lastPlayedDate !== todayStr && state.userStats.song_trivia.lastPlayedDate !== null) {
        state.userStats.song_trivia.playedDailyToday = false;
        localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
    }
    setupDailyButton();

    // 3. URL Parameter Routing (Deep Linking)
    // If a user clicks a link like "yardbirds.com/?room=ABCD", intercept it and jump to lobby
    const urlParams = new URLSearchParams(window.location.search);
    const autoRoom = urlParams.get('room');
    if (autoRoom) {
        document.getElementById('main-menu-screen').classList.add('hidden'); 
        handleJoinScreen(); 
        document.getElementById('join-code').value = autoRoom; 
        
        // Scrub the URL so refreshing doesn't cause weird loops
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => document.getElementById('join-name').focus(), 100);
    }
};

/**
 * Global DOM Event Listeners
 * Allows players to hit "Enter" on their keyboard to submit text answers.
 */

// Inject the new horizontal carousel menu!
buildCartridgeMenu(cartridgeRegistry);

document.addEventListener("DOMContentLoaded", () => {
           
    const triggerSubmit = (e) => { 
        if (e.key === 'Enter') document.getElementById('submit-btn').click(); 
    };
    
    // Binds exclusively to the specific input fields used in Text-based cartridges
    if(document.getElementById('guess-artist')) document.getElementById('guess-artist').addEventListener('keypress', triggerSubmit);
    if(document.getElementById('guess-song')) document.getElementById('guess-song').addEventListener('keypress', triggerSubmit);
    if(document.getElementById('guess-movie')) document.getElementById('guess-movie').addEventListener('keypress', triggerSubmit);
});
