/**
 * ==============================================================================
 * YARDBIRD'S GAMES — CARTRIDGE: THE CONSENSUS  (consensusLogic.js)
 * ==============================================================================
 *
 * WHAT THIS GAME IS:
 *   A social party game that reads the room. Players answer 5 different styles
 *   of social-psychology prompts — from "Who's most likely to..." votes to
 *   numeric guesstimation — and earn points by predicting what the GROUP will
 *   do, not just answering correctly. The game is designed for groups of 3–8
 *   players gathered around a shared screen (Kahoot-style).
 *
 * THE 5 ROUND TYPES:
 *   Type 1 — The Finger Point:   Vote for the player who best fits a description.
 *             Score if you voted for the majority pick.
 *   Type 2 — The Great Divide:   Choose between two scenarios (A or B), then
 *             predict which side the majority of the room will choose.
 *             Score based on prediction accuracy.
 *   Type 3 — Hive Mind:          A Family Feud-style survey. Pick the #1 answer.
 *             Score: #1 = 300pts | #2 = 200pts | #3 = 100pts.
 *   Type 4 — Guilty As Charged:  Raise your hand if you've done the thing.
 *             Predict how many total hands will be raised. Score by proximity.
 *   Type 5 — Shot in the Dark:   Type the closest numeric guess to a real fact.
 *             Score: exact = 300 | within 10% = 200 | within 25% = 100.
 *
 * DATA SOURCES (Two Modes):
 *   · Party Pack  — Built-in curated questions from db_consensus.json.
 *                   Solo players only see Types 3 and 5 (no voting needed).
 *   · Infinite AI — Sends round count + type instructions to OpenAI GPT-4o-mini.
 *                   Returns a JSON array of questions with equal type distribution.
 *
 * SOLO vs. MULTIPLAYER:
 *   · Solo:        renderSoloUI() shows MC or numeric input directly on-screen.
 *                  Types 1, 2, 4 are excluded (require a group).
 *   · Multiplayer: Host runs the loop. Phones render their input via
 *                  renderClientUI() which reads hostState from Firebase.
 *                  All 5 types are available.
 *
 * SCORING (Multiplayer):
 *   Consensus scoring is unique — it's not about who's fastest, but who
 *   best reads the room. Points are computed by comparing each player's
 *   guess to the GROUP's aggregate answer, not to a fixed correct answer.
 *
 * CARTRIDGE CONTRACT (required by app.js validateCartridge):
 *   ✅ manifest                   — game metadata & setup config
 *   ✅ startGame()                — entry point, triggers data fetch
 *   ✅ evaluateGuess()            — solo scoring logic
 *   ✅ evaluateMultiplayerRound() — multiplayer scoring (consensus-based)
 *   ✅ renderClientUI()           — dynamic phone UI per round type
 *   ✅ handleStop()               — stub (no audio)
 *   ✅ forceLifeline()            — stub (no lifeline mechanic)
 *   ✅ startDailyChallenge()      — stub (not yet implemented)
 *   ✅ resetStats()               — clears localStorage for this cartridge
 *   ✅ shareChallenge()           — platform share sheet
 *   ✅ renderStatsUI()            — injects stats HTML into stats modal
 *
 * FILE STRUCTURE (section map):
 *   SECTION 1  — Imports & Constants
 *   SECTION 2  — Manifest (Cartridge Contract)
 *   SECTION 3  — Stats & Sharing
 *   SECTION 4  — startGame() & executeFetchLogic()
 *   SECTION 5  — nextRound() & renderSoloUI()
 *   SECTION 6  — Round Timer (_startRoundTimer)
 *   SECTION 7  — Dynamic Client UI (renderClientUI)
 *   SECTION 8  — Guess Evaluation: Solo (evaluateGuess)
 *   SECTION 9  — Guess Evaluation: Multiplayer (evaluateMultiplayerRound)
 *   SECTION 10 — End Game (endGameSequence)
 *   SECTION 11 — Platform Stubs
 * ==============================================================================
 */


// ==============================================================================
// SECTION 1 — IMPORTS & CONSTANTS
// ==============================================================================

import { db } from './firebase.js';
import { state, sfxTick, sfxCheer, sfxBuzzer, colors, bgm } from './state.js';

/**
 * ROUND_TYPES  {Object}
 * ──────────────────────
 * Human-readable display names for each round type, keyed by type number.
 * Used in nextRound() to build the round tag badge and in evaluateMultiplayerRound()
 * to label the feedback section for each type.
 *
 * Displayed as: "The Finger Point (Round 1/8) 🔥 2X BONUS"
 */
const ROUND_TYPES = {
    1: "The Finger Point",
    2: "The Great Divide",
    3: "Hive Mind",
    4: "Guilty As Charged",
    5: "Shot In The Dark"
};


// ==============================================================================
// SECTION 2 — MANIFEST (CARTRIDGE CONTRACT)
// ==============================================================================

/**
 * manifest  {Object}
 * ───────────────────
 * NOTABLE FIELDS:
 *   clientUI: "dynamic"  — Unlike "multiple-choice" or "typing-and-mc",
 *                          "dynamic" tells the platform that the phone UI
 *                          is built entirely at runtime by renderClientUI()
 *                          based on the round type broadcast via hostState.
 *                          The platform shell just reserves the container —
 *                          Consensus fills it with the right input widget.
 *
 *   modes:               — Party Pack uses db_consensus.json (local).
 *                          Infinite AI calls OpenAI GPT-4o-mini with a
 *                          structured type-distribution prompt.
 *
 *   levels:              — Controls timeLimit only (30s Casual, 15s Speedrun).
 */
