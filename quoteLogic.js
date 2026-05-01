/**
 * ==============================================================================
 * YARDBIRD'S GAMES — CARTRIDGE: WHO SAID IT?  (quoteLogic.js)
 * ==============================================================================
 *
 * WHAT THIS GAME IS:
 *   A pop-culture quote identification battle. A quote appears on screen —
 *   players choose from 4 multiple-choice options who said it.
 *   Speed determines score: the faster the correct tap, the more points.
 *   A text-to-speech engine reads the quote aloud for extra drama.
 *
 * MODES:
 *   · Celebs & Creators — Viral tweets, TikTok quotes, celebrity sayings.
 *   · Screen & Stage    — Iconic movie and TV lines.
 *   · Lyrics & Lore     — Famous song lyrics and literary quotes.
 *
 * DATA SOURCES (Two Modes):
 *   · Party Pack  — Loads from db_quotes.json (local curated database).
 *                   Each entry: { q: "quote text", a: "Author", wrong: [...] }
 *                   Wrong answers are drawn from all other authors in the DB,
 *                   not from the entry's own wrong field (for variety).
 *   · Infinite AI — Calls OpenAI GPT-4o-mini with a mode-focused prompt.
 *                   Returns { quotes: [{ q, a, wrong[3] }] }.
 *                   Wrong answers come from the entry's own wrong field
 *                   since there's no global pool in AI mode.
 *
 * SEEDED RANDOMNESS (Challenge Mode):
 *   A PRNG (seeded LCG) ensures that shareable challenge links produce the
 *   exact same quote set and shuffle order for the recipient. The seed is
 *   encoded in the share URL: ?seed=123456&mode=celeb&beat=750
 *
 * SPEECH SYNTHESIS:
 *   window.speechSynthesis reads each quote aloud at rate 0.95 in solo mode.
 *   Cancelled on round change to prevent overlapping speech.
 *
 * SCORING:
 *   · Time-based: time remaining × 10 pts (max 200 for 20s Easy, 100 for 10s Hard).
 *   · Streak Bonus: +50 every 3rd consecutive correct answer.
 *   · Double Rounds: one per 5-round block, score × 2.
 *   · Normalized to 1000 on the finale screen.
 *
 * MULTIPLAYER:
 *   Host (TV) runs the loop. Phones receive MC options via Firebase currentMC.
 *   evaluateMultiplayerRound() scores all players simultaneously.
 *
 * CARTRIDGE CONTRACT (required by app.js validateCartridge):
 *   ✅ manifest                   — game metadata & setup config
 *   ✅ startGame()                — entry point, loads data and calls nextRound()
 *   ✅ evaluateGuess()            — solo scoring (MC button tap)
 *   ✅ evaluateMultiplayerRound() — multiplayer scoring
 *   ✅ handleStop()               — stub (no audio stream)
 *   ✅ forceLifeline()            — stub (no lifeline mechanic)
 *   ✅ startDailyChallenge()      — stub (not yet implemented)
 *   ✅ resetStats()               — clears localStorage for this cartridge
 *   ✅ shareChallenge()           — seeded URL + score share sheet
 *   ✅ renderStatsUI()            — injects stats HTML into stats modal
 *   ✅ onModeSelect()             — drives sub-pill rendering in setup screen
 *   ✅ onSubSelect()              — shows/hides OpenAI API key input
 *
 * FILE STRUCTURE (section map):
 *   SECTION 1  — Imports & PRNG Utilities
 *   SECTION 2  — Manifest (Cartridge Contract)
 *   SECTION 3  — Stats & Sharing
 *   SECTION 4  — startGame() — Data Loading (Party Pack + AI Infinite)
 *   SECTION 5  — nextRound()
 *   SECTION 6  — Round Timer (_startRoundTimer)
 *   SECTION 7  — Guess Evaluation: Solo (evaluateGuess)
 *   SECTION 8  — Guess Evaluation: Multiplayer (evaluateMultiplayerRound)
 *   SECTION 9  — End Game (endGameSequence)
 *   SECTION 10 — Setup Hooks (onModeSelect / onSubSelect)
 *   SECTION 11 — Platform Stubs
 * ==============================================================================
 */


// ==============================================================================
// SECTION 1 — IMPORTS & PRNG UTILITIES
// ==============================================================================

import { db } from './firebase.js';
import { state, sfxTick, sfxCheer, sfxBuzzer, colors } from './state.js';

/**
 * createPRNG(seed)
 * ─────────────────
 * PRIVATE — creates a seeded pseudo-random number generator using a
 * multiply-xorshift algorithm (fast, good distribution, deterministic).
 *
 * WHY a custom PRNG?
 *   Math.random() is not seedable in JavaScript. To ensure that a share
 *   URL with a given seed produces the exact same quote order and wrong-answer
 *   shuffle for both the original player and the challenge recipient, we need
 *   a deterministic random function that takes a seed as input.
 *
 * The returned function behaves like Math.random(): returns a float in [0, 1).
 *
 * @param  {number} seed — Integer seed (typically 0–1,000,000)
 * @returns {Function}   — A seedable random() function
 */
