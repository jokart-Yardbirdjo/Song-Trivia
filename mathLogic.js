// mathLogic.js
import { db } from './firebase.js';
//import { state, sfxTick, sfxCheer, sfxBuzzer, colors, bgm } from './state.js';
import { state, sfxTick, sfxCheer, sfxBuzzer, colors } from './state.js';

export const manifest = {
    id: "fast_math",
    title: "FAST MATH",
    subtitle: "Pattern recognition under pressure",
    hasDaily: false,
    rulesHTML: `
        <h2>How to Play</h2>
        <div style="text-align:left; color:var(--dark-text); line-height:1.7; font-size:0.95rem;">
            <p>A <strong>target number</strong> appears. Four equations are shown — only one equals the target. Spot it fast.</p>
            <p>You don't need to calculate everything. Use digit patterns, parity, and elimination to find the answer instantly.</p>
            <p><strong style="color:var(--primary);">🎲 Mixed Mode:</strong> All four operators appear together. Scan across addition, subtraction, multiplication, and division simultaneously.</p>
            <p><strong style="color:var(--primary);">💀 Sudden Death:</strong> No timer. Unlimited rounds. One wrong answer ends everything.</p>
            <p><strong style="color:var(--primary);">🔥 Streak Bonus:</strong> 3 correct in a row earns +50 bonus points.</p>
        </div>
        <button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top:15px; width:100%;">Let's Go!</button>
    `,
    modes: [
        // Moved Mixed to the top so it defaults!
        { id: "mixed",          title: "🎲 Mixed",          desc: "All operators, random order. Maximum chaos." },
        { id: "addition",       title: "➕ Addition",       desc: "Which equation sums to the target?" },
        { id: "subtraction",    title: "➖ Subtraction",    desc: "Spot the right difference." },
        { id: "multiplication", title: "✖️ Multiplication", desc: "Find the equation that hits the product." },
        { id: "division",       title: "➗ Division",       desc: "Which pair divides cleanly to the target?" }
    ],
    levels: [
        // Moved Sudden Death to the top so it defaults!
        { id: "sudden_death", title: "💀 Sudden Death", desc: "10s per round. One wrong answer ends it all." },
        { id: "easy",         title: "🟢 Easy",         desc: "20s per round. One wrong option fades at 10s." },
       // { id: "medium",       title: "🟡 Standard",     desc: "12s per round. No help." },
        { id: "hard",         title: "🔴 Lightning",    desc: "6s per round. Pure reflexes." }
    ],
    clientUI: "multiple-choice"
};

// ─── Stats & Sharing ──────────────────────────────────────────────────────────

export function resetStats() {
    if (confirm("Reset your Fast Math stats? This cannot be undone.")) {
        state.userStats.fast_math = { gamesPlayed: 0, highScore: 0, bestStreak: 0, suddenDeathRecord: 0 };
        localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
        alert("Fast Math stats reset.");
    }
}

export function renderStatsUI(fmStats, container) {
    container.innerHTML = `
        <h2 style="color:var(--primary); margin-top:0; text-align:center; border-bottom:2px solid var(--border-light); padding-bottom:15px;">Fast Math Locker</h2>
        <div class="stat-grid">
            <div class="stat-box">
                <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Games Played</div>
                <div class="stat-val">${fmStats.gamesPlayed || 0}</div>
            </div>
            <div class="stat-box">
                <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">High Score</div>
                <div class="stat-val" style="color:var(--p1)">${fmStats.highScore || fmStats.hsText || 0}</div>
            </div>
            <div class="stat-box">
                <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Best Streak</div>
                <div class="stat-val" style="color:var(--p3)">🔥 ${fmStats.bestStreak || 0}</div>
            </div>
            <div class="stat-box">
                <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">💀 SD Record</div>
                <div class="stat-val" style="color:var(--fail)">${fmStats.suddenDeathRecord || 0}</div>
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;">
            <button class="btn btn-main" onclick="hideModal('stats-modal')" style="flex:1; margin-right:10px;">Close</button>
            <button class="btn btn-reset" onclick="if(window.activeCartridge) { window.activeCartridge.resetStats(); hideModal('stats-modal'); }" style="margin-top:0; padding:16px;">Reset</button>
        </div>
    `;
}