export const manifest = {
    id: "consensus",
    title: "THE CONSENSUS",
    subtitle: "A Social Party Game",
    rulesHTML: `
        <h2>The 5 Consensus Games</h2>
        <div style="text-align:left; color:#ccc; line-height:1.5; font-size:0.9rem;">
            <p><strong style="color:var(--highlight);">1. Most Likely To:</strong> Secretly vote for the player in the room who best fits the description.</p>
            <p><strong style="color:var(--highlight);">2. The Great Divide:</strong> Pick between two scenarios, then predict which one the majority will choose.</p>
            <p><strong style="color:var(--highlight);">3. Hive Mind:</strong> A Kahoot-style survey. Guess the #1 answer from Family Feud-style data.</p>
            <p><strong style="color:var(--highlight);">4. Guilty as Charged:</strong> Raise your hand if you've done the thing. Then predict total hands raised.</p>
            <p><strong style="color:var(--highlight);">5. Shot in the Dark:</strong> Type the closest numeric guess. Closer = more points.</p>
        </div>
        <button class="btn btn-main" onclick="hideModal('rules-modal')" style="width:100%; margin-top:15px;">
            Let's Go!
        </button>
    `,
    modes: [
        { id: "party_pack",  title: "📦 Party Pack",  desc: "Play with classic built-in questions." },
        { id: "ai_infinite", title: "✨ Infinite AI",  desc: "Generate unique, absurd prompts using OpenAI." }
    ],
    levels: [
        { id: "easy", title: "🟢 Casual",   desc: "30s rounds. Relaxed pacing." },
        { id: "hard", title: "🔴 Speedrun", desc: "15s rounds. Pure chaos." }
    ],
    clientUI: "dynamic"
};


// ==============================================================================
// SECTION 3 — STATS & SHARING
// ==============================================================================

/**
 * resetStats()
 * ─────────────
 * EXPORTED — clears Consensus stats from localStorage after user confirmation.
 */
export function resetStats() {
    if (confirm("Reset Consensus lifetime stats?")) {
        state.userStats.consensus = { gamesPlayed: 0, highScore: 0 };
        localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
        alert("Consensus stats reset.");
        if (window.hideModal) window.hideModal('stats-modal');
    }
}

/**
 * renderStatsUI()
 * ────────────────
 * EXPORTED — injects stats HTML into #stats-content for the stats modal.
 */
export function renderStatsUI() {
    const s = state.userStats.consensus || {};
    document.getElementById('stats-content').innerHTML = `
        <h2 style="color:var(--brand); margin-top:0; text-align:center; border-bottom:1px solid #333; padding-bottom:15px;">The Consensus Locker</h2>
        <div class="stat-grid">
            <div class="stat-box"><div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Games Played</div><div class="stat-val">${s.gamesPlayed || 0}</div></div>
            <div class="stat-box"><div style="font-size:0.7rem; color:#888; text-transform:uppercase;">High Score</div><div class="stat-val" style="color:var(--p1)">${s.highScore || 0}</div></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;">
            <button class="btn btn-main" onclick="hideModal('stats-modal')" style="flex:1; margin-right:10px;">Close</button>
            <button class="btn btn-reset" onclick="if(window.activeCartridge&&window.activeCartridge.resetStats){window.activeCartridge.resetStats();hideModal('stats-modal');}" style="margin-top:0; padding:16px;">Reset</button>
        </div>`;
}

/**
 * shareChallenge()
 * ─────────────────
 * EXPORTED — shares the player's final score via Web Share API or clipboard.
 */
export function shareChallenge() {
    const modeName  = state.gameState.mode === 'ai_infinite' ? 'Infinite AI' : 'Party Pack';
    const shareText = `I just scored ${state.rawScores[0]} points in The Consensus (${modeName})! Think you can read the room better?`;

    if (navigator.share) {
        navigator.share({ title: "Yardbird's Games", text: shareText, url: window.location.href }).catch(console.error);
    } else {
        navigator.clipboard.writeText(shareText + " " + window.location.href);
        alert("Score copied to clipboard!");
    }
}


// ==============================================================================
// SECTION 4 — startGame() & executeFetchLogic()
// ==============================================================================

/**
 * startGame()
 * ────────────
 * EXPORTED — platform entry point. Resets state and triggers executeFetchLogic().
 *
 * SOLO TYPE RESTRICTION:
 *   Types 1, 2, and 4 all require a group to vote — they have no valid solo
 *   answer. executeFetchLogic() enforces allowedTypes = [3, 5] for solo,
 *   and [1, 2, 3, 4, 5] for multiplayer, then filters or re-prompts AI
 *   to only generate allowed types.
 */
export function startGame() {
    // ── Garbage collection: wipe state from other cartridges ──
    state.curIdx       = 0;
    state.songs        = [];
    state.globalPool   = [];
    state.matchHistory = [];

    state.isDailyMode  = false;
    state.numPlayers   = state.isMultiplayer ? state.numPlayers : 1;
    state.timeLimit    = state.gameState.level === 'easy' ? 30 : 15;
    state.maxRounds    = state.gameState.rounds;
    state.curIdx       = 0;
    state.rawScores    = new Array(state.numPlayers).fill(0);
    state.streaks      = new Array(state.numPlayers).fill(0);

    // ── Double-round generation (one per 5-round block) ──
    state.doubleRounds = [];
    for (let i = 0; i < state.maxRounds; i += 5) {
        const min = i === 0 ? 1 : i;
        const max = Math.min(i + 4, state.maxRounds - 1);
        if (min <= max) state.doubleRounds.push(Math.floor(Math.random() * (max - min + 1)) + min);
    }

    document.getElementById('start-btn-top').style.display = 'none';
    document.getElementById('feedback-setup').innerText = "Loading Prompts...";

    executeFetchLogic();
}

/**
 * executeFetchLogic()
 * ────────────────────
 * PRIVATE — async data-loading function. Routes between Party Pack and AI Infinite.
 *
 * PARTY PACK PATH:
 *   Reads from db_consensus.json, filters to allowedTypes, shuffles, slices
 *   to state.maxRounds, then calls nextRound().
 *
 * AI INFINITE PATH:
 *   Calls OpenAI GPT-4o-mini with a carefully structured prompt that:
 *   · Lists ONLY the allowed type schemas (so the model can't hallucinate new ones)
 *   · Requests equal type distribution
 *   · Requires JSON output with a "questions" array
 *   Parses the response, filters to valid types, shuffles, then calls nextRound().
 *
 * TYPE-SPECIFIC PROMPT NOTES:
 *   Type 5 (Guesstimation): the system prompt explicitly bans jellybean/container
 *   questions and asks for variety (speed, weight, population, distance, cost).
 *   This was added after early AI runs generated boring, samey questions.
 */
