// mathLogic.js
import { state, sfxTick, sfxCheer, sfxBuzzer, colors } from './state.js';

export const manifest = {
    id: "fast_math",
    title: "FAST MATH",
    subtitle: "Quick-fire arithmetic battles",
    modes: [
        { id: "addition", title: "➕ Addition", desc: "Classic 2-digit sums." }
    ],
    levels: [
        { id: "easy", title: "🟢 Easy", desc: "10 seconds to answer." }
    ],
    clientUI: "multiple-choice" // Tells the phone to hide typing boxes
};

// We map the same export names so app.js doesn't break
export function resetStats() { alert("Stats reset not needed for Math Test"); }
export function startDailyChallenge() { alert("Daily mode not enabled for Math Test"); }
export function handleStop() { /* Not used in Math */ }
export function forceLifeline() { /* Not used in Math */ }
export function shareChallenge() { /* Not used in Math */ }

function generateMathProblem() {
    // 1. Generate the target answer (e.g., 45 + 32 = 77)
    const num1 = Math.floor(Math.random() * 90) + 10; // 10 to 99
    const num2 = Math.floor(Math.random() * 90) + 10;
    const target = num1 + num2;

    let options = [];
    options.push({ text: `${num1} + ${num2}`, isCorrect: true });

    // 2. Generate 2 wrong equations that DO NOT equal the target
    while(options.length < 3) {
        let w1 = Math.floor(Math.random() * 90) + 10;
        let w2 = Math.floor(Math.random() * 90) + 10;
        if (w1 + w2 !== target) {
            options.push({ text: `${w1} + ${w2}`, isCorrect: false });
        }
    }

    // 3. Shuffle the buttons so the correct answer isn't always first
    options = options.sort(() => 0.5 - Math.random());
    return { target, options };
}

export function startGame() {
    state.isDailyMode = false;
    state.numPlayers = 1; // Forcing solo mode for the quick test
    state.timeLimit = 10; // 10 seconds to solve!
    state.maxRounds = 5;  // 5 rounds total
    state.curIdx = 0;
    state.rawScores = [0];
    state.streaks = [0];

    // Hide Setup, Show Play Screen
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');

    // Hide the Music UI elements (text boxes, visualizer, stop button)
    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('btn-container').classList.add('hidden');
    document.getElementById('visualizer').classList.add('hidden');
    document.getElementById('reveal-art').style.display = 'none';

    nextRound();
}

function nextRound() {
    if (state.curIdx >= state.maxRounds) {
        endGameSequence();
        return;
    }

    state.isProcessing = false;
    const problem = generateMathProblem();

    // 1. Setup Header
    const tag = document.getElementById('active-player');
    const currentColor = colors[0];
    tag.innerText = `FAST MATH: ROUND ${state.curIdx + 1}/${state.maxRounds}`;
    tag.style.color = currentColor;
    tag.style.borderColor = currentColor;

    // 2. Hijack the giant Timer display to show the Target Answer instead!
    document.getElementById('timer').innerText = `Target: ${problem.target}`;
    document.getElementById('timer').style.color = 'var(--highlight)';

    // 3. Render the 3 Math Equations into the Multiple Choice buttons
    const mcContainer = document.getElementById('mc-fields');
    mcContainer.innerHTML = '';
    mcContainer.classList.remove('hidden');

    problem.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'mc-btn';
        btn.innerText = opt.text;
        // When clicked, it passes true or false to evaluateGuess
        btn.onclick = () => evaluateGuess(opt.isCorrect); 
        mcContainer.appendChild(btn);
    });

    // 4. Put the actual countdown timer in the feedback box
    state.timeLeft = state.timeLimit;
    document.getElementById('feedback').innerHTML = `<div style="font-size:1.5rem; color:#aaa;">Time Left: ${state.timeLeft}s</div>`;

    state.timerId = setInterval(() => {
        state.timeLeft--;
        document.getElementById('feedback').innerHTML = `<div style="font-size:1.5rem; color:#aaa;">Time Left: ${state.timeLeft}s</div>`;
        if (state.timeLeft <= 3) sfxTick.play().catch(()=>{});

        if (state.timeLeft <= 0) {
            clearInterval(state.timerId);
            evaluateGuess(false); // Out of time!
        }
    }, 1000);
}

export function evaluateGuess(isCorrect) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearInterval(state.timerId);

    // Lock the buttons
    document.querySelectorAll('.mc-btn').forEach(b => b.disabled = true);

    let roundPts = 0;

    if (isCorrect) {
        state.streaks[0]++;
        roundPts = Math.max(10, state.timeLeft * 10); // Faster = more points!
        if (state.streaks[0] % 3 === 0) roundPts += 50;
        state.rawScores[0] += roundPts;
        
        sfxCheer.currentTime = 0; sfxCheer.play().catch(()=>{});
        document.getElementById('feedback').innerHTML = `<div style="color:var(--success); font-size:1.5rem; font-weight:bold;">✅ CORRECT! +${roundPts}</div>`;
    } else {
        state.streaks[0] = 0;
        sfxBuzzer.currentTime = 0; sfxBuzzer.play().catch(()=>{});
        document.getElementById('feedback').innerHTML = `<div style="color:var(--fail); font-size:1.5rem; font-weight:bold;">❌ WRONG!</div>`;
    }

    // Update the scoreboard
    const scoreBoard = document.getElementById('score-board');
    scoreBoard.innerHTML = `<div class="score-pill" style="border-color:${colors[0]}"><div class="p-name">SCORE</div><div class="p-pts">${state.rawScores[0]}</div><div class="p-streak">🔥 ${state.streaks[0]}</div></div>`;

    state.curIdx++;
    setTimeout(nextRound, 2000); // Wait 2 seconds, then next round
}

function endGameSequence() {
    document.getElementById('play-screen').classList.add('hidden');
    document.getElementById('final-screen').classList.remove('hidden');
    document.getElementById('winner-text').innerText = `Game Over! Final Score: ${state.rawScores[0]}`;
    document.getElementById('final-grid').innerHTML = "";
    document.querySelector('.playlist-box').style.display = 'none'; // Hide music playlist export
}