export function shareChallenge() {
    const score = state.rawScores[0] || 0;
    const isSD = state.gameState.level === 'sudden_death';
    const modeName = manifest.modes.find(m => m.id === state.gameState.mode)?.title || 'Mixed';
    const text = isSD
        ? `💀 Yardbird Fast Math - Sudden Death\nI survived ${state.sdRoundsAlive || 0} rounds in ${modeName} mode!\nCan you beat me?`
        : `➕ Yardbird Fast Math\nI scored ${score} pts in ${modeName} mode!\nThink you're faster?`;
    const url = `${window.location.origin}${window.location.pathname}`;
    if (navigator.share) {
        navigator.share({ title: "Beat My Math Score!", text, url }).catch(console.error);
    } else {
        navigator.clipboard.writeText(text + "\n" + url);
        alert("Challenge link copied to clipboard!");
    }
}

// Required platform stubs
export function startDailyChallenge() { alert("Daily mode not available for Fast Math yet!"); }
export function handleStop()   { return; }
export function forceLifeline() { return; }

// ─── Problem Generator ────────────────────────────────────────────────────────

// Build a correct equation object for a given operator and target
function makeCorrectEquation(op, target) {
    if (op === 'addition') {
        const a = Math.floor(Math.random() * (target - 2)) + 1;
        return { a, b: target - a, sym: '+' };
    }
    if (op === 'subtraction') {
        const b = Math.floor(Math.random() * Math.max(1, target - 1)) + 1;
        return { a: target + b, b, sym: '−' };
    }
    if (op === 'multiplication') {
        const factors = [];
        for (let i = 2; i <= Math.sqrt(target); i++) {
            if (target % i === 0) factors.push([i, target / i]);
        }
        if (factors.length === 0) return { a: 1, b: target, sym: '×' };
        const pair = factors[Math.floor(Math.random() * factors.length)];
        return { a: pair[0], b: pair[1], sym: '×' };
    }
    if (op === 'division') {
        const b = Math.floor(Math.random() * 10) + 2;
        return { a: target * b, b, sym: '÷' };
    }
}

// Generate deceptive wrong equations for single-operator mode.
// Key insight: wrong answers should share surface features with the correct one —
// same operator, similar numbers — so players can't trivially eliminate them.
function makeWrongEquations(op, target, correctEq, count) {
    const wrongs = [];
    const seen = new Set([`${correctEq.a}${correctEq.b}`]);
    let attempts = 0;

    while (wrongs.length < count && attempts < 200) {
        attempts++;
        let a, b, result;

        if (op === 'addition') {
            // Off by a small amount on one operand — same digit-sum feel
            const delta = (Math.floor(Math.random() * 4) + 1) * (Math.random() > 0.5 ? 1 : -1);
            a = Math.max(1, correctEq.a + delta);
            b = Math.max(1, correctEq.b + (Math.random() > 0.5 ? delta : -delta));
            result = a + b;
        } else if (op === 'subtraction') {
            const delta = (Math.floor(Math.random() * 5) + 1) * (Math.random() > 0.5 ? 1 : -1);
            a = Math.max(correctEq.b + 2, correctEq.a + delta);
            b = Math.max(1, correctEq.b + (Math.random() > 0.5 ? delta : -delta));
            result = a - b;
        } else if (op === 'multiplication') {
            // Tweak one factor by ±1 — creates equations that "almost" work
            const tweakFirst = Math.random() > 0.5;
            const delta = Math.random() > 0.5 ? 1 : -1;
            a = tweakFirst ? Math.max(2, correctEq.a + delta) : correctEq.a;
            b = tweakFirst ? correctEq.b : Math.max(2, correctEq.b + delta);
            result = a * b;
        } else if (op === 'division') {
            // Change divisor so the result is no longer target
            const deltaB = (Math.floor(Math.random() * 3) + 1) * (Math.random() > 0.5 ? 1 : -1);
            b = Math.max(2, correctEq.b + deltaB);
            // Pick an 'a' that clearly doesn't divide cleanly to target
            a = target * b + (Math.floor(Math.random() * (b - 1)) + 1);
            result = a / b;
        }

        const key = `${a}${b}`;
        if (seen.has(key) || result === target || a <= 0 || b <= 0) continue;
        seen.add(key);
        wrongs.push({ a, b, sym: correctEq.sym });
    }

    return wrongs;
}