async function executeFetchLogic() {
    // Solo: only numeric/survey types — voting requires a group
    const allowedTypes = state.numPlayers > 1 ? [1, 2, 3, 4, 5] : [3, 5];
    state.songs = [];

    if (state.gameState.mode === 'ai_infinite') {
        const apiKey = document.getElementById('custom-input')?.value?.trim();
        if (!apiKey) {
            alert("Please paste your OpenAI API Key in the custom input box!");
            document.getElementById('start-btn-top').style.display = 'block';
            document.getElementById('feedback-setup').innerText = '';
            return;
        }
        localStorage.setItem('consensus_openai_key', apiKey);
        document.getElementById('feedback-setup').innerText = "Generating absurd AI prompts...";

        try {
            // ── Build per-type schema instructions for the AI prompt ──
            let typeInstructions = '';
            if (allowedTypes.includes(1)) typeInstructions += `Type 1 (Who is most likely to): {"type": 1, "prompt": "Who is most likely to..."}. `;
            if (allowedTypes.includes(2)) typeInstructions += `Type 2 (This or That): {"type": 2, "prompt": "Which is superior?", "optA": "...", "optB": "..."}. `;
            if (allowedTypes.includes(3)) typeInstructions += `Type 3 (Survey): {"type": 3, "prompt": "Name a...", "options": ["#1 Answer", "#2 Answer", "#3 Answer", "Plausible but wrong 4th answer"]}. `;
            if (allowedTypes.includes(4)) typeInstructions += `Type 4 (Confession): {"type": 4, "prompt": "Raise your hand if..."}. `;
            if (allowedTypes.includes(5)) typeInstructions += `Type 5 (Guesstimation): {"type": 5, "prompt": "A factual numeric question", "answer": <int>}. DO NOT generate jellybean/container questions. Use variety: speed, weight, population, time, distance, cost. `;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ role: "system", content:
                        `Generate EXACTLY ${state.maxRounds} absurd, G-rated party game questions. ` +
                        `ONLY use these allowed types: ${allowedTypes.join(', ')}. ` +
                        `Provide equal distribution across allowed types. ` +
                        `Format as a JSON object with a "questions" array. ${typeInstructions}`
                    }],
                    response_format: { type: "json_object" },
                    temperature: 1.1
                })
            });

            const data              = await response.json();
            const generatedQuestions = JSON.parse(data.choices[0].message.content).questions;

            state.songs = generatedQuestions
                .map(q => ({ ...q, type: parseInt(q.type) }))
                .filter(q => allowedTypes.includes(q.type))
                .sort(() => 0.5 - Math.random());

            if (state.songs.length === 0) throw new Error("AI generated invalid question types.");

        } catch (err) {
            console.error(err);
            alert("AI generation failed. Check your API key and try again.");
            document.getElementById('start-btn-top').style.display = 'block';
            document.getElementById('feedback-setup').innerText = '';
            return;
        }

    } else {
        // ── Party Pack path: load from db_consensus.json ──
        try {
            const res  = await fetch('db_consensus.json');
            if (!res.ok) throw new Error("Could not load db_consensus.json");
            const db   = await res.json();
            const pool = (db.questions || []).filter(q => allowedTypes.includes(parseInt(q.type)));
            if (pool.length < state.maxRounds) {
                alert(`Not enough questions in Party Pack. Lower rounds or switch to AI.`);
                document.getElementById('start-btn-top').style.display = 'block';
                return;
            }
            state.songs = pool.sort(() => 0.5 - Math.random()).slice(0, state.maxRounds);
        } catch (err) {
            console.error(err);
            alert("Failed to load db_consensus.json!");
            document.getElementById('start-btn-top').style.display = 'block';
            return;
        }
    }

    // ── Transition to play screen ──
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');
    document.querySelectorAll('.header-btn').forEach(btn => btn.classList.add('hidden'));
    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('btn-container').classList.add('hidden');
    document.getElementById('visualizer').classList.add('hidden');
    document.getElementById('reveal-art').style.display = 'none';

    // ── Render initial score pill (solo) ──
    if (state.numPlayers === 1) {
        document.getElementById('score-board').innerHTML = state.rawScores.map((s, i) => `
            <div class="score-pill" style="border-color:${colors[i]}">
                <div class="p-name" style="color:${colors[i]}">${state.numPlayers === 1 ? 'SCORE' : 'P'+(i+1)}</div>
                <div class="p-pts" style="color:var(--dark-text)">${s}</div>
                <div class="p-streak" style="color:${colors[i % colors.length]}; opacity:${state.streaks[i] > 0 ? 1 : 0}">🔥 ${state.streaks[i]}</div>
            </div>`).join('');
    }

    nextRound();
}


// ==============================================================================
// SECTION 5 — nextRound() & renderSoloUI()
// ==============================================================================

/**
 * nextRound()
 * ────────────
 * PRIVATE — advances the game to the next question or ends the game.
 *
 * MULTIPLAYER FLOW:
 *   1. Write question data to Firebase hostState (phase: 'input', type, qData).
 *   2. Clear each player's guess1/guess2 fields and reset their status to 'guessing'.
 *   3. Broadcast currentPrompt so phones can display the question.
 *   The host screen shows the prompt + "Check your phone to answer!".
 *
 * SOLO FLOW:
 *   1. Call renderSoloUI(q) to inject the appropriate input widget.
 *   Solo only sees Types 3 (Hive Mind) and 5 (Shot in the Dark).
 *
 * FIREBASE SAFEQDATA:
 *   We construct a sanitized safeQData object before writing to Firebase.
 *   Firebase rejects undefined values — every field must have a fallback.
 *   This also means phones always get a complete object even if the question
 *   DB entry is missing optional fields (optA, optB, options, answer).
 */
