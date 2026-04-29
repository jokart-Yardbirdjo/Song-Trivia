/**
 * ==============================================================================
 * YARDBIRD'S GAMES — CARTRIDGE: THE REVEAL  (revealLogic.js)
 * ==============================================================================
 *
 * WHAT THIS GAME IS:
 *   An image is hidden behind a 12-block grid. Every second, one random block
 *   disappears. Players race to identify the subject from 4 multiple-choice
 *   options before time runs out. The earlier the correct guess, the higher
 *   the score (max 1000 pts per round).
 *
 * DATA SOURCES (Hybrid):
 *   · Party Pack  → loads from ./db_reveal.json  (local curated database)
 *   · Infinite AI → calls OpenAI GPT-4o-mini to generate subjects,
 *                   then fetches real images from Wikipedia's open API.
 *
 * MULTIPLAYER:
 *   Fully supports Host (TV) + Client (Phone) Kahoot-style play.
 *   Host broadcasts round state via Firebase. Clients submit MC guesses.
 *   evaluateMultiplayerRound() scores all players simultaneously.
 *
 * CARTRIDGE CONTRACT (required by app.js validateCartridge):
 *   ✅ manifest              — game metadata & setup config
 *   ✅ startGame()           — entry point called by platform
 *   ✅ evaluateGuess()       — solo scoring logic
 *   ✅ evaluateMultiplayerRound() — multiplayer scoring logic
 *   ✅ handleStop()          — stub (no audio, not needed)
 *   ✅ forceLifeline()       — stub (grid auto-reveals, no manual lifeline)
 *   ✅ startDailyChallenge() — stub (not yet implemented)
 *   ✅ resetStats()          — clears localStorage for this cartridge
 *   ✅ shareChallenge()      — platform share sheet
 *   ✅ renderStatsUI()       — injects stats HTML into the stats modal
 *   ✅ onModeSelect()        — drives dynamic sub-pill rendering in setup
 *   ✅ onSubSelect()         — shows/hides the API key input field
 *
 * FIXES vs. ORIGINAL revealLogic.js:
 *   · evaluateGuess(isCorrect, clickedBtn) — clickedBtn no longer dropped
 *   · evaluateMultiplayerRound(players)    — fully implemented (was missing)
 *   · Feedback layout race condition fixed  — eval message lives inside #feedback
 *   · CSS injected once with an idempotency guard (no duplicate <style> tags)
 *   · db_reveal.json shape validated before use
 *   · All DOM reads are null-checked to survive partial renders
 *   · nextRound() auto-skips rounds where Wikipedia returns no image (max 3 skips)
 *   · revealState is fully reset at startGame() so replaying never inherits
 *     stale data from a previous session
 *
 * HOW TO WIRE INTO THE PLATFORM:
 *   1. Add to app.js:
 *        import * as TheReveal from './revealLogic.js';
 *        // In loadCartridge() switchboard:
 *        else if (gameId === 'the_reveal') targetCartridge = TheReveal;
 *        // In app.js line 158, update evaluateGuess bridge:
 *        window.evaluateGuess = (isCorrect, btn) => window.activeCartridge.evaluateGuess(isCorrect, btn);
 *
 *   2. Add to index.html main menu (#main-menu-screen .card-group):
 *        <div class="select-card game-card"
 *             onclick="selectGame('the_reveal')"
 *             style="text-align:center; padding:18px; margin-bottom:12px;">
 *            <div style="font-size:2.5rem; margin-bottom:8px;">👁️</div>
 *            <div class="card-title" style="font-size:1.25rem;">The Reveal</div>
 *            <div class="card-desc" style="font-size:0.9rem;">
 *                Uncover the image block by block. How fast can you identify it?
 *            </div>
 *        </div>
 *
 *   3. Add to state.js userStats default object:
 *        the_reveal: { gamesPlayed: 0, highScore: 0 }
 *
 *   4. Create ./db_reveal.json with shape:
 *        {
 *          "media":        [{ "imageKeyword": "...", "answer": "...", "wrong": ["","",""] }],
 *          "megastars":    [...],
 *          "masterpieces": [...]
 *        }
 *
 * ==============================================================================
 */

import { db } from './firebase.js';
import { state, sfxTick, sfxCheer, sfxBuzzer, colors, bgm } from './state.js';


// ==============================================================================
// SECTION 1 — MANIFEST & SETUP HOOKS
// ==============================================================================

/**
 * manifest
 * ─────────
 * The Cartridge's identity card. Read by:
 *   · app.js        → validateCartridge(), loadCartridge()
 *   · ui.js         → buildSetupScreen()  (modes + levels → dynamic cards)
 *   · updatePlatformUI() → rulesHTML injected into #rules-modal
 *
 * clientUI: "multiple-choice"
 *   Tells multiplayer.js that phone clients use the standard MC button flow
 *   (currentMC Firebase node → renderClientMC() → submitClientMCGuess()).
 *   No custom renderClientUI() needed.
 */
export const manifest = {
    id: "the_reveal",
    title: "THE REVEAL",
    subtitle: "Visual Pattern Recognition",
    hasDaily: false,
    clientUI: "multiple-choice",

    rulesHTML: `
        <h2>How to Play</h2>
        <div style="text-align:left; color:var(--dark-text); line-height:1.7; font-size:0.95rem;">
            <p>An image hides behind a <strong>12-block grid</strong>.</p>
            <p><strong>Every second, one random block vanishes.</strong>
               You have up to 12 seconds to figure it out.</p>
            <p>Tap the correct answer as fast as you can —
               <strong style="color:var(--primary);">fewer blocks revealed = more points.</strong></p>
            <p>🔥 3 correct in a row earns a +50 Streak Bonus!</p>
            <p>⭐ Some rounds are worth <strong>2× points</strong> — watch for the bonus tag!</p>
        </div>
        <button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top:15px; width:100%;">
            Let's Go!
        </button>
    `,

    modes: [
        { id: "movies",       title: "🎬 Movies",       desc: "Iconic theatrical movie posters." }, // 👈 CHANGED
        { id: "megastars",    title: "🌟 Megastars",    desc: "Actors, athletes, and pop culture icons." },
        { id: "masterpieces", title: "🎨 Masterpieces", desc: "Famous art and historical photography." }
    ],

    // Only one difficulty level — the 12-second grid is the difficulty.
    // A second level (e.g. "Blitz" with 6 seconds) could be added here later.
    levels: [
        { id: "standard", title: "🟢 The Grid", desc: "12 seconds. One block vanishes every second." }
    ]
};


// ==============================================================================
// SECTION 2 — SETUP HOOKS  (called by ui.js during setup-screen rendering)
// ==============================================================================

/**
 * onModeSelect(mode)
 * ───────────────────
 * Called by ui.js setMode() every time the player clicks a Mode card.
 * Builds the "Data Source" sub-pill row (Party Pack / Infinite AI) and
 * resets the custom input to hidden.
 *
 * @param {string} mode — One of: "media" | "megastars" | "masterpieces"
 */