// Mixed mode: each of the 4 options uses a DIFFERENT operator.
// The correct one is the only equation that actually equals target.
// This forces players to scan across operator types simultaneously.
function generateMixedProblem() {
    const ops = ['addition', 'subtraction', 'multiplication', 'division'];
    // Use a target that works cleanly for all operators
    const target = Math.floor(Math.random() * 20) + 6; // 6–25

    const correctOpIdx = Math.floor(Math.random() * 4);
    const shuffledOps = [...ops].sort(() => 0.5 - Math.random());

    const options = shuffledOps.map((op, idx) => {
        const isCorrect = (idx === 0 && shuffledOps[0] === ops[correctOpIdx]) ||
                          shuffledOps.indexOf(ops[correctOpIdx]) === idx;

        if (op === ops[correctOpIdx] && shuffledOps.indexOf(op) === idx) {
            // This is the correct one
            const eq = makeCorrectEquation(op, target);
            return eq ? { text: `${eq.a} ${eq.sym} ${eq.b}`, isCorrect: true } : null;
        } else {
            // Wrong: use a nearby non-target value for visual plausibility
            let fakeTarget = target + (Math.floor(Math.random() * 5) + 1) * (Math.random() > 0.5 ? 1 : -1);
            if (fakeTarget <= 1) fakeTarget = target + 2;
            let eq = makeCorrectEquation(op, fakeTarget);
            return eq ? { text: `${eq.a} ${eq.sym} ${eq.b}`, isCorrect: false } : null;
        }
    }).filter(Boolean);

    // Safety: ensure exactly one correct answer
    const hasCorrect = options.some(o => o.isCorrect);
    if (!hasCorrect || options.filter(o => o.isCorrect).length > 1) {
        // Rebuild cleanly
        const correctOp = ops[Math.floor(Math.random() * 4)];
        const wrongOps = ops.filter(o => o !== correctOp);
        const correctEq = makeCorrectEquation(correctOp, target);
        const opts = [{ text: `${correctEq.a} ${correctEq.sym} ${correctEq.b}`, isCorrect: true }];
        wrongOps.forEach(op => {
            const ft = target + Math.floor(Math.random() * 4) + 1;
            const eq = makeCorrectEquation(op, ft);
            if (eq) opts.push({ text: `${eq.a} ${eq.sym} ${eq.b}`, isCorrect: false });
        });
        return { target, options: opts.slice(0, 4).sort(() => 0.5 - Math.random()) };
    }

    return { target, options: options.sort(() => 0.5 - Math.random()) };
}

// Single-operator problem with deceptive near-miss distractors
function generateSingleOpProblem(op) {
    let target;
    if (op === 'multiplication') {
        const a = Math.floor(Math.random() * 10) + 2;
        const b = Math.floor(Math.random() * 10) + 2;
        target = a * b;
    } else if (op === 'division') {
        target = Math.floor(Math.random() * 11) + 2;
    } else {
        target = Math.floor(Math.random() * 80) + 20;
    }

    const correctEq = makeCorrectEquation(op, target);
    if (!correctEq) return generateSingleOpProblem(op); // rare edge-case retry

    let wrongEqs = makeWrongEquations(op, target, correctEq, 3);

    // Fallback if deceptive wrongs couldn't be generated
    while (wrongEqs.length < 3) {
        const ft = target + wrongEqs.length * 7 + 3;
        const eq = makeCorrectEquation(op, ft);
        if (eq) wrongEqs.push(eq);
    }

    const correctOption = { text: `${correctEq.a} ${correctEq.sym} ${correctEq.b}`, isCorrect: true };
    const wrongOptions  = wrongEqs.map(eq => ({ text: `${eq.a} ${eq.sym} ${eq.b}`, isCorrect: false }));

    return { target, options: [correctOption, ...wrongOptions].sort(() => 0.5 - Math.random()) };
}

