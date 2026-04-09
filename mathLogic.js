// mathLogic.js
import { db } from './firebase.js';
import { state, sfxTick, sfxCheer, sfxBuzzer, colors } from './state.js';

export const manifest = {
    id: "fast_math",
    title: "FAST MATH",
    subtitle: "Quick-fire arithmetic battles",
    modes: [ { id: "addition", title: "➕ Addition", desc: "Classic 2-digit sums." } ],
    levels: [ 
        { id: "easy", title: "🟢 Easy", desc: "20s. Incorrect answer disappears at 10s." },
        { id: "hard", title: "🔴 Hard", desc: "10s. Pure speed. No help." }
    ],
    clientUI: "multiple-choice" 
};

export function resetStats() { alert("Stats reset not needed for Math Test"); }
export function startDailyChallenge() { alert("Daily mode not enabled for Math Test"); }
export function handleStop() {}
export function forceLifeline() {}
export function shareChallenge() {}

function generateMathProblem() {
    const num1 = Math.floor(Math.random() * 90) + 10; 
    const num2 = Math.floor(Math.random() * 90) + 10;
    const target = num1 + num2;

    let options = [{ text: `${num1} + ${num2}`, isCorrect: true }];
    while(options.length < 3) {
        let w1 = Math.floor(Math.random() * 90) + 10;
        let w2 = Math.floor(Math.random() * 90) + 10;
        if (w1 + w2 !== target) options.push({ text: `${w1} + ${w2}`, isCorrect: false });
    }
    return { target, options: options.sort(() => 0.5 - Math.random()) };
}

export function startGame() {
    state.isDailyMode = false;
    // Use Lobby count if multiplayer, otherwise force 1
    state.numPlayers = state.isMultiplayer ? state.numPlayers : 1; 
    // NEW FIX: Set time based on difficulty!
    state.timeLimit = state.gameState.level === 'easy' ? 20 : 10;
    state.maxRounds = 5;  
    state.curIdx = 0;
    state.rawScores = new Array(state.numPlayers).fill(0);
    state.streaks = new Array(state.numPlayers).fill(0);

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');

    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('btn-container').classList.add('hidden');
    document.getElementById('visualizer').classList.add('hidden');
    document.getElementById('reveal-art').style.display = 'none';

    nextRound();
}