function createPRNG(seed) {
    return function () {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/**
 * deterministicShuffle(array, prng)
 * ───────────────────────────────────
 * PRIVATE — Fisher-Yates shuffle using a seeded PRNG instead of Math.random().
 * This ensures the same shuffle order is reproduced for any given seed,
 * which is required for the challenge-link feature.
 *
 * Mutates and returns the input array (same contract as array.sort()).
 *
 * @param  {Array}    array — The array to shuffle in-place
 * @param  {Function} prng  — A seeded random function from createPRNG()
 * @returns {Array}         — The shuffled array
 */
function deterministicShuffle(array, prng) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(prng() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}


// ==============================================================================
// SECTION 2 — MANIFEST (CARTRIDGE CONTRACT)
// ==============================================================================

/**
 * manifest  {Object}
 * ───────────────────
 * NOTABLE FIELDS:
 *   hasDaily: false     — No daily challenge for Who Said It yet.
 *   clientUI: "multiple-choice" — Phones receive MC options via Firebase
 *                                 currentMC and render 4 buttons automatically.
 *                                 No custom phone UI needed.
 *   modes:              — celeb / movie / text map directly to DB category keys
 *                         in db_quotes.json. Also sent to OpenAI as promptFocus.
 */
export const manifest = {
    id: "who_said_it",
    title: "WHO SAID IT?",
    subtitle: "Pop Culture & Iconic Quotes",
    hasDaily: false,
    rulesHTML: `
        <h2>Who Said It?</h2>
        <p style="color:#ccc; line-height:1.6;">
            Read the quote on the screen and identify who said it as fast as possible.
            <br><br>
            The faster you answer, the more points you earn.
            Get 3 right in a row to ignite a streak bonus!
        </p>
        <button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top:10px; width:100%;">
            Got it!
        </button>
    `,
    modes: [
        { id: "celeb", title: "🎤 Celebs & Creators", desc: "Celebrities, viral Tweets, and TikTok sounds." },
        { id: "movie", title: "🎬 Screen & Stage",    desc: "Iconic lines from Movies, Netflix, and TV shows." },
        { id: "text",  title: "📖 Lyrics & Lore",     desc: "Guess the Song Lyric or Book Quote." }
    ],
    levels: [
        { id: "easy", title: "🟢 Casual",   desc: "20s. Standard pacing." },
        { id: "hard", title: "🔴 Speedrun", desc: "10s. Pure reflex." }
    ],
    clientUI: "multiple-choice"
};


// ==============================================================================
// SECTION 3 — STATS & SHARING
// ==============================================================================

/**
 * resetStats()
 * ─────────────
 * EXPORTED — clears Who Said It stats after user confirmation.
 */
export function resetStats() {
    if (confirm("Are you sure you want to reset your Who Said It stats?")) {
        state.userStats.who_said_it = { gamesPlayed: 0, highScore: 0 };
        localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
        alert("Who Said It stats reset.");
        if (window.hideModal) window.hideModal('stats-modal');
    }
}

/**
 * renderStatsUI()
 * ────────────────
 * EXPORTED — injects stats HTML into #stats-content for the stats modal.
 * Reads from state.userStats.who_said_it (seeded by the auto-hydrator in app.js).
 */
export function renderStatsUI() {
    const s = state.userStats.who_said_it || {};
    document.getElementById('stats-content').innerHTML = `
        <h2 style="color:var(--brand); margin-top:0; text-align:center; border-bottom:1px solid #333; padding-bottom:15px;">Who Said It Locker</h2>
        <div class="stat-grid">
            <div class="stat-box">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Games Played</div>
                <div class="stat-val">${s.gamesPlayed || 0}</div>
            </div>
            <div class="stat-box">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">High Score</div>
                <div class="stat-val" style="color:var(--p1)">${s.highScore || 0}</div>
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;">
            <button class="btn btn-main" onclick="hideModal('stats-modal')" style="flex:1; margin-right:10px;">Close</button>
            <button class="btn btn-reset" onclick="if(window.activeCartridge&&window.activeCartridge.resetStats){window.activeCartridge.resetStats();hideModal('stats-modal');}" style="margin-top:0; padding:16px;">Reset</button>
        </div>`;
}

/**
 * shareChallenge()
 * ─────────────────
 * EXPORTED — shares the player's score with a seeded replay URL.
 *
 * CHALLENGE URL FORMAT:
 *   ?game=who_said_it&mode=celeb&seed=123456&beat=750
 *
 *   · seed   — Encodes the exact shuffle order so the recipient gets the same quotes.
 *   · mode   — Ensures the recipient plays the same category.
 *   · beat   — Displays a "Target to Beat: X pts" banner on load.
 *
 * FALLBACK:
 *   Web Share API on mobile; prompt() on desktop if clipboard is also unavailable.
 */
export function shareChallenge() {
    const score = Math.max(...state.rawScores);
    const url   = `${window.location.origin}${window.location.pathname}?game=who_said_it&mode=${state.gameState.mode}&seed=${state.gameSeed}&beat=${score}`;
    const text  = `🗣️ I just scored ${score} points in Who Said It! Think you can beat me?`;

    if (navigator.share) {
        navigator.share({ title: "Beat My Quote Score!", text, url }).catch(console.error);
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(`${text}\n${url}`)
            .then(() => alert("Challenge Link Copied! Paste it to a friend."))
            .catch(() => prompt("Copy this link manually:", url));
    } else {
        prompt("Copy this link to challenge a friend:", url);
    }
}


// ==============================================================================
// SECTION 4 — startGame() — DATA LOADING (Party Pack + AI Infinite)
// ==============================================================================

/**
 * startGame()
 * ────────────
 * EXPORTED — platform entry point. Handles two distinct data paths:
 *
 * PATH A — Infinite AI:
 *   Sends a mode-focused system prompt to GPT-4o-mini requesting JSON quotes.
 *   The promptFocus string varies by mode so the AI stays on-theme.
 *   On success, state.songs is set directly from AI output and nextRound() fires.
 *   On failure, reloads the page (no partial-state recovery in AI mode).
 *
 * PATH B — Party Pack:
 *   Loads db_quotes.json, filters by mode key, shuffles deterministically
 *   using the seeded PRNG, and slices to state.maxRounds.
 *
 *   SEEDING LOGIC:
 *     If the URL contains ?seed=X (challenge link), uses that seed so the
 *     challenger sees the same quote order. Otherwise generates a new random seed.
 *     If ?mode=X is in the URL, overrides the setup-screen mode selection.
 *
 *   GLOBAL POOL:
 *     All author names across ALL mode categories are collected into state.globalPool.
 *     This pool is used as the wrong-answer source in nextRound() so the distractors
 *     are drawn from the full author universe, not just the current mode's authors.
 *
 *   CHALLENGE BANNER:
 *     If ?beat=X is in the URL, a "Target to Beat: X pts" banner is injected
 *     above the feedback area so the challenger knows their goal.
 *
 * TIME LIMIT:
 *   Easy = 20s | Hard = 10s
 *
 * @async
 */
export async function startGame() {
    // ── Garbage collection: wipe state from other cartridges ──
    state.curIdx       = 0;
    state.songs        = [];
    state.globalPool   = [];
    state.matchHistory = [];

    state.numPlayers  = state.isMultiplayer ? state.numPlayers : 1;
    state.timeLimit   = state.gameState.level === 'hard' ? 10 : 20;
    state.maxRounds   = state.gameState.rounds;
    state.rawScores   = new Array(state.numPlayers).fill(0);
    state.streaks     = new Array(state.numPlayers).fill(0);

    // ── Double-round generation (one per 5-round block) ──
    state.doubleRounds = [];
    for (let i = 0; i < state.maxRounds; i += 5) {
        const min = i === 0 ? 1 : i;
        const max = Math.min(i + 4, state.maxRounds - 1);
        if (min <= max) state.doubleRounds.push(Math.floor(Math.random() * (max - min + 1)) + min);
    }

    const customInput = document.getElementById('custom-input');
    const apiKey      = customInput ? customInput.value.trim() : '';

    // ── Transition UI to play screen ──
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');
    document.querySelectorAll('.header-btn').forEach(btn => btn.classList.add('hidden'));
    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('btn-container').classList.add('hidden');
    document.getElementById('visualizer').classList.add('hidden');
    document.getElementById('reveal-art').style.display = 'none';
    document.getElementById('mc-fields').classList.add('hidden');

    // ==========================================
    // PATH A: INFINITE AI MODE
    // ==========================================
    if (state.gameState.sub === 'ai_infinite') {
        if (!apiKey || !apiKey.startsWith('sk-')) {
            alert("Please paste a valid OpenAI API Key in the box!");
            location.reload(); return;
        }
        localStorage.setItem('consensus_openai_key', apiKey);

        document.getElementById('feedback').innerHTML = `
            <div style="color:var(--primary); font-size:1.5rem; margin-top:40px;">Generating AI Quotes...</div>`;

        // promptFocus maps the mode ID to a thematic description for the AI
        const promptFocusMap = {
            movie: "famous movie and TV show lines",
            celeb: "viral pop-culture moments, reality TV quotes, and famous celebrity tweets",
            text:  "well-known song lyrics and classic literature lines"
        };
        const promptFocus = promptFocusMap[state.gameState.mode] || "pop culture quotes";

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ role: "system", content:
                        `Generate exactly ${state.maxRounds} quotes focusing strictly on ${promptFocus}. ` +
                        `Format as a JSON object with a "quotes" array. ` +
                        `Each object must have "q" (the quote string), "a" (the real author/character string), ` +
                        `and "wrong" (an array of 3 believable wrong author/character strings).`
                    }],
                    response_format: { type: "json_object" },
                    temperature: 0.8
                })
            });
            const data  = await response.json();
            state.songs = JSON.parse(data.choices[0].message.content).quotes;
            state.globalPool = []; // AI mode has no global pool; wrong[] is per-entry
            nextRound();
            return;
        } catch (e) {
            console.error(e);
            alert("AI Generation failed. Check API Key.");
            location.reload(); return;
        }
    }

    // ==========================================
    // PATH B: PARTY PACK (LOCAL DB)
    // ==========================================

    // ── URL parameter handling (challenge link support) ──
    const urlParams  = new URLSearchParams(window.location.search);
    const targetScore = urlParams.get('beat');
    const urlSeed    = urlParams.get('seed');
    const urlMode    = urlParams.get('mode');

    // Override mode from URL if coming from a challenge link
    if (urlMode) state.gameState.mode = urlMode;

    // Seed: use URL seed for challenges, otherwise generate a fresh one
    state.gameSeed = urlSeed ? parseInt(urlSeed) : Math.floor(Math.random() * 1000000);
    state.prng     = createPRNG(state.gameSeed);

    // ── Challenge banner: shows the score the player needs to beat ──
    if (targetScore) {
        document.getElementById('feedback').insertAdjacentHTML('afterend',
            `<div id="challenge-banner" style="background:var(--primary); color:white; padding:8px;
                border-radius:8px; margin-top:10px; text-align:center; font-weight:bold; font-size:1.2rem;">
                🎯 Target to Beat: ${targetScore} Pts
            </div>`);
    }

    document.getElementById('feedback').innerHTML = `
        <div style="color:var(--primary); font-size:1.5rem; margin-top:40px;">Loading Database...</div>`;

    try {
        const res    = await fetch('db_quotes.json');
        const dbData = await res.json();
        const mode   = state.gameState.mode;
        const pool   = dbData[mode] || [];

        if (pool.length < state.maxRounds) {
            alert(`Not enough quotes in ${mode} category. Lower rounds or add to DB!`);
            location.reload(); return;
        }

        // Deterministic shuffle + slice to maxRounds
        state.songs = deterministicShuffle([...pool], state.prng).slice(0, state.maxRounds);

        // Build global author pool (all categories) for wrong-answer generation
        state.globalPool = [];
        Object.keys(dbData).forEach(k => {
            dbData[k].forEach(item => {
                if (!state.globalPool.includes(item.a)) state.globalPool.push(item.a);
            });
        });

        nextRound();
    } catch (e) {
        console.error(e);
        alert("Failed to load db_quotes.json!");
        location.reload();
    }
}