function generateMathProblem() {
    if (state.gameState.mode === 'mixed') return generateMixedProblem();
    return generateSingleOpProblem(state.gameState.mode);
}

// ─── Game Helpers ─────────────────────────────────────────────────────────────

const isSuddenDeath = () => state.gameState.level === 'sudden_death';

// Module-level so evaluateGuess always has the current problem
let _currentProblem = null;

// ─── startGame ────────────────────────────────────────────────────────────────

export function startGame() {
    // Garbage collection — wipe any leftover data from other cartridges
    state.curIdx = 0;
    state.songs = [];
    state.globalPool = [];
    state.matchHistory = [];

    state.isDailyMode = false;
    state.numPlayers  = state.isMultiplayer ? state.numPlayers : 1;

    if      (state.gameState.level === 'easy')   state.timeLimit = 20;
    else if (state.gameState.level === 'medium') state.timeLimit = 12;
    else if (state.gameState.level === 'hard')   state.timeLimit = 6;
    else                                         state.timeLimit = 10; // 10s strict timer for Sudden Death

    state.maxRounds    = state.gameState.rounds; // Respect the lobby round setting
    state.sdRoundsAlive = 0;

    state.doubleRounds = [];
    if (!isSuddenDeath()) {
        for (let i = 0; i < state.maxRounds; i += 5) {
            const min = i === 0 ? 2 : i;
            const max = Math.min(i + 4, state.maxRounds - 1);
            if (min <= max) state.doubleRounds.push(Math.floor(Math.random() * (max - min + 1)) + min);
        }
    }

    state.curIdx    = 0;
    state.rawScores = new Array(state.numPlayers).fill(0);
    state.streaks   = new Array(state.numPlayers).fill(0);

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');
    document.querySelectorAll('.header-btn').forEach(btn => btn.classList.add('hidden'));
    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('btn-container').classList.add('hidden');
    document.getElementById('visualizer').classList.add('hidden');
    document.getElementById('reveal-art').style.display = 'none';

    if (!state.isHost) {
        document.getElementById('score-board').innerHTML = `
            <div class="score-pill" style="border-color:${colors[0]};">
                <div class="p-name" style="color:${colors[0]}">SCORE</div>
                <div class="p-pts" style="color:var(--dark-text)">0</div>
                <div class="p-streak" style="opacity:0">🔥 0</div>
            </div>`;
    }

    nextRound();
}

// ─── nextRound ────────────────────────────────────────────────────────────────