function nextRound() {
    if (state.curIdx >= state.maxRounds) { endGameSequence(); return; }
    state.isProcessing = false;

    const q        = state.songs[state.curIdx];
    const isDouble = state.doubleRounds.includes(state.curIdx);

    if (state.isHost) {
        // ── Multiplayer: broadcast round data to phones ──
        document.getElementById('score-board').innerHTML = '';
        db.ref(`rooms/${state.roomCode}/currentRound`).set(state.curIdx + 1);
        db.ref(`rooms/${state.roomCode}/currentPrompt`).set(q.prompt);

        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            if (snap.exists()) {
                let updates = {};
                snap.forEach(p => {
                    updates[`${p.key}/guess1`]  = null;
                    updates[`${p.key}/guess2`]  = null;
                    updates[`${p.key}/status`]  = 'guessing';
                });
                db.ref(`rooms/${state.roomCode}/players`).update(updates);
            }
        });

        // safeQData: all optional fields get fallbacks to prevent Firebase errors
        const currentType = parseInt(q.type) || 5;
        const safeQData = {
            type:    currentType,
            prompt:  q.prompt  || "Check TV for prompt",
            answer:  q.answer  || 0,
            optA:    q.optA    || "",
            optB:    q.optB    || "",
            options: q.options || []
        };

        db.ref(`rooms/${state.roomCode}/hostState`).set({
            phase:    'input',
            type:     currentType,
            qData:    safeQData,
            isDouble: !!isDouble
        });

    } else if (state.numPlayers === 1) {
        renderSoloUI(q);
    }

    // ── Round tag badge ──
    const tag = document.getElementById('active-player');
    tag.innerText     = `${ROUND_TYPES[q.type]} (Round ${state.curIdx + 1}/${state.maxRounds}) ${isDouble ? '🔥 2X BONUS' : ''}`;
    tag.style.color       = isDouble ? "#f39c12" : "var(--primary)";
    tag.style.borderColor = isDouble ? "#f39c12" : "var(--primary)";

    // ── Host/Solo prompt display ──
    const subText = state.numPlayers === 1
        ? (q.type === 3 ? "Pick the #1 Survey Answer!" : "Type your closest guess!")
        : "Check your phone to answer!";

    document.getElementById('feedback').innerHTML = `
        <div class="prompt-text">${q.prompt}</div>
        <div style="color:var(--text-muted); font-weight:bold; text-transform:uppercase;">${subText}</div>
        ${state.isHost ? `<div id="host-lock-status" style="color:var(--primary); font-size:1.3rem; font-weight:bold; margin-top:20px;">LOCKED IN: 0 / ${state.numPlayers}</div>` : ''}`;

    _startRoundTimer();
}

/**
 * renderSoloUI(q)
 * ────────────────
 * PRIVATE — builds the solo answer input widget for the current question type.
 * Only called in state.numPlayers === 1 (solo) mode.
 *
 * TYPE 3 (Hive Mind): injects 4 MC buttons from q.options.
 *   Button onclick calls evaluateGuess() with the selected option index (0–3).
 *   Index 0 = the #1 survey answer = highest score.
 *
 * TYPE 5 (Shot in the Dark): shows a numeric text input.
 *   Player types a number; evaluateGuess() reads it from state.soloGuess.
 *   Scoring is by proximity (exact → within 10% → within 25%).
 *
 * WHY state.soloGuess?
 *   The timer calls evaluateGuess() automatically when it hits 0.
 *   Using a module-level state variable lets the timer-fired eval read the
 *   last-typed value without searching the DOM.
 *
 * @param {Object} q — The current question object from state.songs[state.curIdx]
 */
function renderSoloUI(q) {
    const mcContainer = document.getElementById('mc-fields');
    mcContainer.innerHTML = '';
    mcContainer.classList.remove('hidden');
    state.soloGuess = null;

    if (q.type === 3) {
        // ── Hive Mind: 4-option survey ──
        (q.options || []).forEach((option, index) => {
            const btn     = document.createElement('button');
            btn.className = 'mc-btn';
            btn.innerText = option;
            btn.onclick   = () => { state.soloGuess = index; evaluateGuess(); };
            mcContainer.appendChild(btn);
        });

    } else if (q.type === 5) {
        // ── Shot in the Dark: numeric input ──
        mcContainer.innerHTML = `
            <input type="number" id="solo-numeric-input" placeholder="Type your best guess..."
                   style="width:100%; padding:16px; font-size:1.3rem; border-radius:12px;
                          border:2px solid var(--border-light); background:var(--surface);
                          color:var(--dark-text); text-align:center;"
                   oninput="state.soloGuess = this.value">
            <button class="btn btn-main" style="margin-top:10px;"
                    onclick="if(document.getElementById('solo-numeric-input').value) evaluateGuess()">
                Submit Guess
            </button>`;
    }
}


// ==============================================================================
// SECTION 6 — ROUND TIMER (_startRoundTimer)
// ==============================================================================

/**
 * _startRoundTimer()
 * ───────────────────
 * PRIVATE — starts the countdown timer for the current round.
 *
 * Uses an orange progress bar (consistent with Song Trivia's guess timer style).
 * Syncs state.timeLeft to Firebase each tick so phone clients show a live bar.
 *
 * ON EXPIRY:
 *   · Multiplayer (host): reads Firebase player nodes and calls evaluateMultiplayerRound().
 *     A Promise chain ensures execution even if Firebase is slow.
 *   · Solo: calls evaluateGuess() with whatever state.soloGuess contains at that moment.
 *     If the player never answered, soloGuess = null → 0 points.
 *
 * SFX:
 *   Plays sfxTick in the last 3 seconds. Timer bar turns red (var(--fail)).
 */
function _startRoundTimer() {
    state.timeLeft = state.timeLimit;

    const timerElement = document.getElementById('timer');
    timerElement.innerHTML = `<div class="timer-bar-container"><div id="timer-bar-fill" class="timer-bar-fill" style="background: #f39c12;"></div></div>`;
    const timerFill = document.getElementById('timer-bar-fill');

    state.timerId = setInterval(() => {
        state.timeLeft--;
        const percentage = (state.timeLeft / state.timeLimit) * 100;
        if (timerFill) timerFill.style.width = `${percentage}%`;

        // Sync to Firebase for phone timer displays
        if (state.isHost) db.ref(`rooms/${state.roomCode}/timeLeft`).set(state.timeLeft);

        if (state.timeLeft <= 3 && state.timeLeft > 0) {
            if (timerFill) timerFill.style.backgroundColor = 'var(--fail)';
            sfxTick.play().catch(() => {});
        }

        if (state.timeLeft <= 0) {
            clearInterval(state.timerId);
            if (state.isHost) {
                // Promise chain ensures evaluation fires even on slow Firebase reads
                db.ref(`rooms/${state.roomCode}/players`).once('value')
                    .then(snap => evaluateMultiplayerRound(snap.val()))
                    .catch(err => { console.error(err); evaluateMultiplayerRound({}); });
            } else {
                evaluateGuess();
            }
        }
    }, 1000);
}


// ==============================================================================
// SECTION 7 — DYNAMIC CLIENT UI (renderClientUI)
// ==============================================================================