// ==============================================================================
// SECTION 5 — nextRound()
// ==============================================================================

/**
 * nextRound()
 * ────────────
 * PRIVATE — advances to the next quote or ends the game.
 *
 * OPTION BUILDING (two paths):
 *   AI mode  (state.globalPool.length === 0):
 *     Uses the entry's own currentData.wrong[] array for the 3 distractors.
 *     Shuffled with Math.random() (non-seeded — AI games don't need replays).
 *
 *   Party Pack (state.globalPool has all authors):
 *     Filters the global author pool to exclude the correct author, then
 *     deterministicShuffle() with state.prng ensures the challenge
 *     recipient sees the same wrong answers in the same order.
 *
 * SPEECH SYNTHESIS:
 *   Reads the quote aloud using the browser's built-in TTS engine (solo only).
 *   window.speechSynthesis.cancel() clears any running speech from the prior round.
 *   Rate 0.95 is slightly slower than default for dramatic effect.
 *
 * MULTIPLAYER HOST:
 *   Writes currentMC and currentPrompt to Firebase so phones receive the question.
 *   Clears each player's guess and status so old submissions don't carry over.
 *   Shows "LOCKED IN: 0 / N" counter in the host feedback area.
 *
 * @private
 */
function nextRound() {
    if (state.curIdx >= state.maxRounds) { endGameSequence(); return; }

    state.isProcessing = false;
    const currentData  = state.songs[state.curIdx];
    const tag          = document.getElementById('active-player');

    // ── Build MC options ──
    let options = [{ str: currentData.a, isCorrect: true }];

    if (state.globalPool.length === 0 && currentData.wrong) {
        // AI Infinite mode: use the entry's own wrong[] field
        currentData.wrong.forEach(w => options.push({ str: w, isCorrect: false }));
        options = options.sort(() => 0.5 - Math.random());
    } else {
        // Party Pack: draw wrong answers from the global author pool
        const filteredPool  = state.globalPool.filter(a => a !== currentData.a);
        const shuffledWrong = deterministicShuffle([...filteredPool], state.prng);
        for (let i = 0; i < 3; i++) {
            if (shuffledWrong[i]) options.push({ str: shuffledWrong[i], isCorrect: false });
        }
        options = deterministicShuffle(options, state.prng);
    }

    // ── Multiplayer host: broadcast round data to phones ──
    if (state.isMultiplayer && state.isHost) {
        document.getElementById('score-board').innerHTML = '';
        tag.innerText         = `QUOTE ${state.curIdx + 1}/${state.maxRounds}`;
        tag.style.color       = "var(--primary)";
        tag.style.borderColor = "var(--primary)";

        db.ref(`rooms/${state.roomCode}/currentRound`).set(state.curIdx + 1);
        db.ref(`rooms/${state.roomCode}/currentMC`).set(options);
        db.ref(`rooms/${state.roomCode}/currentPrompt`).set(`"${currentData.q}"`);

        // Reset player guess states for this round
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            if (snap.exists()) {
                const updates = {};
                snap.forEach(p => {
                    updates[`${p.key}/status`] = 'guessing';
                    updates[`${p.key}/guess`]  = null;
                });
                db.ref(`rooms/${state.roomCode}/players`).update(updates);
            }
        });

        document.getElementById('feedback').innerHTML = `
            <div class="prompt-text" style="font-style:italic;">"${currentData.q}"</div>
            <div id="host-lock-status" style="color:var(--primary); font-size:1.3rem; font-weight:bold; margin-top:20px;">
                LOCKED IN: 0 / ${state.numPlayers}
            </div>`;

    } else {
        // ── Solo: render quote + MC buttons locally ──
        tag.innerText         = `ROUND ${state.curIdx + 1}/${state.maxRounds}`;
        tag.style.color       = "var(--primary)";
        tag.style.borderColor = "var(--primary)";

        document.getElementById('feedback').innerHTML = `
            <div class="prompt-text" style="font-style:italic; font-size:2rem;">"${currentData.q}"</div>`;

        // Text-to-speech: read the quote aloud
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const msg  = new SpeechSynthesisUtterance(currentData.q);
            msg.rate   = 0.95;
            window.speechSynthesis.speak(msg);
        }

        // Inject MC buttons
        const mcContainer = document.getElementById('mc-fields');
        mcContainer.innerHTML = '';
        mcContainer.classList.remove('hidden');
        options.forEach(opt => {
            const btn     = document.createElement('button');
            btn.className = 'mc-btn';
            btn.innerText = opt.str;
            btn.onclick   = (e) => evaluateGuess(opt.isCorrect, e.target);
            mcContainer.appendChild(btn);
        });
    }

    _startRoundTimer();
}