export function onModeSelect(mode) {
    state.gameState.sub = 'party_pack';

    const subLabel = document.getElementById('sub-label');
    if (subLabel) subLabel.innerText = "Select Data Source";

    const container = document.getElementById('sub-pills');
    if (container) {
        container.innerHTML = '';
        const pillParty = document.createElement('div');
        pillParty.className = 'pill pill-wide active';
        pillParty.innerText = "📦 Party Pack";
        pillParty.onclick = () => window.setSub('party_pack', pillParty);

        const pillAI = document.createElement('div');
        pillAI.className = 'pill pill-wide';
        pillAI.innerText = "✨ Infinite AI";
        pillAI.onclick = () => window.setSub('ai_infinite', pillAI);

        container.appendChild(pillParty);
        container.appendChild(pillAI);
    }

    const customInput = document.getElementById('custom-input');
    if (customInput) customInput.classList.add('hidden');

    const subArea = document.getElementById('sub-selection-area');
    if (subArea) subArea.classList.remove('hidden');
}

/**
 * onSubSelect(val)
 * ─────────────────
 * Called by ui.js setSub() when the player clicks a sub-pill.
 * Shows the OpenAI API key field only when "ai_infinite" is selected.
 *
 * @param {string} val — "party_pack" | "ai_infinite"
 */
export function onSubSelect(val) {
    const customInput = document.getElementById('custom-input');
    if (!customInput) return;

    if (val === 'ai_infinite') {
        customInput.classList.remove('hidden');
        customInput.placeholder = "Paste your OpenAI API Key (sk-...)";
        customInput.type = "password";
        // Pre-fill from a previous session so the player doesn't retype it
        const savedKey = localStorage.getItem('yardbird_openai_key');
        if (savedKey) customInput.value = savedKey;
    } else {
        customInput.classList.add('hidden');
        customInput.value = '';
    }
}


// ==============================================================================
// SECTION 3 — PRIVATE STATE  (never imported by other modules)
// ==============================================================================

/**
 * revealState
 * ────────────
 * All The Reveal's round-level mutable data lives here — separate from the
 * platform's `state` object — so there's zero risk of polluting shared state.
 *
 * Reset fully by _resetRevealState() at the start of every startGame() call.
 */
const revealState = {
    /** @type {Object|null} Raw JSON loaded from db_reveal.json */
    localDB: null,

    /** @type {Array} Shuffled queue of round data objects to pop() from */
    queue: [],

    /** @type {Object|null} The active round's data: { imageKeyword, answer, wrong[] } */
    currentData: null,

    /** @type {number} Duration of the grid-reveal phase in seconds */
    maxTime: 12,

    /**
     * @type {Array<number>} Shuffled array of block indices [0..11].
     * Each tick pops one index and hides that block.
     * Using a pre-shuffled array (rather than Math.random() each tick)
     * guarantees each of the 12 blocks is removed exactly once.
     */
    blocksRemaining: [],

    /**
     * @type {number} Points available at this exact moment.
     * Calculated as: Math.floor((timeLeft / maxTime) * 1000)
     * Captured the instant the player taps a button.
     */
    currentScorePotential: 0,

    /** @type {number} Safety counter — max consecutive skips before giving up */
    skipCount: 0,

    /** @type {number} Max skips before endGameSequence fires early */
    MAX_SKIPS: 10
};

/**
 * _resetRevealState()
 * ────────────────────
 * Called at the top of startGame() to wipe any data from a previous playthrough.
 * This is what makes "Play Again" work correctly — a full reload is not required.
 * PRIVATE — prefix underscore signals it's internal to this module.
 */
function _resetRevealState() {
    revealState.localDB            = null;
    revealState.queue              = [];
    revealState.currentData        = null;
    revealState.blocksRemaining    = [];
    revealState.currentScorePotential = 0;
    revealState.skipCount          = 0;
}


// ==============================================================================
// SECTION 4 — CSS INJECTION  (runs once, guarded by a flag)
// ==============================================================================

/**
 * _injectStyles()
 * ────────────────
 * Injects The Reveal's private CSS into <head> exactly once.
 * The idempotency guard (`data-reveal-styles`) prevents duplicate <style> tags
 * if the cartridge module is somehow re-evaluated.
 *
 * WHY NOT in style.css?
 *   These classes (.reveal-image-container, .grid-block, etc.) are meaningless
 *   to every other cartridge. Keeping them here makes the cartridge self-contained
 *   and style.css stays uncluttered.
 */
function _injectStyles() {
    if (document.head.querySelector('[data-reveal-styles]')) return; // Already injected

    const style = document.createElement('style');
    style.setAttribute('data-reveal-styles', 'true');
    style.innerHTML = `
        /* ── Reveal: Image + Grid Container ── */
        .reveal-image-container {
            width: 100%;
            max-width: 340px;
            aspect-ratio: 1 / 1;
            margin: 0 auto 16px auto;
            border-radius: 14px;
            position: relative;
            background: #1a1a2e;          /* Dark navy placeholder — looks intentional */
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
            overflow: hidden;
        }

        /* The actual image — fills the container, cropped via object-fit */
        .reveal-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        /* The 3×4 grid overlay sits on top of the image */
        .grid-overlay {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            grid-template-rows: repeat(4, 1fr);
            gap: 2px;
            pointer-events: none;         /* Grid must not intercept MC button clicks */
        }

        /* Individual grid block — dark fill, transitions to invisible when .vanished */
        .grid-block {
            background: #1a1a2e;
            transition: opacity 0.25s ease, transform 0.25s ease;
        }

        /* Applied by JS when a block's time comes — scales down + fades out */
        .grid-block.vanished {
            opacity: 0;
            transform: scale(0.7);
        }

        /* Score-potential badge in the top-left of the image */
        .reveal-score-badge {
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.65);
            color: white;
            border-radius: 20px;
            padding: 4px 12px;
            font-size: 0.72rem;
            font-weight: 800;
            letter-spacing: 0.5px;
            backdrop-filter: blur(4px);
            pointer-events: none;
            transition: color 0.3s ease;
            font-family: 'Courier New', monospace;
        }

        /* Loading shimmer animation for the "Searching Wikipedia..." state */
        @keyframes reveal-shimmer {
            0%   { opacity: 0.5; }
            50%  { opacity: 1;   }
            100% { opacity: 0.5; }
        }
        .reveal-loading-msg {
            animation: reveal-shimmer 1.4s ease infinite;
            color: var(--primary);
            font-size: 1.2rem;
            font-weight: bold;
            text-align: center;
            margin-top: 30px;
        }
    `;
    document.head.appendChild(style);
}


// ==============================================================================
// SECTION 5 — PLATFORM CONTRACT STUBS
// ==============================================================================

/**
 * handleStop()
 * ─────────────
 * Required by the cartridge contract (app.js line 156 delegates to this).
 * The Reveal has no "stop and type" phase — the grid handles the reveal.
 * Stub: safe no-op.
 */
export function handleStop() { return; }

/**
 * forceLifeline()
 * ────────────────
 * Required by the cartridge contract (app.js line 157 delegates to this).
 * The Reveal has no manual lifeline — blocks auto-reveal on a timer.
 * Stub: safe no-op.
 */
export function forceLifeline() { return; }

/**
 * startDailyChallenge()
 * ──────────────────────
 * Required by the cartridge contract (app.js line 154 delegates to this).
 * Daily mode not yet implemented for The Reveal.
 * Shows a friendly message instead of crashing.
 */