export function nextRound() {
    if (state.curIdx >= state.maxRounds) { endGameSequence(); return; }

    state.isProcessing = false;
    _currentProblem = generateMathProblem();
    state.currentCorrectAnswer = _currentProblem.target;

    const tag      = document.getElementById('active-player');
    const isDouble = !isSuddenDeath() && state.doubleRounds.includes(state.curIdx);

    // ── Active-player tag ──
    if (isSuddenDeath()) {
        tag.innerText     = `💀 SUDDEN DEATH — Round ${state.sdRoundsAlive + 1}`;
        tag.style.color   = 'var(--fail)';
        tag.style.borderColor = 'var(--fail)';
    } else {
        tag.innerText     = `ROUND ${state.curIdx + 1}/${state.maxRounds}${isDouble ? ' — ⭐ 2X BONUS' : ''}`;
        tag.style.color   = isDouble ? '#f39c12' : 'var(--primary)';
        tag.style.borderColor = isDouble ? '#f39c12' : 'var(--primary)';
    }

    // ── Multiplayer host path ──
    if (state.isMultiplayer && state.isHost) {
        document.getElementById('score-board').innerHTML = '';
        document.getElementById('feedback').innerHTML = `
            <div style="font-size:3.5rem; font-weight:900; color:var(--dark-text); margin-bottom:15px; letter-spacing:2px;">
                Target: ${_currentProblem.target}
            </div>
            <div id="host-lock-status" style="color:var(--primary); font-size:1.3rem; font-weight:bold;">
                LOCKED IN: 0 / ${state.numPlayers}
            </div>
        `;
        db.ref(`rooms/${state.roomCode}/currentRound`).set(state.curIdx + 1);
        db.ref(`rooms/${state.roomCode}/currentPrompt`).set(`Target: ${_currentProblem.target}`);
        const fbOptions = _currentProblem.options.map(o => ({ str: o.text, isCorrect: o.isCorrect }));
        db.ref(`rooms/${state.roomCode}/currentMC`).set(fbOptions);
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            if (snap.exists()) {
                let updates = {};
                snap.forEach(p => { updates[`${p.key}/status`] = 'guessing'; updates[`${p.key}/guess`] = null; });
                db.ref(`rooms/${state.roomCode}/players`).update(updates);
            }
        });

    // ── Solo path ──
    } else {
        document.getElementById('feedback').innerHTML = `
            <div style="font-size:3.2rem; font-weight:900; color:var(--dark-text); margin-bottom:15px; letter-spacing:2px;">
                Target: <span style="color:var(--primary)">${_currentProblem.target}</span>
            </div>
            ${isSuddenDeath() ? '<div style="font-size:0.85rem; color:var(--fail); font-weight:800; letter-spacing:1px; text-transform:uppercase; margin-bottom:5px;">☠️ One wrong answer ends the game</div>' : ''}
        `;

        const mcContainer = document.getElementById('mc-fields');
        mcContainer.innerHTML = '';
        mcContainer.classList.remove('hidden');

        _currentProblem.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className   = 'mc-btn';
            btn.innerText   = opt.text;
            // Monospace so numbers and operators align — aids pattern scanning
            btn.style.fontFamily    = "'Courier New', monospace";
            btn.style.fontSize      = '1.15rem';
            btn.style.letterSpacing = '0.5px';
            btn.onclick = (e) => evaluateGuess(opt.isCorrect, e.target);
            mcContainer.appendChild(btn);
        });
    }

    // ── Timer ──
    const timerEl = document.getElementById('timer');
    timerEl.style.color = '';

    state.timeLeft  = state.timeLimit;
    timerEl.innerHTML = `<div class="timer-bar-container"><div id="timer-bar-fill" class="timer-bar-fill"></div></div>`;
    const timerFill = document.getElementById('timer-bar-fill');

    // NEW: Start the music
    // bgm.play().catch(e => console.warn("BGM blocked by browser policy until interaction."));

    state.timerId = setInterval(() => {
        state.timeLeft--;
        const pct = (state.timeLeft / state.timeLimit) * 100;
        if (timerFill) timerFill.style.width = `${pct}%`;

        if (state.isMultiplayer && state.isHost) db.ref(`rooms/${state.roomCode}/timeLeft`).set(state.timeLeft);

        // Lifeline: fade one wrong answer at halfway (Easy only)
        const helpAt = state.gameState.level === 'easy' ? 10 : -1;
        if (state.timeLeft === helpAt) {
            if (state.isMultiplayer && state.isHost) {
                let removed = false;
                const trimmed = _currentProblem.options.reduce((acc, o) => {
                    if (!o.isCorrect && !removed) { removed = true; return acc; }
                    return [...acc, { str: o.text, isCorrect: o.isCorrect }];
                }, []);
                db.ref(`rooms/${state.roomCode}/currentMC`).set(trimmed);
            } else {
                let removed = false;
                document.querySelectorAll('#mc-fields .mc-btn').forEach(btn => {
                    const opt = _currentProblem.options.find(o => o.text === btn.innerText);
                    if (opt && !opt.isCorrect && !removed) {
                        btn.style.opacity = '0.15';
                        btn.style.pointerEvents = 'none';
                        removed = true;
                    }
                });
            }
        }

        if (state.timeLeft <= 3 && state.timeLeft > 0) {
            if (timerFill) timerFill.style.backgroundColor = 'var(--fail)';
            sfxTick.play().catch(() => {});
        }

        if (state.timeLeft <= 0) {
            clearInterval(state.timerId);
            if (state.isMultiplayer && state.isHost) {
                db.ref(`rooms/${state.roomCode}/players`).once('value', snap => evaluateMultiplayerRound(snap.val()));
            } else {
                evaluateGuess(false, null); // timeout counts as wrong
            }
        }
    }, 1000);
}