// ==============================================================================
// SECTION 6 — ROUND TIMER (_startRoundTimer)
// ==============================================================================

/**
 * _startRoundTimer()
 * ───────────────────
 * PRIVATE — starts the countdown timer for the current round.
 *
 * Uses the same orange progress-bar pattern as Consensus and Math.
 * Plays sfxTick in the final 3 seconds.
 *
 * ON EXPIRY:
 *   · Solo:        calls evaluateGuess(false, null) — time's up = wrong.
 *   · Multiplayer: host reads Firebase players and calls evaluateMultiplayerRound().
 *
 * Timer ID stored in state.timerId so evaluateGuess() can cancel it on early answer.
 */
function _startRoundTimer() {
    state.timeLeft = state.timeLimit;

    const timerElement = document.getElementById('timer');
    timerElement.innerHTML = `<div class="timer-bar-container"><div id="timer-bar-fill" class="timer-bar-fill" style="background: #f39c12;"></div></div>`;
    const timerFill = document.getElementById('timer-bar-fill');

    state.timerId = setInterval(() => {
        state.timeLeft--;
        if (timerFill) timerFill.style.width = `${(state.timeLeft / state.timeLimit) * 100}%`;

        if (state.timeLeft <= 3 && state.timeLeft > 0) {
            if (timerFill) timerFill.style.backgroundColor = 'var(--fail)';
            sfxTick.currentTime = 0; sfxTick.play().catch(() => {});
        }

        if (state.timeLeft <= 0) {
            clearInterval(state.timerId);
            if (state.isMultiplayer && state.isHost) {
                db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
                    evaluateMultiplayerRound(snap.val() || {});
                });
            } else {
                evaluateGuess(false, null);
            }
        }
    }, 1000);
}