export function startDailyChallenge() {
    alert("Daily mode is coming soon for The Reveal! 👁️");
}


// ==============================================================================
// SECTION 6 — CORE GAME LOOP
// ==============================================================================

/**
 * startGame()
 * ────────────
 * Platform entry point. Called by app.js window.startGame() delegation.
 * Handles BOTH solo and multiplayer (host) flows.
 *
 * RESPONSIBILITIES:
 *   1. Reset all local and platform state for a clean start.
 *   2. Hide setup screen, show play screen, reset standard platform UI.
 *   3. Route data loading: Party Pack JSON vs. Infinite AI (OpenAI).
 *   4. Launch the first round via nextRound().
 *
 * MULTIPLAYER NOTE:
 *   In host mode (state.isHost === true), startGame() is called by
 *   multiplayer.js startMultiplayerGame() after all players are connected.
 *   The host runs the full game loop; phones just submit MC guesses.
 */
export async function startGame() {
    // ── 1. Inject styles (idempotent — safe to call multiple times) ──
    _injectStyles();

    // ── 2. Reset all state so "Play Again" starts completely fresh ──
    _resetRevealState();

    state.curIdx      = 0;
    state.numPlayers  = state.isMultiplayer ? state.numPlayers : 1;
    state.maxRounds   = state.gameState.rounds;
    state.rawScores   = new Array(state.numPlayers).fill(0);
    state.streaks     = new Array(state.numPlayers).fill(0);

    // ── 3. Generate double-point round indices (one per 5-round block) ──
    state.doubleRounds = [];
    for (let i = 0; i < state.maxRounds; i += 5) {
        const min = (i === 0) ? 1 : i;
        const max = Math.min(i + 4, state.maxRounds - 1);
        if (min <= max) {
            state.doubleRounds.push(
                Math.floor(Math.random() * (max - min + 1)) + min
            );
        }
    }

    // ── 4. Platform UI: transition from setup → play screen ──
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');
    document.querySelectorAll('.header-btn').forEach(btn => btn.classList.add('hidden'));
    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('btn-container').classList.add('hidden');
    document.getElementById('visualizer').classList.add('hidden');
    document.getElementById('reveal-art').style.display = 'none';
    document.getElementById('mc-fields').classList.add('hidden');

    // ── 5. Show initial loading state in the feedback area ──
    _setFeedback(`<div class="reveal-loading-msg">Initializing system...</div>`);

    // ── 6. Data routing: Party Pack (local JSON) vs. Infinite AI (OpenAI) ──
    if (state.gameState.sub === 'ai_infinite') {
        const apiKey = (document.getElementById('custom-input')?.value || '').trim();

        if (!apiKey.startsWith('sk-')) {
            // Invalid key — fall back gracefully rather than crashing
            alert("Invalid or missing OpenAI key. Falling back to Party Pack.");
            await _loadPartyPackData();
        } else {
            localStorage.setItem('yardbird_openai_key', apiKey);
            await _fetchInfiniteAIData(apiKey);
        }
    } else {
        await _loadPartyPackData();
    }

    // ── 7. Guard: if the queue is empty after loading, end immediately ──
    if (revealState.queue.length === 0) {
        alert("No data loaded. Please check db_reveal.json or your API key.");
        location.reload();
        return;
    }

    // ── 8. Kick off the first round ──
    _nextRound();
}

/**
 * _nextRound()
 * ─────────────
 * Advances the game to the next round. Private — only called internally.
 *
 * FLOW:
 *   1. End-of-game check.
 *   2. Pop next subject from queue.
 *   3. Show loading state while fetching image from Wikipedia.
 *   4. If Wikipedia returns no image, skip this subject (max 3 skips).
 *   5. Preload the image to prevent flicker on reveal.
 *   6. Render the gameplay UI (image + grid + MC buttons).
 *   7. Start the grid timer.
 *
 * MULTIPLAYER HOST:
 *   Broadcasts round data (currentRound, currentMC, timeLeft) to Firebase
 *   so client phones receive and display the MC options.
 */
async function _nextRound() {
    // ── End-of-game check ──
    if (state.curIdx >= state.maxRounds) {
        _endGameSequence();
        return;
    }

    state.isProcessing = false;

    // ── Pop next subject from the shuffled queue ──
    revealState.currentData = revealState.queue.pop();
    if (!revealState.currentData) {
        // Queue unexpectedly empty — end early rather than hanging
        console.warn("[TheReveal] Queue exhausted before maxRounds. Ending early.");
        _endGameSequence();
        return;
    }

    // ── Show loading state ──
    _setFeedback(`<div class="reveal-loading-msg">🔍 Searching Wikipedia...</div>`);
    document.getElementById('mc-fields').classList.add('hidden');
    document.getElementById('score-board').innerHTML = _buildScoreBoard();

    // ── NEW: Route image fetching to TMDB or Wikipedia ──
    let imageUrl = null;
    if (state.gameState.mode === 'movies') {
        // No longer reads from localStorage, just calls the fetcher directly
        imageUrl = await _fetchTMDBImage(revealState.currentData.imageKeyword);
    } else {
        imageUrl = await _fetchWikipediaImage(revealState.currentData.imageKeyword);
    }

    // ── Fetch image from Wikipedia ──
    // - const imageUrl = await _fetchWikipediaImage(revealState.currentData.imageKeyword);

    if (!imageUrl) {
        // Wikipedia returned nothing — skip this subject
        revealState.skipCount++;
        console.warn(`[TheReveal] No image for "${revealState.currentData.imageKeyword}". Skip ${revealState.skipCount}/${revealState.MAX_SKIPS}.`);

        if (revealState.skipCount >= revealState.MAX_SKIPS) {
            alert("Too many images failed to load. Please check your network connection.");
            _endGameSequence();
            return;
        }

        // Try the next subject without incrementing curIdx
        return _nextRound();
    }

    // Good image found — reset skip counter
    revealState.skipCount = 0;

    // ── Preload the image so it appears instantly when the grid drops ──
    _setFeedback(`<div class="reveal-loading-msg">📡 Downloading image...</div>`);
    await _preloadImage(imageUrl);

    // ── Render game UI and start the clock ──
    _renderGameplayUI(imageUrl);
    _startGridTimer();
}

/**
 * _renderGameplayUI(imageUrl)
 * ────────────────────────────
 * Builds and injects the full round UI into the play screen.
 *
 * STRUCTURE:
 *   #active-player  → "ROUND X/Y" tag (+ 2X BONUS label if applicable)
 *   #score-board    → per-player score pills
 *   #feedback       → image container + 3×4 grid overlay + score badge
 *   #mc-fields      → 4 answer buttons (1 correct + 3 wrong, shuffled)
 *   #timer          → horizontal timer bar (standard platform component)
 *
 * MULTIPLAYER HOST:
 *   Pushes the MC options array to Firebase (currentMC node) so client
 *   phones can render the same buttons via multiplayer.js renderClientMC().
 *
 * @param {string} imageUrl — Direct URL of the Wikipedia thumbnail image
 */