/**
 * renderClientUI(hostState)
 * ──────────────────────────
 * EXPORTED — the phone-side UI renderer. Called by multiplayer.js whenever
 * the Firebase hostState node changes. Builds the appropriate input widget
 * for each round type directly inside #client-consensus-ui.
 *
 * PHASE ROUTING:
 *   · phase: 'loading'   → spinner while host loads questions
 *   · phase: 'reveal'    → "Look at the TV!" holding screen
 *   · phase: 'gameover'  → "Look at the TV!" holding screen
 *   · phase: 'input'     → render the question-specific input widget (see below)
 *
 * ROUND TYPE WIDGETS:
 *   Type 1 (Finger Point):   Player list rendered as buttons. Tap to vote.
 *                            Writes guess1 = playerName to Firebase.
 *   Type 2 (Great Divide):   Two large scenario buttons (optA / optB), plus
 *                            prediction buttons for which side wins.
 *                            Writes guess1 = choice, guess2 = prediction.
 *   Type 3 (Hive Mind):      4 MC option buttons, one per survey answer.
 *                            Writes guess1 = chosen option text.
 *   Type 4 (Guilty As Charged): "Raise Hand" + numeric prediction input.
 *                            Writes guess1 = "yes"/"no", guess2 = prediction.
 *   Type 5 (Shot in the Dark): Numeric text input.
 *                            Writes guess1 = numeric string.
 *
 * SUBMIT PATTERN:
 *   All types write to Firebase via:
 *   db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update({ guess1, guess2, status: 'locked' })
 *   After writing, shows a "✅ Locked In!" confirmation screen.
 *
 * window.consensusTempPayload:
 *   Temporary client-side store for multi-step Type 2 and Type 4 inputs.
 *   Reset at the start of each renderClientUI call so stale answers
 *   from the previous round don't leak into the current one.
 *
 * @param {Object} hostState — Firebase hostState snapshot value
 */
export function renderClientUI(hostState) {
    const container = document.getElementById('client-consensus-ui');
    const promptDiv = document.getElementById('client-prompt');
    if (!container) return;

    window.consensusTempPayload = { guess1: null, guess2: null };

    if (hostState.phase === 'loading') {
        if (promptDiv) { promptDiv.innerText = ''; promptDiv.classList.add('hidden'); }
        container.innerHTML = `<div style="font-size:1.5rem; color:var(--primary); font-weight:bold; margin-top:40px;">
            Loading Prompts...<br><span style="font-size:1rem; color:var(--text-muted);">Get ready!</span></div>`;
        return;
    }

    if (hostState.phase === 'reveal' || hostState.phase === 'gameover') {
        if (promptDiv) { promptDiv.innerText = ''; promptDiv.classList.add('hidden'); }
        container.innerHTML = `<div style="font-size:1.8rem; color:var(--text-muted); font-weight:bold; margin-top:40px;">Look at the TV!</div>`;
        return;
    }

    const q    = hostState.qData || {};
    const type = parseInt(hostState.type || q.type);

    // ── Show the question prompt on the phone screen ──
    if (promptDiv && q.prompt) {
        promptDiv.innerText = q.prompt;
        promptDiv.classList.remove('hidden');
    }

    // ── Shared submit helper ──
    const lockIn = (guess1, guess2 = null) => {
        db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update({
            guess1, guess2, status: 'locked'
        });
        container.innerHTML = `<div style="font-size:2rem; color:var(--success); font-weight:900; margin-top:40px;">✅ Locked In!</div>`;
        if (promptDiv) promptDiv.classList.add('hidden');
    };

    let html = '';

    if (type === 1) {
        // ── The Finger Point: vote for a player ──
        const playerNames = Object.values(state.playerNames || {});
        html = playerNames.map(name =>
            `<button class="mc-btn" onclick="document.getElementById('client-consensus-ui').querySelectorAll('.mc-btn').forEach(b=>b.disabled=true); window.consensusTempPayload.guess1='${name}'; db.ref('rooms/${state.roomCode}/players/${state.myPlayerId}').update({guess1:'${name}',status:'locked'});">${name}</button>`
        ).join('');

    } else if (type === 2) {
        // ── The Great Divide: choose + predict ──
        html = `
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:8px;">YOUR PICK:</p>
            <button class="mc-btn" onclick="window.consensusTempPayload.guess1='${q.optA}';">${q.optA}</button>
            <button class="mc-btn" onclick="window.consensusTempPayload.guess1='${q.optB}';">${q.optB}</button>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-top:12px; margin-bottom:8px;">WHO WINS?</p>
            <button class="mc-btn" onclick="if(window.consensusTempPayload.guess1) { window.consensusTempPayload.guess2='${q.optA}'; db.ref('rooms/${state.roomCode}/players/${state.myPlayerId}').update({guess1:window.consensusTempPayload.guess1,guess2:'${q.optA}',status:'locked'}); document.getElementById('client-consensus-ui').innerHTML='<div style=\\"font-size:2rem;color:var(--success);font-weight:900;margin-top:40px;\\">✅ Locked In!</div>'; }">${q.optA} Wins</button>
            <button class="mc-btn" onclick="if(window.consensusTempPayload.guess1) { window.consensusTempPayload.guess2='${q.optB}'; db.ref('rooms/${state.roomCode}/players/${state.myPlayerId}').update({guess1:window.consensusTempPayload.guess1,guess2:'${q.optB}',status:'locked'}); document.getElementById('client-consensus-ui').innerHTML='<div style=\\"font-size:2rem;color:var(--success);font-weight:900;margin-top:40px;\\">✅ Locked In!</div>'; }">${q.optB} Wins</button>`;

    } else if (type === 3) {
        // ── Hive Mind: 4-option survey ──
        html = (q.options || []).map(opt =>
            `<button class="mc-btn" onclick="document.getElementById('client-consensus-ui').querySelectorAll('.mc-btn').forEach(b=>b.disabled=true); db.ref('rooms/${state.roomCode}/players/${state.myPlayerId}').update({guess1:'${opt.replace(/'/g,"\\'")}',status:'locked'}); document.getElementById('client-consensus-ui').innerHTML='<div style=\\"font-size:2rem;color:var(--success);font-weight:900;margin-top:40px;\\">✅ Locked In!</div>';">${opt}</button>`
        ).join('');

    } else if (type === 4) {
        // ── Guilty As Charged: raise hand + predict count ──
        html = `
            <button class="mc-btn" onclick="window.consensusTempPayload.guess1='yes'; this.style.background='var(--success)'; this.style.color='#fff';">🙋 Raise Hand</button>
            <button class="mc-btn" onclick="window.consensusTempPayload.guess1='no'; this.style.background='var(--fail)'; this.style.color='#fff';">🙅 Nope</button>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-top:12px;">Predict total hands raised:</p>
            <input type="number" id="client-hand-predict" placeholder="e.g. 3"
                   style="width:80%; padding:12px; font-size:1.3rem; border-radius:10px; border:2px solid var(--border-light); background:var(--surface); color:var(--dark-text); text-align:center;">
            <button class="btn btn-main" style="margin-top:10px;" onclick="
                const v=document.getElementById('client-hand-predict').value;
                if(window.consensusTempPayload.guess1&&v){
                    db.ref('rooms/${state.roomCode}/players/${state.myPlayerId}').update({guess1:window.consensusTempPayload.guess1,guess2:v,status:'locked'});
                    document.getElementById('client-consensus-ui').innerHTML='<div style=\\"font-size:2rem;color:var(--success);font-weight:900;margin-top:40px;\\">✅ Locked In!</div>';
                }">Lock In</button>`;

    } else if (type === 5) {
        // ── Shot in the Dark: numeric input ──
        html = `
            <input type="number" id="client-numeric-input" placeholder="Your best guess..."
                   style="width:100%; padding:16px; font-size:1.3rem; border-radius:12px;
                          border:2px solid var(--border-light); background:var(--surface);
                          color:var(--dark-text); text-align:center;">
            <button class="btn btn-main" style="margin-top:10px;" onclick="
                const v=document.getElementById('client-numeric-input').value;
                if(v){
                    db.ref('rooms/${state.roomCode}/players/${state.myPlayerId}').update({guess1:v,status:'locked'});
                    document.getElementById('client-consensus-ui').innerHTML='<div style=\\"font-size:2rem;color:var(--success);font-weight:900;margin-top:40px;\\">✅ Locked In!</div>';
                }">Submit</button>`;
    }

    container.innerHTML = html;
}