// ==============================================================================
// SECTION 7 — GUESS EVALUATION: SOLO (evaluateGuess)
// ==============================================================================

/**
 * evaluateGuess(isCorrect, clickedBtn)
 * ──────────────────────────────────────
 * EXPORTED — solo scoring. Called when the player taps an MC button or when
 * the timer expires.
 *
 * FLOW:
 *   1. Guard against double-evaluation (state.isProcessing).
 *   2. Stop the timer. Cancel speech synthesis.
 *   3. Disable all MC buttons and colour the clicked button green/red.
 *   4. Always highlight the correct button green so the player learns the answer.
 *   5. Calculate points: time remaining × 10.
 *   6. Apply streak bonus and double-round multiplier.
 *   7. Inject feedback: "✅ CORRECT! +pts" or "❌ INCORRECT — It was [author]".
 *   8. Update score pill and advance to next round after 2.5s.
 *
 * SCORING FORMULA:
 *   basePoints  = state.timeLeft × 10      (0–200 for Easy, 0–100 for Hard)
 *   streakBonus = +50 every 3rd correct
 *   doubleRound = total × 2
 *
 * @param {boolean}          isCorrect  — Whether the tapped button was correct
 * @param {HTMLElement|null} clickedBtn — The MC button element tapped (for colouring)
 */