function _renderGameplayUI(imageUrl) {
    const isDouble = state.doubleRounds.includes(state.curIdx);

    // ── Round tag ──
    const tag = document.getElementById('active-player');
    if (tag) {
        tag.innerText = `ROUND ${state.curIdx + 1} / ${state.maxRounds}${isDouble ? '  ⭐ 2X BONUS' : ''}`;
        tag.style.color       = isDouble ? '#f39c12' : 'var(--primary)';
        tag.style.borderColor = isDouble ? '#f39c12' : 'var(--primary)';
    }

    // ── Score board (host shows blank; solo/client shows pills) ──
    document.getElementById('score-board').innerHTML =
        (state.isMultiplayer && state.isHost) ? '' : _buildScoreBoard();

    // ── Build the 12-block grid HTML ──
    const gridHTML = Array.from({ length: 12 })
        .map((_, i) => `<div class="grid-block" id="reveal-block-${i}"></div>`)
        .join('');

    // ── Inject image + grid + score badge into #feedback ──
    _setFeedback(`
        <div class="reveal-image-container">
            <img class="reveal-image" src="${imageUrl}">
            <div class="grid-overlay">${gridHTML}</div>
            <div class="reveal-score-badge" id="reveal-score-badge">1000 pts</div>
        </div>
    `);

    // ── Build and inject MC buttons ──
    const options = _buildOptions();
    const mcContainer = document.getElementById('mc-fields');
    if (mcContainer) {
        mcContainer.innerHTML = '';
        mcContainer.classList.remove('hidden');

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'mc-btn';
            btn.innerText = opt.str;
            // Pass both the correctness flag AND the clicked element so evaluateGuess
            // can immediately colour the button green/red without a second lookup.
            btn.onclick = (e) => window.evaluateGuess(opt.isCorrect, e.currentTarget);
            mcContainer.appendChild(btn);
        });
    }

    // ── Multiplayer: broadcast MC options to client phones ──
    if (state.isMultiplayer && state.isHost) {
        db.ref(`rooms/${state.roomCode}/currentRound`).set(state.curIdx + 1);
        db.ref(`rooms/${state.roomCode}/currentMC`).set(options);
        db.ref(`rooms/${state.roomCode}/currentPrompt`).set(
            `${CATEGORIES[state.gameState.mode] || '👁️'} What is this?`
        );

        // Reset all player statuses so the host watcher waits for fresh answers
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            if (!snap.exists()) return;
            const updates = {};
            snap.forEach(p => {
                updates[`${p.key}/status`] = 'guessing';
                updates[`${p.key}/guess`]  = null;
            });
            db.ref(`rooms/${state.roomCode}/players`).update(updates);
        });

        // Show "LOCKED IN: 0 / N" counter on host screen instead of timer
        document.getElementById('feedback').innerHTML += `
            <div id="host-lock-status"
                 style="color:var(--primary); font-size:1.3rem; font-weight:bold; margin-top:16px;">
                LOCKED IN: 0 / ${state.numPlayers}
            </div>`;
    }
}

/**
 * _startGridTimer()
 * ──────────────────
 * Runs the core 12-second countdown. Every second, one random grid block
 * vanishes. The timer bar drains smoothly (100ms ticks).
 *
 * BLOCK REMOVAL STRATEGY:
 *   A pre-shuffled array [0..11] is generated once at round start.
 *   Each second, we pop() one index from the array and hide that block.
 *   This guarantees:
 *     · Every block disappears exactly once.
 *     · The order is truly random (no duplicates, no bias).
 *     · No Math.random() calls inside the tick loop (deterministic).
 *
 * SCORE POTENTIAL:
 *   Displayed live in the #reveal-score-badge overlay.
 *   Formula: Math.floor((timeLeft / maxTime) * 1000)
 *   Captured at guess time via revealState.currentScorePotential.
 *
 * MULTIPLAYER HOST:
 *   Writes timeLeft to Firebase every second so client phones can show
 *   a synced timer bar via the timeLeft Firebase listener in multiplayer.js.
 *
 * TIME'S UP:
 *   · Solo: calls evaluateGuess(false, null) — marks as wrong, advances.
 *   · Multiplayer host: reads all player guesses from Firebase and calls
 *     evaluateMultiplayerRound(players).
 */
function _startGridTimer() {
    // Reset timer state
    state.timeLeft = revealState.maxTime;
    revealState.currentScorePotential = 1000;

    // Generate a fresh shuffled block-removal order for this round
    revealState.blocksRemaining = _shuffleArray([0,1,2,3,4,5,6,7,8,9,10,11]);
    let lastWholeSecond = revealState.maxTime;

    // ── Inject the horizontal timer bar (standard platform component) ──
    const timerEl = document.getElementById('timer');
    if (timerEl) {
        timerEl.innerHTML = `
            <div class="timer-bar-container">
                <div id="timer-bar-fill" class="timer-bar-fill"></div>
            </div>`;
    }
    const timerFill = document.getElementById('timer-bar-fill');

    // NEW: Start the music
    bgm.play().catch(e => console.warn("BGM blocked by browser policy until interaction."));

    // ── Main tick: 100ms interval for smooth bar animation ──
    state.timerId = setInterval(() => {
        state.timeLeft = Math.max(0, state.timeLeft - 0.1);

        // ── Update timer bar width ──
        const pct = (state.timeLeft / revealState.maxTime) * 100;
        if (timerFill) {
            timerFill.style.width = `${pct}%`;
            if (state.timeLeft <= 3) timerFill.style.backgroundColor = 'var(--fail)';
        }

        // ── Update live score potential badge ──
        revealState.currentScorePotential = Math.floor(pct * 10); // 0–1000
        const badge = document.getElementById('reveal-score-badge');
        if (badge) {
            badge.innerText = `${revealState.currentScorePotential} pts`;
            badge.style.color =
                revealState.currentScorePotential > 600 ? '#00b894'
              : revealState.currentScorePotential > 300 ? '#f39c12'
              : '#d63031';
        }

        // ── Sync timeLeft to Firebase for client phone timer bars ──
        if (state.isMultiplayer && state.isHost) {
            // Only write on whole-second boundaries to avoid hammering Firebase
            if (Math.abs(state.timeLeft - Math.round(state.timeLeft)) < 0.08) {
                db.ref(`rooms/${state.roomCode}/timeLeft`).set(Math.round(state.timeLeft));
            }
        }

        // ── Remove one grid block on each whole-second boundary ──
        const currentWhole = Math.ceil(state.timeLeft);
        if (currentWhole < lastWholeSecond && revealState.blocksRemaining.length > 0) {
            lastWholeSecond = currentWhole;
            const blockIdx = revealState.blocksRemaining.pop();
            const blockEl  = document.getElementById(`reveal-block-${blockIdx}`);
            if (blockEl) blockEl.classList.add('vanished');

            // Tick SFX for the final 3 seconds
            if (state.timeLeft <= 3 && state.timeLeft > 0) {
                sfxTick.currentTime = 0;
                sfxTick.play().catch(() => {});
            }
        }

        // ── Time's up ──
        if (state.timeLeft <= 0) {
            clearInterval(state.timerId);

            if (state.isMultiplayer && state.isHost) {
                // Collect all player guesses from Firebase and score them
                db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
                    evaluateMultiplayerRound(snap.val() || {});
                });
            } else {
                // Solo: no answer submitted = wrong
                evaluateGuess(false, null);
            }
        }
    }, 100);
}