// ==============================================================================
// SECTION 8 — GUESS EVALUATION: SOLO (evaluateGuess)
// ==============================================================================

/**
 * evaluateGuess()
 * ────────────────
 * EXPORTED — solo scoring. Only handles Types 3 and 5 (solo-compatible types).
 *
 * CALLED BY:
 *   · MC button onclick (Type 3) — sets state.soloGuess = index, then calls this.
 *   · Submit button (Type 5)     — reads numeric value, stored in state.soloGuess.
 *   · Timer expiry               — fires with whatever state.soloGuess contains.
 *
 * SCORING:
 *   Type 3 (Hive Mind):
 *     soloGuess === 0 → 300 pts (top answer)
 *     soloGuess === 1 → 200 pts (#2 answer)
 *     soloGuess === 2 → 100 pts (#3 answer)
 *     soloGuess === 3 → 0 pts   (the plausible-but-wrong 4th answer)
 *
 *   Type 5 (Shot in the Dark):
 *     diff = |actual - guess|
 *     diff === 0              → 300 pts
 *     diff ≤ actual × 10%    → 200 pts
 *     diff ≤ actual × 25%    → 100 pts
 *     beyond 25%             → 0 pts
 *
 * STREAK + DOUBLE:
 *   Any round earning > 0 increments the streak. Streak bonus at every 3rd.
 *   Double round multiplier (×2) applied last.
 *
 * NOTE:
 *   The isProcessing guard uses a slightly different pattern here —
 *   solo Consensus does not check isProcessing at entry because the
 *   timer may fire evaluateGuess() while the player is mid-input.
 *   Instead, isProcessing is set immediately inside to prevent double-fires.
 */
export function evaluateGuess() {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearInterval(state.timerId);

    bgm.pause();
    bgm.currentTime = 0;

    document.getElementById('mc-fields').classList.add('hidden');

    let roundPts   = 0;
    const q        = state.songs[state.curIdx];
    const isDouble = state.doubleRounds.includes(state.curIdx);
    const mult     = isDouble ? 2 : 1;
    let fb         = '';

    if (q.type === 3) {
        // Hive Mind: scored by option rank
        if (state.soloGuess === 0)      roundPts = 300 * mult;
        else if (state.soloGuess === 1) roundPts = 200 * mult;
        else if (state.soloGuess === 2) roundPts = 100 * mult;
        fb = `Top Answer: <strong style="color:var(--primary)">${q.options[0]}</strong><br>#2: ${q.options[1]}<br>#3: ${q.options[2]}`;

    } else if (q.type === 5) {
        // Shot in the Dark: proximity scoring
        const diff = Math.abs(q.answer - parseInt(state.soloGuess || 0));
        if (diff === 0)                        roundPts = 300 * mult;
        else if (diff <= q.answer * 0.1)       roundPts = 200 * mult;
        else if (diff <= q.answer * 0.25)      roundPts = 100 * mult;
        fb = `Actual Answer: <strong style="color:var(--primary)">${q.answer}</strong> (You guessed ${state.soloGuess || 0})`;
    }

    if (roundPts > 0) {
        state.streaks[0]++;
        if (state.streaks[0] > 0 && state.streaks[0] % 3 === 0) roundPts += 50;
        state.rawScores[0] += roundPts;
        sfxCheer.play().catch(() => {});
        document.getElementById('feedback').innerHTML = `
            <div style="color:var(--success); font-size:1.5rem; font-weight:bold;">✅ +${roundPts} POINTS</div>
            <div style="font-size:1.1rem; margin-top:10px;">${fb}</div>`;
    } else {
        state.streaks[0] = 0;
        sfxBuzzer.play().catch(() => {});
        document.getElementById('feedback').innerHTML = `
            <div style="color:var(--fail); font-size:1.5rem; font-weight:bold;">❌ 0 POINTS</div>
            <div style="font-size:1.1rem; margin-top:10px;">${fb}</div>`;
    }

    const nextMsg = (state.curIdx + 1 < state.maxRounds)
        ? `<div style="margin-top:25px; font-size:1.2rem; color:var(--text-muted); font-weight:bold; text-transform:uppercase;">Next round loading...</div>`
        : `<div style="margin-top:25px; font-size:1.2rem; color:var(--text-muted); font-weight:bold; text-transform:uppercase;">Calculating final scores...</div>`;
    document.getElementById('feedback').innerHTML += nextMsg;

    document.getElementById('score-board').innerHTML = `
        <div class="score-pill" style="border-color:${colors[0]}">
            <div class="p-name">SCORE</div>
            <div class="p-pts" style="color:var(--dark-text);">${state.rawScores[0]}</div>
            <div class="p-streak">🔥 ${state.streaks[0]}</div>
        </div>`;

    state.curIdx++;
    setTimeout(nextRound, 4000);
}