export function evaluateGuess(isCorrect, clickedBtn = null) {
    if (state.isProcessing) return;
    state.isProcessing = true;

    clearInterval(state.timerId);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    // ── Disable all buttons and colour clicked one ──
    document.querySelectorAll('.mc-btn').forEach(b => { b.disabled = true; });
    if (clickedBtn) clickedBtn.classList.add(isCorrect ? 'correct' : 'wrong');

    // ── Always reveal the correct button so players learn ──
    const realAuthor = state.songs[state.curIdx].a;
    document.querySelectorAll('.mc-btn').forEach(b => {
        if (b.innerText === realAuthor) b.classList.add('correct');
    });

    let roundPts = 0;

    if (isCorrect) {
        roundPts = state.timeLeft * 10;

        state.streaks[0]++;
        if (state.streaks[0] > 0 && state.streaks[0] % 3 === 0) {
            roundPts += 50;
            document.getElementById('feedback').innerHTML += `
                <div style="color:var(--primary); font-size:0.85rem; margin-top:5px; font-weight:bold;">🔥 Streak Bonus! +50</div>`;
        }

        if (state.doubleRounds?.includes(state.curIdx)) {
            roundPts *= 2;
            document.getElementById('feedback').innerHTML += `
                <div style="color:#f39c12; font-size:0.85rem; margin-top:2px; font-weight:bold;">⭐ 2X BONUS APPLIED!</div>`;
        }

        state.rawScores[0] += roundPts;
        sfxCheer.currentTime = 0; sfxCheer.play().catch(() => {});

        document.getElementById('feedback').innerHTML = `
            <div style="color:var(--success); font-size:1.5rem; font-weight:bold; margin-bottom:5px;">✅ CORRECT! +${roundPts}</div>`;

    } else {
        state.streaks[0] = 0;
        sfxBuzzer.currentTime = 0; sfxBuzzer.play().catch(() => {});

        document.getElementById('feedback').innerHTML = `
            <div style="color:var(--fail); font-size:1.5rem; font-weight:bold; margin-bottom:5px;">❌ INCORRECT</div>
            <div style="color:var(--text-muted);">It was ${realAuthor}</div>`;
    }

    // ── Update score pill ──
    document.getElementById('score-board').innerHTML = `
        <div class="score-pill" style="border-color:${colors[0]}">
            <div class="p-name">SCORE</div>
            <div class="p-pts" style="color:var(--dark-text);">${state.rawScores[0]}</div>
            <div class="p-streak">🔥 ${state.streaks[0]}</div>
        </div>`;

    state.curIdx++;
    setTimeout(nextRound, 2500);
}


// ==============================================================================
// SECTION 8 — GUESS EVALUATION: MULTIPLAYER (evaluateMultiplayerRound)
// ==============================================================================

/**
 * evaluateMultiplayerRound(players)
 * ───────────────────────────────────
 * EXPORTED — scores ALL connected players simultaneously from Firebase guesses.
 *
 * FLOW:
 *   1. Guard against double-evaluation.
 *   2. Stop the timer.
 *   3. For each player: check p.guess.isMC && p.guess.correct.
 *   4. Score = p.guess.time × 10 (same formula as solo, time-based).
 *   5. Apply streak bonus (+50 every 3rd).
 *   6. Apply double-round multiplier.
 *   7. Build per-player feedback HTML.
 *   8. Reveal the correct answer author below the feedback.
 *   9. Call finalizeMultiplayerRound() to write updated scores to Firebase.
 *  10. Advance to next round after 4s.
 *
 * NOTE on double-round in multiplayer:
 *   The double-round array was generated on startGame(). The host checks
 *   state.doubleRounds.includes(state.curIdx) at eval time — not at
 *   Firebase write time — so the multiplier is applied correctly even
 *   if some players submitted late.
 *
 * @param {Object} players — Firebase snapshot value: { playerId: { name, guess } }
 */