// ─── evaluateGuess ────────────────────────────────────────────────────────────

export function evaluateGuess(isCorrect, clickedBtn = null) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearInterval(state.timerId);

    // NEW: Stop the music and rewind
    //bgm.pause();
    //bgm.currentTime = 0;

    document.querySelectorAll('.mc-btn').forEach(b => b.disabled = true);

    // Always reveal the correct answer so players can learn the pattern
    document.querySelectorAll('#mc-fields .mc-btn').forEach(btn => {
        const opt = _currentProblem?.options.find(o => o.text === btn.innerText);
        if (opt?.isCorrect) btn.classList.add('correct');
    });
    if (clickedBtn && !isCorrect) clickedBtn.classList.add('wrong');

    if (isCorrect) {
        state.streaks[0]++;
        state.sdRoundsAlive++;

        const isDouble  = !isSuddenDeath() && state.doubleRounds.includes(state.curIdx);
        let roundPts    = state.timeLeft * 10; // 👈 Sudden Death now uses standard speed points
        const streakBonus = (state.streaks[0] > 0 && state.streaks[0] % 3 === 0);
        if (streakBonus) roundPts += 50;
        if (isDouble)    roundPts *= 2;

        state.rawScores[0] += roundPts;
        sfxCheer.currentTime = 0; sfxCheer.play().catch(() => {});

        const streakMsg = streakBonus
            ? `<div style="color:var(--p3); font-size:0.9rem; margin-top:4px; font-weight:bold;">🔥 ${state.streaks[0]} streak! +50 bonus</div>` : '';
        const doubleMsg = isDouble
            ? `<div style="color:#f39c12; font-size:0.9rem; font-weight:bold; margin-top:4px;">⭐ 2X BONUS ROUND!</div>` : '';

        document.getElementById('feedback').innerHTML = `
            <div style="color:var(--success); font-size:1.5rem; font-weight:bold;">✅ CORRECT! +${roundPts}</div>
            ${streakMsg}${doubleMsg}
        `;

    } else {
        state.streaks[0] = 0;
        sfxBuzzer.currentTime = 0; sfxBuzzer.play().catch(() => {});

        // ── Sudden Death game over ──
        if (isSuddenDeath()) {
            document.getElementById('feedback').innerHTML = `
                <div style="color:var(--fail); font-size:2rem; font-weight:900;">💀 ELIMINATED</div>
                <div style="color:var(--text-muted); font-size:1.1rem; margin-top:8px;">
                    You survived <strong>${state.sdRoundsAlive}</strong> round${state.sdRoundsAlive !== 1 ? 's' : ''}
                </div>
            `;
            document.getElementById('score-board').innerHTML = `
                <div class="score-pill" style="border-color:var(--fail);">
                    <div class="p-name" style="color:var(--fail)">SURVIVED</div>
                    <div class="p-pts" style="color:var(--dark-text)">${state.sdRoundsAlive}</div>
                    <div class="p-streak" style="opacity:0">-</div>
                </div>`;
            setTimeout(endGameSequence, 2500);
            return;
        }

        document.getElementById('feedback').innerHTML = `
            <div style="color:var(--fail); font-size:1.5rem; font-weight:bold;">❌ INCORRECT</div>
            <div style="color:var(--text-muted); font-size:0.9rem; margin-top:4px;">Streak reset</div>
        `;
    }

    document.getElementById('score-board').innerHTML = `
        <div class="score-pill" style="border-color:${colors[0]}">
            <div class="p-name">SCORE</div>
            <div class="p-pts" style="color:var(--dark-text);">${state.rawScores[0]}</div>
            <div class="p-streak" style="color:${colors[0]}; opacity:${state.streaks[0] > 0 ? 1 : 0}">🔥 ${state.streaks[0]}</div>
        </div>`;

    state.curIdx++;
    setTimeout(nextRound, 2000);
}