// ==============================================================================
// SECTION 9 — GUESS EVALUATION: MULTIPLAYER (evaluateMultiplayerRound)
// ==============================================================================

/**
 * evaluateMultiplayerRound(players)
 * ───────────────────────────────────
 * EXPORTED — scores ALL players simultaneously using consensus-based logic.
 * This is the most complex scoring function in the platform.
 *
 * CALLED BY:
 *   · _startRoundTimer() → timer expiry (host reads Firebase then calls this)
 *
 * CONSENSUS SCORING PHILOSOPHY:
 *   Unlike Song Trivia or Fast Math where there's one correct answer,
 *   Consensus scoring compares each player's answer to the GROUP's aggregate.
 *   The "right" answer emerges from what the room collectively chose.
 *
 * PER-TYPE SCORING LOGIC:
 *
 *   Type 1 (Finger Point):
 *     Count all votes. Find the player with the most votes (the "target").
 *     Everyone who voted for the target earns 300 pts.
 *     Tiebreak: first alphabetically by player name (deterministic, fair).
 *
 *   Type 2 (Great Divide):
 *     Count votes for optA vs optB. Determine the winning side.
 *     Players who chose the winning side AND correctly predicted it = 300pts.
 *     Players who chose the winning side but predicted wrong = 100pts.
 *     All others = 0pts.
 *
 *   Type 3 (Hive Mind):
 *     Correct answer = q.options[0] (the real #1 survey answer, curated in DB).
 *     Match by text (case-insensitive). Correct = 300pts. Wrong = 0pts.
 *
 *   Type 4 (Guilty As Charged):
 *     Count total hands raised across all players (guess1 === 'yes').
 *     Each player's prediction (guess2) is scored by proximity to actual count.
 *     Exact = 300 | within 1 = 200 | within 2 = 100.
 *
 *   Type 5 (Shot in the Dark):
 *     Compare each player's numeric guess to q.answer.
 *     Exact = 300 | within 10% = 200 | within 25% = 100.
 *
 * ERROR RECOVERY:
 *   The entire scoring block is wrapped in try/catch. If anything throws
 *   (malformed question data, empty player list, Firebase structure mismatch),
 *   the round is force-skipped and the game advances. This prevents a single
 *   bad question from freezing the entire multiplayer session.
 *
 * @param {Object} players — Firebase snapshot value: { playerId: { name, guess1, guess2 } }
 */
export function evaluateMultiplayerRound(players) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearInterval(state.timerId);

    bgm.pause();
    bgm.currentTime = 0;

    try {
        const q = state.songs[state.curIdx];
        if (!q) { state.curIdx++; setTimeout(nextRound, 3000); return; }

        const isDouble = state.doubleRounds?.includes(state.curIdx);
        const mult     = isDouble ? 2 : 1;
        const pIds     = Object.keys(players || {}).sort();
        const results  = [];
        const roundEarnings = {};
        pIds.forEach(pid => { roundEarnings[pid] = 0; });

        // ── Per-type consensus scoring ──
        if (q.type === 1) {
            // Finger Point: find the consensus target (most-voted player)
            const voteCounts = {};
            pIds.forEach(pid => {
                const v = players[pid]?.guess1;
                if (v) voteCounts[v] = (voteCounts[v] || 0) + 1;
            });
            const maxVotes  = Math.max(...Object.values(voteCounts), 0);
            const targets   = Object.keys(voteCounts).filter(k => voteCounts[k] === maxVotes).sort();
            const topTarget = targets[0];
            pIds.forEach(pid => {
                if (players[pid]?.guess1 === topTarget) roundEarnings[pid] = 300 * mult;
            });

        } else if (q.type === 2) {
            // Great Divide: find majority side, reward correct picks + predictions
            const sideCount = { a: 0, b: 0 };
            pIds.forEach(pid => {
                if (players[pid]?.guess1 === q.optA) sideCount.a++;
                else if (players[pid]?.guess1 === q.optB) sideCount.b++;
            });
            const winningSide = sideCount.a >= sideCount.b ? q.optA : q.optB;
            pIds.forEach(pid => {
                const p = players[pid] || {};
                if (p.guess1 === winningSide) {
                    roundEarnings[pid] = p.guess2 === winningSide ? 300 * mult : 100 * mult;
                }
            });

        } else if (q.type === 3) {
            // Hive Mind: compare against curated #1 answer
            const correctAnswer = (q.options?.[0] || '').toLowerCase();
            pIds.forEach(pid => {
                if ((players[pid]?.guess1 || '').toLowerCase() === correctAnswer) {
                    roundEarnings[pid] = 300 * mult;
                }
            });

        } else if (q.type === 4) {
            // Guilty As Charged: count raised hands, score by prediction proximity
            const handsRaised = pIds.filter(pid => players[pid]?.guess1 === 'yes').length;
            pIds.forEach(pid => {
                const predicted = parseInt(players[pid]?.guess2 || -999);
                const diff      = Math.abs(predicted - handsRaised);
                if (diff === 0)      roundEarnings[pid] = 300 * mult;
                else if (diff <= 1)  roundEarnings[pid] = 200 * mult;
                else if (diff <= 2)  roundEarnings[pid] = 100 * mult;
            });

        } else if (q.type === 5) {
            // Shot in the Dark: proximity to exact numeric answer
            pIds.forEach(pid => {
                const guess = parseInt(players[pid]?.guess1 || 0);
                const diff  = Math.abs(guess - q.answer);
                if (diff === 0)                   roundEarnings[pid] = 300 * mult;
                else if (diff <= q.answer * 0.1)  roundEarnings[pid] = 200 * mult;
                else if (diff <= q.answer * 0.25) roundEarnings[pid] = 100 * mult;
            });
        }

        // ── Apply streak bonuses and build feedback HTML ──
        let fbHTML = `<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px;">`;
        pIds.forEach((pid, index) => {
            if (roundEarnings[pid] > 0) {
                state.streaks[index]++;
                if (state.streaks[index] > 0 && state.streaks[index] % 3 === 0) roundEarnings[pid] += 50;
                state.rawScores[index] += roundEarnings[pid];
                fbHTML += `<div style="background:rgba(0,184,148,0.1); border:1px solid var(--success); padding:8px 12px; border-radius:8px; color:var(--success); font-weight:bold; font-size:0.9rem;">✅ ${players[pid]?.name || 'Player'}: +${roundEarnings[pid]}</div>`;
            } else {
                state.streaks[index] = 0;
                fbHTML += `<div style="background:rgba(214,48,49,0.1); border:1px solid var(--fail); padding:8px 12px; border-radius:8px; color:var(--fail); font-weight:bold; font-size:0.9rem;">❌ ${players[pid]?.name || 'Player'}: 0</div>`;
            }
            results.push({ id: pid, newScore: ((players[pid]?.score) || 0) + roundEarnings[pid] });
        });
        fbHTML += `</div>`;

        const nextMsg = (state.curIdx + 1 < state.maxRounds)
            ? `<div style="width:100%; text-align:center; margin-top:25px; font-size:1.2rem; color:var(--text-muted); font-weight:bold; text-transform:uppercase;">Next round loading...</div>`
            : `<div style="width:100%; text-align:center; margin-top:25px; font-size:1.2rem; color:var(--text-muted); font-weight:bold; text-transform:uppercase;">Calculating final scores...</div>`;
        fbHTML += nextMsg;

        db.ref(`rooms/${state.roomCode}/hostState`).set({ phase: 'reveal' });
        document.getElementById('feedback').innerHTML = fbHTML;

        document.getElementById('score-board').innerHTML = state.rawScores.map((s, i) => `
            <div class="score-pill" style="border-color:${colors[i % colors.length]};">
                <div class="p-name" style="color:${colors[i % colors.length]}">P${i + 1}</div>
                <div class="p-pts" style="color:var(--dark-text)">${s}</div>
                <div class="p-streak" style="color:${colors[i % colors.length]}; opacity:${state.streaks[i] > 0 ? 1 : 0}">🔥 ${state.streaks[i]}</div>
            </div>`).join('');

        state.curIdx++;

        if (window.finalizeMultiplayerRound) {
            // Safety guard: Firebase crashes on empty results arrays
            if (results.length === 0) results.push({ id: "dummy", newScore: 0 });
            window.finalizeMultiplayerRound(results);
        }
        setTimeout(nextRound, 7000);

    } catch (err) {
        // ── Error recovery: skip the bad round gracefully ──
        console.error("Evaluation Error:", err);
        document.getElementById('feedback').innerHTML = `<h2 style="color:var(--fail);">Round Skipped.</h2>`;
        state.curIdx++;
        if (window.finalizeMultiplayerRound) window.finalizeMultiplayerRound([{ id: "dummy", newScore: 0 }]);
        setTimeout(nextRound, 4000);
    }
}