// ==============================================================================
// SECTION 7 — DATA & NETWORK
// ==============================================================================

/**
 * _loadPartyPackData()
 * ─────────────────────
 * Fetches db_reveal.json, extracts the correct mode's array, shuffles it,
 * and stores it in revealState.queue.
 *
 * EXPECTED JSON SHAPE:
 *   {
 *     "media":        [{ "imageKeyword": "...", "answer": "...", "wrong": ["","",""] }],
 *     "megastars":    [...],
 *     "masterpieces": [...]
 *   }
 *
 * If the file is missing or malformed, logs an error and leaves the queue
 * empty — startGame() will alert and reload rather than hanging.
 */
async function _loadPartyPackData() {
    try {
        _setFeedback(`<div class="reveal-loading-msg">📦 Loading Party Pack...</div>`);
        const response = await fetch('./db_reveal.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const db_data = await response.json();
        const modeData = db_data[state.gameState.mode];

        if (!Array.isArray(modeData) || modeData.length === 0) {
            throw new Error(`No data found for mode "${state.gameState.mode}" in db_reveal.json`);
        }

        revealState.localDB = db_data;
        revealState.queue   = _shuffleArray([...modeData]);

    } catch (err) {
        console.error("[TheReveal] Failed to load db_reveal.json:", err);
        // Queue stays empty — startGame() guard will catch this
    }
}

/**
 * _fetchInfiniteAIData(apiKey)
 * ─────────────────────────────
 * Calls OpenAI GPT-4o-mini to generate a fresh batch of round subjects.
 * Uses a randomized seed theme to prevent the AI from returning the same
 * obvious answers (e.g., "Mona Lisa" every single time).
 *
 * OPENAI RESPONSE FORMAT (strictly enforced via prompt):
 *   [
 *     { "imageKeyword": "Wikipedia_Page_Title", "answer": "Clean Name", "wrong": ["A","B","C"] }
 *   ]
 *
 * FALLBACK: If OpenAI fails or returns malformed JSON, silently falls back
 * to Party Pack (loadPartyPackData) so the game still launches.
 *
 * @param {string} apiKey — OpenAI API key starting with "sk-"
 */
async function _fetchInfiniteAIData(apiKey) {
    _setFeedback(`<div class="reveal-loading-msg">✨ AI is generating unique content...</div>`);

    // Category labels for the AI prompt
    const catLabels = {
        movies:       "Famous Theatrical Movies",
        megastars:    "A-List Actors, Historical Figures, Pop Icons, and Star Athletes",
        masterpieces: "The most famous Paintings and Sculptures in history"
    };

    // Randomized sub-themes force variety across sessions
    const seedThemes = {
        movies:       ["1980s cult classics", "sci-fi and fantasy", "Oscar winners", "90s blockbusters", "animated masterpieces", "horror legends"], // 👈 CHANGED
        megastars:    ["historical leaders","2000s pop stars","legendary athletes","famous directors","classical composers","reality TV icons"],
        masterpieces: ["Renaissance art","modern sculptures","impressionist paintings","famous 20th-century photographs","surrealism","street art"]
    };
    const seed = seedThemes[state.gameState.mode]?.[
        Math.floor(Math.random() * seedThemes[state.gameState.mode].length)
    ] || "popular culture";

    const systemPrompt = `Generate a JSON array of ${state.maxRounds + 8} trivia items for a visual guessing game.
Category: ${catLabels[state.gameState.mode] || "popular culture"}.
CRITICAL: Focus specifically on: ${seed}. Do NOT include the most obvious/common answers to ensure variety.
The "imageKeyword" MUST be the exact English Wikipedia article title (e.g. "The Matrix (franchise)", "Thriller (Michael Jackson album)").
Return ONLY a valid JSON array — no markdown, no backticks, no commentary.
Each item must follow this exact shape:
[{ "imageKeyword": "Wikipedia_Title", "answer": "Clean Display Name", "wrong": ["Wrong 1", "Wrong 2", "Wrong 3"] }]`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: "system", content: systemPrompt }],
                temperature: 0.9   // Higher temp = more variety across sessions
            })
        });

        if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);

        const data = await response.json();
        const raw  = data.choices?.[0]?.message?.content?.trim() || '';

        // Strip any accidental markdown code fences the AI might add
        const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed  = JSON.parse(cleaned);

        if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error("OpenAI returned empty or non-array JSON");
        }

        revealState.queue = _shuffleArray(parsed);

    } catch (err) {
        console.error("[TheReveal] OpenAI generation failed:", err);
        alert("AI generation failed. Falling back to Party Pack.");
        await _loadPartyPackData();
    }
}

/**
 * _fetchWikipediaImage(pageTitle)
 * ────────────────────────────────
 * Queries the Wikipedia REST API for a page thumbnail.
 * Uses the open API endpoint which supports CORS from any origin.
 *
/**
 * _fetchWikipediaImage(pageTitle)
 * ────────────────────────────────
 * Queries the Wikipedia REST API for a page thumbnail.
 * UPDATED: Now uses the REST API Summary endpoint to guarantee the primary
 * infobox portrait, filtering out random page assets like SVGs/signatures.
 *
 * WHY WIKIPEDIA REST API?
 * · The standard Action API (prop=pageimages) often returns signatures or maps.
 * · The REST summary API is heavily curated for mobile preview cards, 
 * ensuring we almost always get the celebrity's actual face/portrait.
 *
 * @param  {string}          pageTitle — Exact Wikipedia article title
 * @return {string|null}               — Thumbnail URL, or null if not found
 */
async function _fetchWikipediaImage(pageTitle) {
    const fetchThumb = async (titleToFetch) => {
        // The REST API expects underscores for spaces
        const formattedTitle = encodeURIComponent(titleToFetch.replace(/ /g, '_'));
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${formattedTitle}`;
        
        const res = await fetch(url);
        if (!res.ok) return null;
        
        const data = await res.json();
        
        // The REST API heavily curates the 'thumbnail' object to be the main Infobox image.
        if (data.thumbnail && data.thumbnail.source) {
            // The API usually returns a 320px width image by default.
            // We bump the resolution to 600px for a crisper experience on TV/Desktop
            // by dynamically replacing the resolution string in the Wikimedia CDN URL.
            return data.thumbnail.source.replace(/\/\d+px-/, '/600px-');
        }
        return null;
    };

    try {
        // Attempt 1: Direct exact match (REST API handles redirects natively)
        let img = await fetchThumb(pageTitle);
        if (img) return img;

        // Attempt 2: Auto-heal via OpenSearch
        // Searches Wikipedia for the exact term and tries the top 3 closest auto-complete suggestions.
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(pageTitle)}&limit=3&namespace=0&format=json&origin=*`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        const suggestions = searchData[1] || [];

        for (let suggestion of suggestions) {
            if (suggestion.toLowerCase() !== pageTitle.toLowerCase()) {
                img = await fetchThumb(suggestion);
                if (img) return img; // Auto-Heal successful!
            }
        }
        return null;
    } catch (err) {
        console.warn(`[TheReveal] Wikipedia fetch failed for "${pageTitle}":`, err);
        return null;
    }
}