function nextRound() {
    if (state.curIdx >= state.maxRounds) { endGameSequence(); return; }

    state.isProcessing = false;
    const problem = generateMathProblem();
    const tag = document.getElementById('active-player');

    if (state.isMultiplayer && state.isHost) {
        // --- TV SCREEN ---
        document.getElementById('score-board').innerHTML = ''; 
        tag.innerText = `FAST MATH: ROUND ${state.curIdx + 1}/${state.maxRounds}`;
        tag.style.color = "var(--highlight)"; tag.style.borderColor = "var(--highlight)";
        
        // NEW FIX 1: Push currentRound to Firebase to wake up the phones!
        db.ref(`rooms/${state.roomCode}/currentRound`).set(state.curIdx + 1);
        
        // Put the target front and center in the feedback box
        document.getElementById('feedback').innerHTML = `
            <div style="font-size:3.5rem; font-weight:900; color:#fff; margin-bottom:15px; letter-spacing: 2px;">Target: ${problem.target}</div>
            <div id="host-lock-status" style="color:var(--brand); font-size:1.3rem; font-weight:bold;">LOCKED IN: 0 / ${state.numPlayers}</div>
        `;

        // Push the MC options to the phone
        let fbOptions = problem.options.map(opt => ({ str: opt.text, isCorrect: opt.isCorrect }));
        db.ref(`rooms/${state.roomCode}/currentMC`).set(fbOptions);
        
        // NEW: Push the Target Number to the phone!
        db.ref(`rooms/${state.roomCode}/currentPrompt`).set(`Target: ${problem.target}`);
        
        // Reset player statuses
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            if (snap.exists()) {
                let updates = {};
                snap.forEach(p => { updates[`${p.key}/status`] = 'guessing'; updates[`${p.key}/guess`] = null; });
                db.ref(`rooms/${state.roomCode}/players`).update(updates);
            }
        });

    } else {
        // --- SOLO SCREEN ---
        tag.innerText = `FAST MATH: ROUND ${state.curIdx + 1}/${state.maxRounds}`;
        tag.style.color = colors[0]; tag.style.borderColor = colors[0];
        
        // Put the target front and center
        document.getElementById('feedback').innerHTML = `<div style="font-size:3rem; font-weight:900; color:#fff; margin-bottom:15px;">Target: ${problem.target}</div>`;
        
        const mcContainer = document.getElementById('mc-fields');
        mcContainer.innerHTML = ''; mcContainer.classList.remove('hidden');
        problem.options.forEach(opt => {
            const btn = document.createElement('button'); btn.className = 'mc-btn'; btn.innerText = opt.text;
            btn.onclick = () => evaluateGuess(opt.isCorrect); 
            mcContainer.appendChild(btn);
        });
    }

    // --- UNIVERSAL CLOCK LOGIC ---
    state.timeLeft = state.timeLimit;
    
    // Reset the giant timer display for both Solo and Host modes
    document.getElementById('timer').innerText = state.timeLeft;
    document.getElementById('timer').style.color = 'var(--highlight)';

    state.timerId = setInterval(() => {
        state.timeLeft--;
        
        // Always update the giant timer!
        document.getElementById('timer').innerText = state.timeLeft;

        if (state.isMultiplayer && state.isHost) {
            db.ref(`rooms/${state.roomCode}/timeLeft`).set(state.timeLeft);
        }

        // -------------------------------------------------------------
        // NEW FEATURE: 50/50 Lifeline at 10 Seconds!
        if (state.gameState.level === 'easy' && state.timeLeft === 10) {
            
            if (state.isMultiplayer && state.isHost) {
                // MULTIPLAYER: Re-filter the array to remove 1 wrong answer, then push to Firebase
                let removed = false;
                let newOptions = problem.options.filter(opt => {
                    if (!opt.isCorrect && !removed) { removed = true; return false; }
                    return true;
                });
                // The phones will instantly rebuild their UI when this hits the database!
                let fbOptions = newOptions.map(opt => ({ str: opt.text, isCorrect: opt.isCorrect }));
                db.ref(`rooms/${state.roomCode}/currentMC`).set(fbOptions);
                
            } else if (!state.isMultiplayer) {
                // SOLO: Find one wrong button on the screen and fade it out
                let removed = false;
                document.querySelectorAll('#mc-fields .mc-btn').forEach(btn => {
                    let opt = problem.options.find(o => o.text === btn.innerText);
                    if (opt && !opt.isCorrect && !removed) {
                        btn.style.opacity = '0';
                        btn.style.pointerEvents = 'none';
                        removed = true;
                    }
                });
            }
        }
        // -------------------------------------------------------------
        
        if (state.timeLeft <= 3) sfxTick.play().catch(()=>{});

        if (state.timeLeft <= 0) {
            clearInterval(state.timerId);
            if (state.isMultiplayer && state.isHost) {
                db.ref(`rooms/${state.roomCode}/players`).once('value', snap => evaluateMultiplayerRound(snap.val()));
            } else {
                evaluateGuess(false); 
            }
        }
    }, 1000);
}

export function evaluateGuess(isCorrect) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearInterval(state.timerId);

    document.querySelectorAll('.mc-btn').forEach(b => b.disabled = true);
    let roundPts = 0;

    if (isCorrect) {
        state.streaks[0]++;
        
        // NEW FIX: 0 seconds = 0 points. Time left * 10.
        roundPts = state.timeLeft * 10; 
        if (state.streaks[0] > 0 && state.streaks[0] % 3 === 0) roundPts += 50;
        
        state.rawScores[0] += roundPts;
        sfxCheer.currentTime = 0; sfxCheer.play().catch(()=>{});
        document.getElementById('feedback').innerHTML = `<div style="color:var(--success); font-size:1.5rem; font-weight:bold;">✅ CORRECT! +${roundPts}</div>`;
    } else {
        state.streaks[0] = 0;
        sfxBuzzer.currentTime = 0; sfxBuzzer.play().catch(()=>{});
        document.getElementById('feedback').innerHTML = `<div style="color:var(--fail); font-size:1.5rem; font-weight:bold;">❌ WRONG!</div>`;
    }

    document.getElementById('score-board').innerHTML = `<div class="score-pill" style="border-color:${colors[0]}"><div class="p-name">SCORE</div><div class="p-pts">${state.rawScores[0]}</div><div class="p-streak">🔥 ${state.streaks[0]}</div></div>`;
    state.curIdx++; setTimeout(nextRound, 2000); 
}