// ==============================================================================
// SECTION 10 — END GAME (endGameSequence)
// ==============================================================================

/**
 * endGameSequence()
 * ──────────────────
 * PRIVATE — transitions play-screen → final-screen and writes stat updates.
 *
 * MULTIPLAYER FINALE:
 *   Host reads final Firebase scores (not local rawScores — Firebase is the
 *   source of truth for multiplayer). Sorts into a podium, writes to
 *   /rooms/{code}/finalLeaderboard, and broadcasts phase: 'gameover'.
 *
 * SOLO FINALE:
 *   Renders a gradient score card. Hides the playlist-box (no audio).
 *   Updates gamesPlayed and highScore in localStorage.
 */
function endGameSequence() {
    document.getElementById('play-screen').classList.add('hidden');
    document.getElementById('final-screen').classList.remove('hidden');
    document.getElementById('final-subtitle').innerText = "Consensus Scaled Scoring";

    const playlistBox = document.querySelector('.playlist-box');
    if (playlistBox) playlistBox.style.display = 'none';

    if (state.isHost) {
        db.ref(`rooms/${state.roomCode}/hostState`).set({ phase: 'gameover' });
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            const players = snap.val();
            const pIds    = Object.keys(players || {}).sort();

            let results = pIds.map((pid, idx) => {
                const finalScore = players[pid].score || 0;
                db.ref(`rooms/${state.roomCode}/players/${pid}`).update({ finalScore });
                return { name: players[pid].name, score: finalScore, id: pid };
            });
            results.sort((a, b) => b.score - a.score);
            db.ref(`rooms/${state.roomCode}/finalLeaderboard`).set(results);

            let podium = `<div style="text-align:left; background:var(--surface); padding:15px; border-radius:12px; border:2px solid var(--border-light);">`;
            results.forEach((p, idx) => {
                const medal = ['🥇','🥈','🥉'][idx] || '👏';
                const color = ['var(--p1)','var(--p2)','var(--text-muted)'][idx] || 'var(--text-muted)';
                podium += `<div style="display:flex; justify-content:space-between; padding:10px 5px; border-bottom:1px solid var(--border-light); font-size:1.2rem; font-weight:bold; color:${color};">
                    <span>${medal} ${p.name}</span><span>${p.score} pts</span>
                </div>`;
            });
            podium += `</div>`;
            document.getElementById('winner-text').innerHTML = podium;
        });
        return;
    }

    // ── Solo finale ──
    const finalScore = state.rawScores[0] || 0;
    document.getElementById('winner-text').innerHTML = `
        <div style="background:linear-gradient(135deg, var(--primary), var(--p2)); border-radius:16px; padding:20px; color:#fff;">
            <div style="font-size:2.2rem; font-weight:900;">${finalScore}</div>
            <div style="font-size:0.9rem; opacity:0.85; text-transform:uppercase; letter-spacing:1px; margin-top:4px;">
                ${state.gameState.mode?.replace('_', ' ')} · Consensus
            </div>
        </div>`;

    const s = state.userStats.consensus || {};
    s.gamesPlayed = (s.gamesPlayed || 0) + 1;
    if (finalScore > (s.highScore || 0)) s.highScore = finalScore;
    state.userStats.consensus = s;
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
}


// ==============================================================================
// SECTION 11 — PLATFORM STUBS
// ==============================================================================

/**
 * The following functions satisfy the Cartridge Contract but are not used by Consensus.
 *
 * · handleStop()          — No audio stream to stop.
 * · forceLifeline()       — No lifeline mechanic (round type handles its own UI).
 * · startDailyChallenge() — Daily mode not yet implemented for Consensus.
 */
export function handleStop()          { return; }
export function forceLifeline()       { return; }
export function startDailyChallenge() { alert("Daily Consensus coming soon!"); }