export function evaluateMultiplayerRound(players) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearInterval(state.timerId);

    const realAuthor = state.songs[state.curIdx].a;
    const playerIds  = Object.keys(players || {});
    const results    = [];

    let fbHTML = `<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:15px; font-weight:bold;">`;

    playerIds.forEach((pid, index) => {
        const p       = players[pid];
        const correct = !!(p.guess?.isMC && p.guess?.correct);
        let roundPts  = 0;

        if (correct) {
            state.streaks[index] = (state.streaks[index] || 0) + 1;
            roundPts = (p.guess.time || 0) * 10;

            if (state.streaks[index] > 0 && state.streaks[index] % 3 === 0) roundPts += 50;
            if (state.doubleRounds?.includes(state.curIdx)) roundPts *= 2;

            fbHTML += `<div style="color:var(--success); font-size:1.1rem; font-weight:bold;">✅ ${p.nickname || p.name || 'Player'}: +${roundPts}</div>`;
        } else {
            state.streaks[index] = 0;
            fbHTML += `<div style="color:var(--fail); font-size:1.1rem; font-weight:bold;">❌ ${p.nickname || p.name || 'Player'}: 0</div>`;
        }

        results.push({ id: pid, newScore: (p.score || 0) + roundPts });
    });

    fbHTML += `</div>`;
    fbHTML += `<div style="font-size:1.2rem; color:var(--text-muted);">Answer: <strong style="color:var(--primary);">${realAuthor}</strong></div>`;
    document.getElementById('feedback').innerHTML = fbHTML;

    state.curIdx++;
    window.finalizeMultiplayerRound(results);
    setTimeout(nextRound, 4000);
}


// ==============================================================================
// SECTION 9 — END GAME (endGameSequence)
// ==============================================================================

/**
 * endGameSequence()
 * ──────────────────
 * PRIVATE — transitions play-screen → final-screen.
 *
 * NORMALIZATION:
 *   Raw scores are normalized to 0–1000 using:
 *   maxRawPossible = maxRounds × 250  (rough ceiling for a perfect run)
 *   This gives a consistent cross-session benchmark.
 *
 * MULTIPLAYER FINALE:
 *   Reads final Firebase scores (source of truth), normalizes, sorts, builds
 *   podium, writes to /rooms/{code}/finalLeaderboard.
 *
 * SOLO FINALE:
 *   Renders a gradient score card with hype text scaled to performance.
 *   Hides the playlist-box (no audio content to link).
 *   Updates gamesPlayed and highScore in localStorage.
 *
 * CHALLENGE BANNER:
 *   The #challenge-banner element (injected in startGame if ?beat= is in the URL)
 *   persists to the finale screen so players see if they beat the target.
 */
function endGameSequence() {
    document.getElementById('play-screen').classList.add('hidden');
    document.getElementById('final-screen').classList.remove('hidden');
    document.getElementById('final-subtitle').innerText = "Scores Normalized to 1000";

    const playlistBox = document.querySelector('.playlist-box');
    if (playlistBox) playlistBox.style.display = 'none';

    const maxRawPossible   = state.maxRounds * 250;
    const normalizedScores = state.rawScores.map(s => Math.min(1000, Math.round((s / maxRawPossible) * 1000)));
    const maxScore         = Math.max(...normalizedScores);

    // ── Multiplayer finale ──
    if (state.isMultiplayer && state.isHost) {
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            const players = snap.val() || {};
            const pIds    = Object.keys(players);
            let finalResults = pIds.map(pid => {
                const rawFirebaseScore = players[pid].score || 0;
                const normScore = Math.min(1000, Math.round((rawFirebaseScore / maxRawPossible) * 1000));
                db.ref(`rooms/${state.roomCode}/players/${pid}`).update({ finalScore: normScore });
                return { name: players[pid].name, score: normScore, id: pid };
            });
            finalResults.sort((a, b) => b.score - a.score);
            db.ref(`rooms/${state.roomCode}/finalLeaderboard`).set(finalResults);
            db.ref(`rooms/${state.roomCode}/state`).set('finished');

            let podiumHTML = `<div style="margin-top:15px; text-align:left; background:var(--surface); padding:15px; border-radius:12px; border:2px solid var(--border-light);">
                <h3 style="margin-top:0; color:var(--primary); text-align:center; text-transform:uppercase; margin-bottom:15px;">Final Standings</h3>`;
            finalResults.forEach((p, idx) => {
                const medal = ['🥇','🥈','🥉'][idx] || '👏';
                const color = ['var(--p1)','var(--p2)','var(--text-muted)'][idx] || 'var(--text-muted)';
                podiumHTML += `<div style="display:flex; justify-content:space-between; padding:12px 5px;
                    border-bottom:1px solid var(--border-light); font-size:1.3rem; font-weight:bold; color:${color};">
                    <span>${medal} ${p.name}</span>
                    <span style="font-family:'Courier New', monospace; color:var(--dark-text);">${p.score}</span>
                </div>`;
            });
            podiumHTML += `</div>`;
            document.getElementById('winner-text').innerHTML = podiumHTML;
            document.getElementById('final-grid').innerHTML  = '';
        });
        return;
    }

    // ── Solo finale ──
    const hypeText = maxScore > 800
        ? "Pop Culture Icon! 👑"
        : (maxScore > 500 ? "Great Memory! 🧠" : "Better Luck Next Time! 🎬");

    document.getElementById('winner-text').innerHTML = `
        <div style="background:linear-gradient(135deg, var(--p2), var(--primary)); padding:50px 20px;
             border-radius:24px; color:white; box-shadow:0 12px 24px rgba(110,69,226,0.2);
             margin:30px 0; text-align:center;">
            <div style="font-size:1.1rem; font-weight:600; text-transform:uppercase; letter-spacing:2px; opacity:0.9; margin-bottom:10px;">Final Score</div>
            <div style="font-size:5.5rem; font-weight:900; line-height:1; text-shadow:2px 4px 10px rgba(0,0,0,0.2);">${maxScore}</div>
            <div style="font-size:1.2rem; font-weight:600; margin-top:15px; opacity:0.9;">${hypeText}</div>
        </div>`;
    document.getElementById('winner-text').style.color = '';
    document.getElementById('final-grid').innerHTML    = '';

    // ── Stat updates ──
    state.userStats.who_said_it = state.userStats.who_said_it || { gamesPlayed: 0, highScore: 0 };
    state.userStats.who_said_it.gamesPlayed++;
    state.userStats.platformGamesPlayed = (state.userStats.platformGamesPlayed || 0) + 1;
    if (maxScore > (state.userStats.who_said_it.highScore || 0)) {
        state.userStats.who_said_it.highScore = maxScore;
    }
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
}