// ─── evaluateMultiplayerRound ─────────────────────────────────────────────────

export async function evaluateMultiplayerRound(players) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    if (state.timerId) clearInterval(state.timerId);

    // NEW: Stop the music and rewind
    //bgm.pause();
    //bgm.currentTime = 0;

    const results = [];
    const isDouble = !isSuddenDeath() && state.doubleRounds.includes(state.curIdx);
    let fbHTML = `<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:15px; font-weight:bold;">`;
    
    let fatalMistake = false;
    let guiltyPlayer = "";

    Object.keys(players).forEach((pid, index) => {
        const p = players[pid];
        let roundPts = 0;
        
        // Determine if they were correct
        const correct = p.guess && p.guess.isMC && p.guess.correct;

        if (correct) {
            state.streaks[index] = (state.streaks[index] || 0) + 1;
            const speedFactor = (p.guess.time || 0) / state.timeLimit;
            roundPts = Math.round(100 + (speedFactor * 100));
            
            if (state.streaks[index] > 0 && state.streaks[index] % 3 === 0) roundPts += 50;
            if (isDouble) roundPts *= 2;
            
            fbHTML += `<div style="color:var(--success); font-size:1.1rem;">✅ ${p.name}: +${roundPts}</div>`;
            state.rawScores[index] = (state.rawScores[index] || 0) + roundPts;
        } else {
            state.streaks[index] = 0;
            fbHTML += `<div style="color:var(--fail); font-size:1.1rem;">❌ ${p.name}: 0</div>`;
            
            // If Sudden Death is active, ANY wrong answer kills the run
            if (isSuddenDeath()) {
                fatalMistake = true;
                guiltyPlayer = p.name;
            }
        }

        results.push({ id: pid, newScore: (p.score || 0) + roundPts });
    });

    fbHTML += `</div>`;
    
    if (fatalMistake) {
        document.getElementById('feedback').innerHTML = fbHTML + `
            <div style="color:var(--fail); font-size:2rem; font-weight:900; margin-top:15px; line-height:1;">💀 FATAL MISTAKE!</div>
            <div style="color:var(--fail); font-size:1.2rem; margin-top:5px;"><strong>${guiltyPlayer}</strong> eliminated the room!</div>
        `;
        
        // Clean up the phones
        window.finalizeMultiplayerRound(results);
        
        // Wait 4 seconds, then strictly end the game. Return prevents nextRound!
        setTimeout(endGameSequence, 4000);
        return; 
    }

    // If we survive, track the round and advance
    state.sdRoundsAlive++;
    document.getElementById('feedback').innerHTML = fbHTML;
    state.curIdx++;
    
    window.finalizeMultiplayerRound(results);
    setTimeout(nextRound, 4000);
}

// ─── endGameSequence ──────────────────────────────────────────────────────────

function getNormalizedScore(rawScore) {
    const maxPossible = state.maxRounds * 250;
    return Math.min(1000, Math.round((rawScore / maxPossible) * 1000));
}