export function evaluateMultiplayerRound(players) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearInterval(state.timerId);

    let fbHTML = `<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:15px; font-weight:bold;">`;
    const playerIds = Object.keys(players);
    
    playerIds.forEach((pid, index) => {
        const p = players[pid];
        let roundPts = 0;
        let correct = (p.guess && p.guess.isMC && p.guess.correct);

        if (correct) {
            state.streaks[index]++;
            
            // NEW FIX: 0 seconds = 0 points. Phone's recorded time * 10.
            roundPts = p.guess.time * 10;
            if (state.streaks[index] > 0 && state.streaks[index] % 3 === 0) roundPts += 50; 
            
            state.rawScores[index] += roundPts;
            fbHTML += `<div style="color:var(--success); font-size:1.1rem;">✅ ${p.nickname || p.name || "Player"}: +${roundPts}</div>`;
        } else {
            fbHTML += `<div style="color:var(--fail); font-size:1.1rem;">❌ ${p.nickname || p.name || "Player"}: 0</div>`;
            state.streaks[index] = 0;
        }
    });

    fbHTML += `</div>`;
    document.getElementById('feedback').innerHTML = fbHTML; 

    state.curIdx++; 
    setTimeout(nextRound, 4000); 
}

function endGameSequence() {
    document.getElementById('play-screen').classList.add('hidden');
    document.getElementById('final-screen').classList.remove('hidden');
    document.querySelector('.playlist-box').style.display = 'none'; 
    document.getElementById('final-subtitle').innerText = "Speed & Accuracy Scored";
    
    if (state.isMultiplayer && state.isHost) {
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            const players = snap.val();
            const pIds = Object.keys(players);
            let finalResults = [];
            
            pIds.forEach((pid, index) => {
                finalResults.push({ name: players[pid].name, score: state.rawScores[index], id: pid });
                db.ref(`rooms/${state.roomCode}/players/${pid}`).update({ finalScore: state.rawScores[index] });
            });
            
            finalResults.sort((a, b) => b.score - a.score); 
            
            let podiumHTML = `<div style="text-align: left; background: var(--surface); padding: 15px; border-radius: 12px; border: 1px solid var(--border);">`;
            finalResults.forEach((p, idx) => {
                let medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : '👏'));
                let color = idx === 0 ? 'var(--p1)' : (idx === 1 ? 'var(--p2)' : '#ccc');
                podiumHTML += `<div style="display:flex; justify-content:space-between; padding: 12px 5px; border-bottom: 1px solid #333; font-size: 1.3rem; font-weight: bold; color: ${color};"><span>${medal} ${p.name}</span><span>${p.score}</span></div>`;
            });
            podiumHTML += `</div>`;
            
            document.getElementById('winner-text').innerHTML = podiumHTML;
            document.getElementById('final-grid').innerHTML = ""; 
            db.ref(`rooms/${state.roomCode}/state`).set('finished');
        });
    } else {
        document.getElementById('winner-text').innerText = `Game Over! Final Score: ${state.rawScores[0]}`;
        document.getElementById('final-grid').innerHTML = "";
    }
   
    // --- STATS SAVING LOGIC ---
    // Ensure the fast_math object is safely initialized
    state.userStats.fast_math = state.userStats.fast_math || { gamesPlayed: 0, highScore: 0 };
    
    // Check if we hit a new high score!
    const currentScore = state.rawScores[0] || 0;
    if (currentScore > (state.userStats.fast_math.highScore || 0)) {
        state.userStats.fast_math.highScore = currentScore;
    }

    // Increment games played
    state.userStats.fast_math.gamesPlayed++;
    state.userStats.platformGamesPlayed++;
    
    // Save to browser
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
}
