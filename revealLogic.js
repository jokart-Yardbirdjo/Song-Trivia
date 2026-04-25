/**
 * ==============================================================================
 * YARDBIRD'S GAMES - CARTRIDGE: THE REVEAL (revealLogic.js)
 * ==============================================================================
 * Role: Handles the visual pattern-recognition game where images unblur over time.
 * Architecture: JSON + Wikipedia Action API (Keyless, infinite scaling).
 * * PHASES:
 * 1. Manifest & Config   (Setup screen data)
 * 2. Local State         (Cartridge-specific variables)
 * 3. Core Game Loop      (Start, Round Management, End)
 * 4. Data & Network      (JSON loading, Wikipedia API fetching, Image Preloading)
 * 5. Mechanics & UI      (Timer, CSS Unblur, Multiple Choice generation)
 * ==============================================================================
 */

import { db } from './firebase.js';
import { state, sfxTick, sfxCheer, sfxBuzzer, colors } from './state.js';
import { finalizeMultiplayerRound } from './multiplayer.js';

// ==========================================
// PHASE 1: MANIFEST & CONFIG
// ==========================================

export const manifest = {
    id: "the_reveal",
    title: "THE REVEAL",
    subtitle: "Visual Pattern Recognition",
    hasDaily: false,
    rulesHTML: `
        <h2>How to Play</h2>
        <div style="text-align:left; color:var(--dark-text); line-height:1.7; font-size:0.95rem;">
            <p>An image will appear completely <strong>blurred out</strong>.</p>
            <p>Over exactly 30 seconds, the image will slowly come into focus.</p>
            <p>Tap the correct multiple-choice button as fast as you can. 
               <strong style="color:var(--primary);">The blurrier the image when you guess, the more points you lock in.</strong></p>
        </div>
        <button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top:15px; width:100%;">Let's Go!</button>
    `,
    modes: [
        { id: "media", title: "🎬 Media", desc: "Movie posters and iconic album covers." },
        { id: "megastars", title: "🌟 Megastars", desc: "Actors, athletes, and pop culture icons." },
        { id: "masterpieces", title: "🎨 Masterpieces", desc: "Famous art and historical photography." }
    ]
};

// ==========================================
// PHASE 2: LOCAL STATE
// ==========================================
// Purpose: Contains variables only relevant to this cartridge to prevent polluting state.js

const revealState = {
    localDB: null,         // Holds the parsed db_reveal.json
    currentRound: 0,
    maxRounds: 5,          // Can adjust based on preference
    currentData: null,     // The current object { imageKeyword, answer, wrong }
    timerInterval: null,
    timeLeft: 30.0,        // Float for smooth UI updates
    maxTime: 30.0,
    hasGuessed: false,
    currentScorePotential: 0
};

// Inject required Hardware-Accelerated CSS dynamically so we don't clutter style.css
const style = document.createElement('style');
style.innerHTML = `
    .reveal-image-container {
        width: 100%;
        max-width: 400px;
        height: 400px;
        margin: 0 auto 20px auto;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        background: #121212;
        position: relative;
    }
    .reveal-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        /* Hardware acceleration for smooth unblurring */
        will-change: filter;
        transform: translateZ(0); 
    }
`;
document.head.appendChild(style);

// ==========================================
// PHASE 3: CORE GAME LOOP
// ==========================================

/**
 * Function: startGame
 * Purpose: Fired by app.js when the Host starts the game from the lobby.
 */
export async function startGame() {
    // 1. Reset Cartridge State
    revealState.currentRound = 0;
    revealState.hasGuessed = false;
    state.rawScores = state.isMultiplayer ? {} : [0]; 

    // 2. Load the Local Database
    await loadLocalDatabase();

    // 3. Prep UI & Start First Round
    document.getElementById('play-screen').classList.remove('hidden');
    document.getElementById('setup-screen').classList.add('hidden');
    
    startRound();
}