/**
 * _fetchTMDBImage(movieTitle, apiKey)
 * ────────────────────────────────────
 * Queries The Movie Database (TMDB) for high-resolution theatrical posters.
 */
async function _fetchTMDBImage(movieTitle) {
    const apiKey = "1bcd3d06b740a01fae3d8365f9faf895";
    
    // AUTO-HEAL: Strips Wikipedia tags like "(2000 film)" so TMDB can find it
    const cleanTitle = movieTitle.replace(/\s*\(.*?\)\s*/g, '').trim();
    
    const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanTitle)}&api_key=${apiKey}&language=en-US&page=1&include_adult=false`;
    
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.results && data.results.length > 0 && data.results[0].poster_path) {
            return `https://image.tmdb.org/t/p/w780${data.results[0].poster_path}`;
        }
        return null;
    } catch (err) {
        console.error("[TheReveal] TMDB fetch failed:", err);
        return null;
    }
}

/**
 * _preloadImage(url)
 * ───────────────────
 * Preloads an image into the browser cache before rendering the gameplay UI.
 * Prevents the image from "popping in" after the grid starts dropping blocks.
 * Resolves on both load and error so it never hangs the game.
 *
 * @param  {string}  url — Image URL to preload
 * @return {Promise}     — Resolves when image is cached (or fails gracefully)
 */
function _preloadImage(url) {
    return new Promise(resolve => {
        const img    = new Image();
        img.onload   = resolve;
        img.onerror  = resolve;  // Don't block the game on a bad image
        img.src      = url;
    });
}


// ==============================================================================
// SECTION 8 — SCORING: SOLO
// ==============================================================================

/**
 * evaluateGuess(isCorrect, clickedBtn)
 * ──────────────────────────────────────
 * EXPORTED — called by app.js window.evaluateGuess() delegation.
 * Handles solo scoring only. evaluateMultiplayerRound() handles host scoring.
 *
 * FLOW:
 *   1. Guard against double-evaluation (state.isProcessing).
 *   2. Stop the timer immediately.
 *   3. Reveal all remaining grid blocks (drop them all at once).
 *   4. Colour the clicked button green/red; reveal the correct answer button.
 *   5. Calculate points (potential × double-round multiplier × streak bonus).
 *   6. Update feedback area and score pill.
 *   7. Advance to next round after 3 seconds.
 *
 * IMPORTANT — app.js fix required:
 *   The default app.js line 158 only forwards `isCorrect`:
 *     window.evaluateGuess = (isCorrect) => window.activeCartridge.evaluateGuess(isCorrect);
 *   It MUST be updated to also forward `clickedBtn`:
 *     window.evaluateGuess = (isCorrect, btn) => window.activeCartridge.evaluateGuess(isCorrect, btn);
 *
 * @param {boolean}          isCorrect  — Whether the chosen option was correct
 * @param {HTMLElement|null} clickedBtn — The button element the player tapped
 */
export function evaluateGuess(isCorrect, clickedBtn = null) {
    // ── Guard: prevent double-fire from rapid taps or timer+button race ──
    if (state.isProcessing) return;
    state.isProcessing = true;

    clearInterval(state.timerId);

    // NEW: Stop the music
    bgm.pause();
    bgm.currentTime = 0;

    // ── Disable all MC buttons so no further input registers ──
    document.querySelectorAll('#mc-fields .mc-btn').forEach(b => { b.disabled = true; });

    // ── Instantly reveal all remaining grid blocks ──
    for (let i = 0; i < 12; i++) {
        document.getElementById(`reveal-block-${i}`)?.classList.add('vanished');
    }

    // ── Colour the clicked button; always reveal the correct answer button ──
    if (clickedBtn && !isCorrect) clickedBtn.classList.add('wrong');
    _highlightCorrectButton();

    // ── Calculate points ──
    const isDouble = state.doubleRounds.includes(state.curIdx);
    let roundPts   = 0;

    if (isCorrect) {
        state.streaks[0]++;
        roundPts = revealState.currentScorePotential;

        const streakBonus = (state.streaks[0] > 0 && state.streaks[0] % 3 === 0);
        if (streakBonus) roundPts += 50;
        if (isDouble)    roundPts  = Math.round(roundPts * 2);

        state.rawScores[0] += roundPts;
        sfxCheer.currentTime = 0; sfxCheer.play().catch(() => {});

        // Build feedback HTML — appended INSIDE #feedback so it's wiped cleanly next round
        const streakMsg = streakBonus
            ? `<div style="color:var(--p3); font-size:0.9rem; margin-top:4px; font-weight:bold;">🔥 ${state.streaks[0]}-streak! +50 bonus</div>`
            : '';
        const doubleMsg = isDouble
            ? `<div style="color:#f39c12; font-size:0.9rem; font-weight:bold; margin-top:4px;">⭐ 2X BONUS ROUND!</div>`
            : '';

        _appendFeedback(`
            <div style="color:var(--success); font-size:1.4rem; font-weight:bold; margin-top:10px;">
                ✅ CORRECT! +${roundPts}
            </div>
            ${streakMsg}${doubleMsg}
        `);

    } else {
        state.streaks[0] = 0;
        sfxBuzzer.currentTime = 0; sfxBuzzer.play().catch(() => {});

        _appendFeedback(`
            <div style="color:var(--fail); font-size:1.4rem; font-weight:bold; margin-top:10px;">
                ❌ INCORRECT — It was <strong>${revealState.currentData?.answer || '?'}</strong>
            </div>
        `);
    }

    // ── Update score pill ──
    document.getElementById('score-board').innerHTML = _buildScoreBoard();

    // ── Advance to next round after a pause ──
    state.curIdx++;
    setTimeout(_nextRound, 3000);
}


// ==============================================================================
// SECTION 9 — SCORING: MULTIPLAYER HOST
// ==============================================================================

/**
 * evaluateMultiplayerRound(players)
 * ──────────────────────────────────
 * EXPORTED — called by app.js window.evaluateMultiplayerRound() delegation.
 * Scores ALL connected players simultaneously based on their Firebase guesses.
 *
 * CALLED BY:
 *   · multiplayer.js startMultiplayerGame() → players listener (all locked)
 *   · _startGridTimer() → time's up branch (host only)
 *
 * SCORING LOGIC (mirrors mathLogic.js + quoteLogic.js pattern):
 *   · Correct MC guess → points = guess.time × 10 (time-based, same as other games)
 *     This keeps The Reveal's multiplayer scoring consistent with Fast Math and Who Said It.
 *   · Wrong/no guess   → 0 points
 *   · Double round     → pts × 2
 *   · Streak bonus     → +50 every 3rd correct in a row
 *
 * FIREBASE WRITES:
 *   · Clears currentMC so phones don't keep the old buttons active
 *   · Advances currentRound so phones know a new round started
 *
 * @param {Object} players — Firebase snapshot value: { playerId: { name, guess, status } }
 */