// ==============================================================================
// SECTION 10 — SETUP HOOKS (onModeSelect / onSubSelect)
// ==============================================================================

/**
 * onModeSelect(mode)
 * ───────────────────
 * EXPORTED — called by ui.js when the player taps a mode card in the setup screen.
 * For Who Said It, every mode offers the same two sub-options (Party Pack / AI),
 * so this function always renders the same sub-pill pair regardless of mode.
 *
 * Default sub-selection is set to 'party_pack'.
 * The "Infinite AI" pill toggles the API key input via onSubSelect().
 *
 * @param {string} mode — The selected mode ID (celeb / movie / text)
 */
export function onModeSelect(mode) {
    state.gameState.sub = 'party_pack';
    document.getElementById('sub-label').innerText = "Select Data Source";

    const container = document.getElementById('sub-pills');
    if (container) {
        container.innerHTML = '';
        const pillParty = document.createElement('div');
        pillParty.className = 'pill pill-wide active';
        pillParty.innerText = 'Party Pack';
        pillParty.onclick   = () => window.setSub('party_pack', pillParty);

        const pillAI = document.createElement('div');
        pillAI.className = 'pill pill-wide';
        pillAI.innerText = 'Infinite AI';
        pillAI.onclick   = () => window.setSub('ai_infinite', pillAI);

        container.appendChild(pillParty);
        container.appendChild(pillAI);
    }

    document.getElementById('custom-input').classList.add('hidden');
    document.getElementById('sub-selection-area').classList.remove('hidden');
}

/**
 * onSubSelect(val)
 * ─────────────────
 * EXPORTED — called by ui.js when the player taps a sub-pill (Party Pack or AI).
 * Shows or hides the API key input field based on the selection.
 *
 * KEY PERSISTENCE:
 *   If the player previously entered an API key, it's pre-filled from
 *   localStorage so they don't have to paste it every session.
 *
 * INPUT TYPE:
 *   Set to "password" so the key doesn't appear in clear text on-screen.
 *
 * @param {string} val — The selected sub ID ('party_pack' | 'ai_infinite')
 */
export function onSubSelect(val) {
    const customInput = document.getElementById('custom-input');
    if (val === 'ai_infinite') {
        customInput.classList.remove('hidden');
        customInput.placeholder = "Paste your OpenAI API Key (sk-...)";
        customInput.type        = "password";
        const savedKey = localStorage.getItem('consensus_openai_key');
        if (savedKey) customInput.value = savedKey;
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
    }
}


// ==============================================================================
// SECTION 11 — PLATFORM STUBS
// ==============================================================================

/**
 * The following functions satisfy the Cartridge Contract but are not used
 * by Who Said It.
 *
 * · handleStop()          — No audio stream to stop.
 * · forceLifeline()       — No lifeline mechanic.
 * · startDailyChallenge() — Daily mode not yet implemented.
 */
export function handleStop()          { return; }
export function forceLifeline()       { return; }
export function startDailyChallenge() { alert("Daily mode coming soon!"); }