/**
 * Function: startRound
 * Purpose: Picks the data, fetches the image, preloads it, and kicks off the timer.
 */
async function startRound() {
    revealState.currentRound++;
    revealState.hasGuessed = false;
    revealState.timeLeft = revealState.maxTime;

    // 1. Pick random entry from the selected mode
    const modeData = revealState.localDB[state.gameState.mode];
    revealState.currentData = modeData[Math.floor(Math.random() * modeData.length)];

    // 2. Fetch Wikipedia Image URL
    renderLoadingState("Fetching secure image data...");
    const imageUrl = await fetchWikipediaImage(revealState.currentData.imageKeyword);

    if (!imageUrl) {
        console.error("Wikipedia returned no image. Skipping to next round.");
        return startRound(); // Fallback if Wikipedia fails
    }

    // 3. Preload the Image (CRITICAL: prevents starting timer before image paints)
    renderLoadingState("Downloading high-res image...");
    await preloadImage(imageUrl);

    // 4. Render the UI and Start the Blur Clock
    renderGameplayUI(imageUrl);
    startBlurTimer();
}

/**
 * Function: endRound
 * Purpose: Snaps the image to clear, reveals the correct answer, and preps next round.
 */
function endRound() {
    clearInterval(revealState.timerInterval);
    
    // Snap blur to 0 immediately
    const imgEl = document.getElementById('reveal-active-image');
    if (imgEl) imgEl.style.filter = `blur(0px)`;

    // Highlight correct answer
    const buttons = document.querySelectorAll('.mc-btn');
    buttons.forEach(btn => {
        if (btn.innerText === revealState.currentData.answer) {
            btn.classList.add('correct-flash');
        } else {
            btn.style.opacity = '0.3';
        }
    });

    // Check game over or next round
    setTimeout(() => {
        if (revealState.currentRound >= revealState.maxRounds) {
            endGameSequence();
        } else {
            startRound();
        }
    }, 4000); // Wait 4 seconds for players to see the unblurred image
}

/**
 * Function: endGameSequence
 * Purpose: Cleans up the UI, evaluates high scores, and shows the final results.
 */
export function endGameSequence() {
    document.getElementById('play-screen').classList.add('hidden');
    document.getElementById('final-screen').classList.remove('hidden');
    // NOTE: Call standard platform UI score rendering here (like in mathLogic)
}

// ==========================================
// PHASE 4: DATA & NETWORK
// ==========================================

/**
 * Function: loadLocalDatabase
 * Purpose: Fetches the db_reveal.json file from the server into memory.
 */
async function loadLocalDatabase() {
    try {
        const response = await fetch('./db_reveal.json');
        revealState.localDB = await response.json();
    } catch (err) {
        console.error("Failed to load db_reveal.json:", err);
        alert("Fatal Error: Could not load the image database.");
    }
}

/**
 * Function: fetchWikipediaImage
 * Purpose: Hits the keyless Wikipedia Action API and extracts the main image URL.
 * @param {string} pageTitle - The exact Wikipedia page title (e.g., "The Dark Knight (film)")
 * @returns {string|null} - The URL of the image, or null if not found.
 */