export function evaluateMultiplayerRound(players) {
    // ── Guard: prevent double-evaluation from simultaneous triggers ──
    if (state.isProcessing) return;
    state.isProcessing = true;

    clearInterval(state.timerId);

    // NEW: Stop the music
    bgm.pause();
    bgm.currentTime = 0;

    // ── Instantly reveal all grid blocks on host screen ──
    for (let i = 0; i < 12; i++) {
        document.getElementById(`reveal-block-${i}`)?.classList.add('vanished');
    }
    _highlightCorrectButton();

    const isDouble  = state.doubleRounds.includes(state.curIdx);
    const playerIds = Object.keys(players || {}).sort();

    // ── Build feedback HTML listing each player's result ──
    let fbHTML = `<div style="display:flex; flex-direction:column; gap:8px; margin-top:12px; font-weight:bold;">`;

    playerIds.forEach((pid, index) => {
        const p       = players[pid] || {};
        const correct = !!(p.guess && p.guess.isMC && p.guess.correct);
        let roundPts  = 0;

        if (correct) {
            state.streaks[index] = (state.streaks[index] || 0) + 1;
            // time-based scoring: time remaining × 10 (max 120 for 12s game)
            roundPts = (p.guess.time || 0) * 10;

            const streakBonus = (state.streaks[index] > 0 && state.streaks[index] % 3 === 0);
            if (streakBonus) roundPts += 50;
            if (isDouble)    roundPts  = Math.round(roundPts * 2);

            state.rawScores[index] = (state.rawScores[index] || 0) + roundPts;

            const bonusTxt = isDouble ? '⭐ 2X! ' : '✅ ';
            fbHTML += `
                <div style="color:${isDouble ? '#f39c12' : 'var(--success)'}; font-size:1.1rem;">
                    ${bonusTxt}${p.name || 'Player'}: +${roundPts}
                </div>`;
        } else {
            state.streaks[index] = 0;
            fbHTML += `
                <div style="color:var(--fail); font-size:1.1rem;">
                    ❌ ${p.name || 'Player'}: 0
                </div>`;
        }
    });

    fbHTML += `</div>`;
    fbHTML += `
        <div style="font-size:0.95rem; color:var(--text-muted); margin-top:8px;">
            It was: <strong style="color:var(--dark-text);">
                ${revealState.currentData?.answer || '?'}
            </strong>
        </div>`;

    // Append result below the now-revealed image
    _appendFeedback(fbHTML);

    // ── Update host scoreboard ──
    document.getElementById('score-board').innerHTML = _buildScoreBoard();

    // ── Clean up Firebase nodes so phones reset cleanly ──
    if (state.roomCode) {
        db.ref(`rooms/${state.roomCode}/currentMC`).remove();
        db.ref(`rooms/${state.roomCode}/currentPrompt`).remove();
    }

    // ── Advance to next round ──
    state.curIdx++;
    setTimeout(_nextRound, 4000);
}


// ==============================================================================
// SECTION 10 — END GAME
// ==============================================================================

/**
 * _endGameSequence()
 * ───────────────────
 * Transitions from the play screen to the final results screen.
 * Handles both solo (gradient score card) and multiplayer (podium leaderboard).
 * Saves the high score and increments gamesPlayed in localStorage.
 *
 * MULTIPLAYER HOST:
 *   · Writes normalized scores to each player's Firebase node
 *   · Writes sorted finalLeaderboard array so client phones can display standings
 *   · Sets room state to 'finished' — triggers phone end screen
 */
function _endGameSequence() {
    document.getElementById('play-screen').classList.add('hidden');
    document.getElementById('final-screen').classList.remove('hidden');
    document.getElementById('final-subtitle').innerText = "Speed × Accuracy";

    const playlistBox = document.querySelector('.playlist-box');
    if (playlistBox) playlistBox.style.display = 'none';
    document.getElementById('final-grid').innerHTML = '';

    // Normalize raw scores to a 1000-point ceiling
    const maxRawPossible = state.maxRounds * 1000; // theoretical max = 1000 pts/round
    const normalizedScores = state.rawScores.map(s =>
        Math.min(1000, Math.round(((s || 0) / maxRawPossible) * 1000))
    );
    const maxNormalized = Math.max(...normalizedScores, 0);

    // ── MULTIPLAYER HOST path ──
    if (state.isMultiplayer && state.isHost && state.roomCode) {
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) { db.ref(`rooms/${state.roomCode}/state`).set('finished'); return; }

            const pIds = Object.keys(players).sort();
            const finalResults = [];

            pIds.forEach((pid, index) => {
                const normScore = normalizedScores[index] || 0;
                finalResults.push({ name: players[pid].name || 'Player', score: normScore });
                db.ref(`rooms/${state.roomCode}/players/${pid}`).update({ finalScore: normScore });
            });

            finalResults.sort((a, b) => b.score - a.score);
            db.ref(`rooms/${state.roomCode}/finalLeaderboard`).set(finalResults);

            // Build podium HTML for the host screen
            let podiumHTML = `
                <div style="text-align:left; background:var(--surface); padding:15px; border-radius:12px; border:2px solid var(--border-light);">
                    <h3 style="margin-top:0; color:var(--primary); text-align:center; text-transform:uppercase; margin-bottom:15px;">Final Standings</h3>`;

            finalResults.forEach((p, idx) => {
                const medal = ['🥇','🥈','🥉'][idx] || '👏';
                const color = idx === 0 ? 'var(--p1)' : idx === 1 ? 'var(--p2)' : 'var(--text-muted)';
                podiumHTML += `
                    <div style="display:flex; justify-content:space-between; padding:12px 5px;
                                border-bottom:1px solid var(--border-light); font-size:1.3rem;
                                font-weight:bold; color:${color};">
                        <span>${medal} ${p.name}</span>
                        <span style="font-family:'Courier New',monospace; color:var(--dark-text);">${p.score}</span>
                    </div>`;
            });

            podiumHTML += `</div>`;
            document.getElementById('winner-text').innerHTML = podiumHTML;
            document.getElementById('winner-text').style.color = '';

            db.ref(`rooms/${state.roomCode}/state`).set('finished');
        });

    // ── SOLO path ──
    } else {
        const hypeText =
            maxNormalized > 800 ? "Eagle Eye! 🦅"
          : maxNormalized > 500 ? "Solid Vision! 👁️"
          : "Needs Glasses! 👓";

        document.getElementById('winner-text').innerHTML = `
            <div style="background:linear-gradient(135deg, var(--primary), #8e2de2);
                        padding:50px 20px; border-radius:24px; color:white;
                        box-shadow:0 12px 24px rgba(110,69,226,0.2);
                        margin:30px 0; text-align:center;">
                <div style="font-size:1.1rem; font-weight:600; text-transform:uppercase;
                            letter-spacing:2px; opacity:0.9; margin-bottom:10px;">Final Score</div>
                <div style="font-size:5.5rem; font-weight:900; line-height:1;
                            text-shadow:2px 4px 10px rgba(0,0,0,0.2);">${maxNormalized}</div>
                <div style="font-size:1.2rem; font-weight:600; margin-top:15px; opacity:0.9;">${hypeText}</div>
            </div>`;
        document.getElementById('winner-text').style.color = '';
    }

    // ── Save stats ──
    state.userStats.the_reveal = state.userStats.the_reveal || { gamesPlayed: 0, highScore: 0 };
    if (maxNormalized > (state.userStats.the_reveal.highScore || 0)) {
        state.userStats.the_reveal.highScore = maxNormalized;
    }
    state.userStats.the_reveal.gamesPlayed++;
    state.userStats.platformGamesPlayed = (state.userStats.platformGamesPlayed || 0) + 1;
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
}