function endGameSequence() {
    document.getElementById('play-screen').classList.add('hidden');
    document.getElementById('final-screen').classList.remove('hidden');
    const playlistBox = document.querySelector('.playlist-box');
    if (playlistBox) playlistBox.style.display = 'none';

    const isSD = isSuddenDeath();
    const normalizedScores = state.rawScores.map(s => getNormalizedScore(s));
    const maxScore = Math.max(...normalizedScores);

    document.getElementById('final-subtitle').innerText = isSD
        ? `Sudden Death — ${state.sdRoundsAlive} round${state.sdRoundsAlive !== 1 ? 's' : ''} survived`
        : 'Scores Normalized to 1000';

    // ── Persist stats ──
    state.userStats.fast_math = state.userStats.fast_math || { gamesPlayed: 0, highScore: 0, bestStreak: 0, suddenDeathRecord: 0 };
    const fm = state.userStats.fast_math;
    if (!isSD && maxScore > (fm.highScore || 0))                fm.highScore = maxScore;
    if ((state.streaks[0] || 0) > (fm.bestStreak || 0))        fm.bestStreak = state.streaks[0];
    if (isSD && state.sdRoundsAlive > (fm.suddenDeathRecord || 0)) fm.suddenDeathRecord = state.sdRoundsAlive;
    fm.gamesPlayed++;
    state.userStats.platformGamesPlayed++;
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));

    // ── Multiplayer ──
    if (state.isMultiplayer && state.isHost) {
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            const players = snap.val();
            let finalResults = [];
            Object.keys(players).forEach(pid => {
                const raw   = players[pid].score || 0;
                const norm  = getNormalizedScore(raw);
                finalResults.push({ name: players[pid].name, score: norm, id: pid });
                db.ref(`rooms/${state.roomCode}/players/${pid}`).update({ finalScore: norm });
            });
            finalResults.sort((a, b) => b.score - a.score);
            db.ref(`rooms/${state.roomCode}/finalLeaderboard`).set(finalResults);

            let podiumHTML = `<div style="text-align:left; background:var(--surface); padding:15px; border-radius:12px; border:2px solid var(--border-light);">
                <h3 style="margin-top:0; color:var(--primary); text-align:center; text-transform:uppercase; margin-bottom:15px;">Final Standings</h3>`;
            finalResults.forEach((p, idx) => {
                const medal = ['🥇','🥈','🥉'][idx] || '👏';
                const color = idx === 0 ? 'var(--p1)' : idx === 1 ? 'var(--p2)' : 'var(--text-muted)';
                podiumHTML += `<div style="display:flex; justify-content:space-between; padding:12px 5px; border-bottom:1px solid var(--border-light); font-size:1.3rem; font-weight:bold; color:${color};">
                    <span>${medal} ${p.name}</span>
                    <span style="font-family:'Courier New',monospace; color:var(--dark-text);">${p.score}</span>
                </div>`;
            });
            document.getElementById('winner-text').innerHTML = podiumHTML + `</div>`;
            document.getElementById('final-grid').innerHTML = '';
            db.ref(`rooms/${state.roomCode}/state`).set('finished');
        });
        return;
    }

    // ── Solo end card ──
    let scoreDisplay, hypeText, gradientStyle;

    if (isSD) {
        scoreDisplay   = maxScore; // 👈 Now it shows the points!
        const beatGauntlet = state.sdRoundsAlive >= state.maxRounds; // 👈 Check survival using sdRoundsAlive
        
        gradientStyle  = beatGauntlet ? 'linear-gradient(135deg, #f39c12, #d35400)' : 'linear-gradient(135deg, #d63031, #6e0000)';
        hypeText = beatGauntlet ? "GAUNTLET CLEARED! 🏆"
                 : state.sdRoundsAlive >= 5 ? "Impressive Run! 🔥"
                 : "Eliminated! 💀";
    } else {
        scoreDisplay  = maxScore;
        gradientStyle = 'linear-gradient(135deg, var(--primary), #8e2de2)';
        hypeText = scoreDisplay > 800 ? "Pattern Master! 🧠"
                 : scoreDisplay > 500 ? "Solid Speed! ⚡"
                 : "Keep Practicing! 📈";
    }

    document.getElementById('winner-text').innerHTML = `
        <div style="background:${gradientStyle}; padding:50px 20px; border-radius:24px; color:white;
             box-shadow:0 12px 24px rgba(0,0,0,0.15); margin:30px 0; text-align:center;">
            <div style="font-size:1.1rem; font-weight:600; text-transform:uppercase; letter-spacing:2px; opacity:0.9; margin-bottom:10px;">
                Final Score </div>
            <div style="font-size:5.5rem; font-weight:900; line-height:1; font-family:'Courier New',monospace; text-shadow:2px 4px 10px rgba(0,0,0,0.2);">
                ${scoreDisplay}
            </div>
            <div style="font-size:1.2rem; font-weight:600; margin-top:15px; opacity:0.9;">${hypeText}</div>
        </div>
    `;
    document.getElementById('winner-text').style.color = '';
    document.getElementById('final-grid').innerHTML = '';
}