async function fetchWikipediaImage(pageTitle) {
    const title = encodeURIComponent(pageTitle);
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${title}&prop=pageimages&format=json&pithumbsize=600&origin=*`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        
        if (pages[pageId].thumbnail && pages[pageId].thumbnail.source) {
            return pages[pageId].thumbnail.source;
        }
        return null;
    } catch (err) {
        console.error("Wikipedia API fetch failed:", err);
        return null;
    }
}

/**
 * Function: preloadImage
 * Purpose: Forces the browser to download the image into cache before resolving.
 * @param {string} url - The image URL to preload.
 */
function preloadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
    });
}

// ==========================================
// PHASE 5: MECHANICS & UI
// ==========================================

/**
 * Function: renderLoadingState
 * Purpose: Shows a clean loading message while APIs are fetching.
 */
function renderLoadingState(msg) {
    const playArea = document.getElementById('play-screen');
    playArea.innerHTML = `
        <div style="text-align: center; padding-top: 100px;">
            <h2 style="color: var(--primary); animation: pulse 1.5s infinite;">${msg}</h2>
        </div>
    `;
}

/**
 * Function: renderGameplayUI
 * Purpose: Injects the image container and shuffles the multiple choice buttons.
 */
function renderGameplayUI(imageUrl) {
    const playArea = document.getElementById('play-screen');
    
    // 1. Shuffle answers
    let options = [revealState.currentData.answer, ...revealState.currentData.wrong];
    options = options.sort(() => Math.random() - 0.5);

    // 2. Build HTML
    playArea.innerHTML = `
        <div class="reveal-image-container">
            <img id="reveal-active-image" class="reveal-image" src="${imageUrl}" style="filter: blur(40px);">
        </div>
        
        <div id="reveal-timer-bar" style="height: 6px; background: var(--primary); width: 100%; transition: width 0.1s linear; margin-bottom: 20px;"></div>

        <div class="mc-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            ${options.map(opt => `
                <button class="btn mc-btn" onclick="window.handleRevealGuess('${opt.replace(/'/g, "\\'")}')">
                    ${opt}
                </button>
            `).join('')}
        </div>
    `;
}

/**
 * Function: startBlurTimer
 * Purpose: Ticks 10 times a second. Smoothly updates the blur and score potential.
 */
function startBlurTimer() {
    const imgEl = document.getElementById('reveal-active-image');
    const timerBar = document.getElementById('reveal-timer-bar');
    
    revealState.timerInterval = setInterval(() => {
        revealState.timeLeft -= 0.1;

        if (revealState.timeLeft <= 0) {
            revealState.timeLeft = 0;
            endRound();
        }

        // Calculate Blur (Starts at 40px, goes to 0px)
        const blurAmount = (revealState.timeLeft / revealState.maxTime) * 40;
        
        // Calculate Score Potential (Max 1000, drops as image clears)
        revealState.currentScorePotential = Math.floor((revealState.timeLeft / revealState.maxTime) * 1000);

        if (!revealState.hasGuessed) {
            imgEl.style.filter = `blur(${blurAmount}px)`;
            timerBar.style.width = `${(revealState.timeLeft / revealState.maxTime) * 100}%`;
        }
    }, 100);
}

/**
 * Function: handleRevealGuess (Attached to window for inline HTML onclick)
 * Purpose: Evaluates the user's choice and locks in their score.
 */
window.handleRevealGuess = function(guessedAnswer) {
    if (revealState.hasGuessed) return;
    revealState.hasGuessed = true;

    if (guessedAnswer === revealState.currentData.answer) {
        if(sfxCheer) sfxCheer.play();
        // Add points (Assume solo play for now, multiplayer hook goes here)
        state.rawScores[0] = (state.rawScores[0] || 0) + revealState.currentScorePotential;
    } else {
        if(sfxBuzzer) sfxBuzzer.play();
    }

    // Immediately snap blur to 0 to reward them for guessing early
    const imgEl = document.getElementById('reveal-active-image');
    if (imgEl) imgEl.style.filter = `blur(0px)`;
    
    // In multiplayer, we'd wait for all players here. In solo, we just end the round immediately.
    clearInterval(revealState.timerInterval);
    endRound();
};

// ==========================================
// PHASE 6: SYSTEM CONTRACT STUBS
// Required by app.js validateCartridge()
// ==========================================
export function handleStop() { 
    // Logic for the host forcefully ending the game early
}
export function resetStats() { 
    // Logic to clear local storage stats for this specific game
}
export function shareChallenge() { 
    // Logic to generate the copy-paste emoji results
}
export function renderStatsUI() { 
    // Logic to draw the specific stats modal data
}
export function evaluateGuess(isCorrect) { 
    // Required by global window.evaluateGuess hook, though we handle 
    // our multiple choice guesses locally via handleRevealGuess.
}