// ==============================================================================
// SECTION 11 — STATS, SHARING & RESET
// ==============================================================================

/**
 * renderStatsUI(revealStats, container)
 * ──────────────────────────────────────
 * EXPORTED — called by ui.js openStatsLocker() when this cartridge is active.
 * Injects The Reveal's stats HTML directly into the stats modal content div.
 *
 * @param {Object}      revealStats — { gamesPlayed, highScore } from localStorage
 * @param {HTMLElement} container   — The .modal-content div to inject into
 */
export function renderStatsUI(revealStats, container) {
    container.innerHTML = `
        <h2 style="color:var(--primary); margin-top:0; text-align:center;
                   border-bottom:2px solid var(--border-light); padding-bottom:15px;">
            The Reveal — Locker Room
        </h2>
        <div class="stat-grid">
            <div class="stat-box">
                <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Games Played</div>
                <div class="stat-val">${revealStats.gamesPlayed || 0}</div>
            </div>
            <div class="stat-box">
                <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">High Score</div>
                <div class="stat-val" style="color:var(--p1)">${revealStats.highScore || 0}</div>
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px;">
            <button class="btn btn-main"
                    onclick="hideModal('stats-modal')"
                    style="flex:1; margin-right:10px;">
                Close
            </button>
            <button class="btn btn-reset"
                    onclick="window.activeCartridge.resetStats(); hideModal('stats-modal');"
                    style="margin-top:0; padding:16px;">
                Reset
            </button>
        </div>`;
}

/**
 * resetStats()
 * ─────────────
 * EXPORTED — called by the Reset button inside renderStatsUI's HTML,
 * and by app.js window.resetStats() delegation.
 * Wipes The Reveal's localStorage data and confirms to the user.
 */
export function resetStats() {
    if (!confirm("Reset your The Reveal stats? This cannot be undone.")) return;
    state.userStats.the_reveal = { gamesPlayed: 0, highScore: 0 };
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
    alert("The Reveal stats have been reset.");
    if (window.hideModal) window.hideModal('stats-modal');
}

/**
 * shareChallenge()
 * ─────────────────
 * EXPORTED — called by app.js window.shareChallenge() delegation.
 * Triggers the platform share sheet (navigator.share on mobile,
 * clipboard fallback on desktop).
 */
export function shareChallenge() {
    const score = state.rawScores[0] || 0;
    const text  = `👁️ The Reveal — Yardbird's Games\nI scored ${score} pts in Visual Pattern Recognition!\nThink you have sharper eyes?`;
    const url   = `${window.location.origin}${window.location.pathname}`;

    if (navigator.share) {
        navigator.share({ title: "Beat My Score!", text, url }).catch(console.error);
    } else {
        navigator.clipboard.writeText(`${text}\n${url}`)
            .then(() => alert("Challenge link copied to clipboard!"))
            .catch(() => prompt("Copy this link:", url));
    }
}


// ==============================================================================
// SECTION 12 — PRIVATE HELPERS
// ==============================================================================

/**
 * _buildOptions()
 * ────────────────
 * Constructs the shuffled MC options array for the current round.
 * Format matches what multiplayer.js renderClientMC() expects:
 *   [{ str: "Display Text", isCorrect: true|false }]
 *
 * @return {Array<{str:string, isCorrect:boolean}>}
 */
function _buildOptions() {
    const opts = [{ str: revealState.currentData.answer, isCorrect: true }];
    (revealState.currentData.wrong || []).forEach(w => opts.push({ str: w, isCorrect: false }));
    return _shuffleArray(opts);
}

/**
 * _highlightCorrectButton()
 * ──────────────────────────
 * Scans all MC buttons and adds the .correct class to the one that matches
 * the current round's answer. Called after evaluateGuess() disables buttons
 * so the player always sees which answer was right — even if they were wrong.
 */
function _highlightCorrectButton() {
    const answer = revealState.currentData?.answer;
    if (!answer) return;
    document.querySelectorAll('#mc-fields .mc-btn').forEach(btn => {
        if (btn.innerText === answer) btn.classList.add('correct');
    });
}

/**
 * _buildScoreBoard()
 * ───────────────────
 * Generates the score pill HTML for #score-board.
 * Reads from state.rawScores and state.streaks.
 * In host-multiplayer mode, the host board is intentionally empty
 * (the host sees lock-in counts instead of scores during a round).
 *
 * @return {string} HTML string for innerHTML injection
 */
function _buildScoreBoard() {
    if (state.isMultiplayer && state.isHost) return '';
    return state.rawScores.map((s, i) => `
        <div class="score-pill" style="border-color:${colors[i % colors.length]};">
            <div class="p-name" style="color:${colors[i % colors.length]}">
                ${state.numPlayers === 1 ? 'SCORE' : `P${i + 1}`}
            </div>
            <div class="p-pts" style="color:var(--dark-text)">${s || 0}</div>
            <div class="p-streak"
                 style="color:${colors[i % colors.length]};
                        opacity:${(state.streaks[i] || 0) > 0 ? 1 : 0}">
                🔥 ${state.streaks[i] || 0}
            </div>
        </div>`
    ).join('');
}

/**
 * _setFeedback(html)
 * ───────────────────
 * Safely replaces the entire contents of #feedback.
 * All content inside #feedback is wiped between rounds, so evaluation
 * messages injected via _appendFeedback() are automatically cleaned up.
 *
 * @param {string} html — HTML string to inject
 */
function _setFeedback(html) {
    const el = document.getElementById('feedback');
    if (el) el.innerHTML = html;
}

/**
 * _appendFeedback(html)
 * ──────────────────────
 * Appends HTML to #feedback without wiping the existing content.
 * Used by evaluateGuess() and evaluateMultiplayerRound() to add the
 * result message below the now-revealed image — both live inside #feedback
 * so they're automatically cleared at the next _setFeedback() call.
 *
 * NOTE: This replaces the original insertAdjacentHTML('afterend') approach
 * which placed content OUTSIDE #feedback, creating a cleanup race condition.
 *
 * @param {string} html — HTML string to append
 */
function _appendFeedback(html) {
    const el = document.getElementById('feedback');
    if (el) el.innerHTML += html;
}

/**
 * _shuffleArray(array)
 * ─────────────────────
 * Modern Fisher-Yates shuffle using ES6 destructuring swap.
 * Always returns a NEW array (never mutates the input).
 * Used for: block removal order, option ordering, queue randomization.
 *
 * @param  {Array} array — Any array to shuffle
 * @return {Array}       — New shuffled copy of the input
 */
function _shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * CATEGORIES
 * ───────────
 * Display labels for each mode — used in the currentPrompt Firebase node
 * so client phones see a descriptive hint rather than a raw mode ID.
 */
const CATEGORIES = {
    movies:       "🎬 Movies",
    megastars:    "🌟 Megastars",
    masterpieces: "🎨 Masterpieces"
};
