// mathLogic.js
import { db } from './firebase.js';
import { state, sfxTick, sfxCheer, sfxBuzzer, colors } from './state.js';

export const manifest = {
    id: "fast_math",
    title: "FAST MATH",
    subtitle: "Quick-fire arithmetic battles",
    hasDaily: false,
    modes: [ 
        { id: "addition", title: "➕ Addition", desc: "Classic 2-digit sums." },
        { id: "subtraction", title: "➖ Subtraction", desc: "Quick mental differences." },
        { id: "multiplication", title: "✖️ Multiplication", desc: "Fast-paced times tables." },
        { id: "division", title: "➗ Division", desc: "Clean mental math quotients." }
    ],
    levels: [ 
        { id: "easy", title: "🟢 Easy (Relaxed)", desc: "20s. Incorrect answer disappears at 10s." },
        { id: "medium", title: "🟡 Medium (Standard)", desc: "15s. Standard speed. No help." },
        { id: "hard", title: "🔴 Hard (Lightning)", desc: "8s. Pure speed. No help." }
    ],
    clientUI: "multiple-choice" 
};

export function resetStats() { alert("Stats reset not needed for Math Test"); }
export function startDailyChallenge() { alert("Daily mode not enabled for Math Test"); }
export function handleStop() {}
export function forceLifeline() {}
export function shareChallenge() {}

function generateMathProblem() {
    let num1, num2, target, operatorStr;

    if (state.gameState.mode === 'multiplication') {
        num1 = Math.floor(Math.random() * 11) + 2; 
        num2 = Math.floor(Math.random() * 11) + 2;
        target = num1 * num2;
        operatorStr = 'x';
    } else if (state.gameState.mode === 'subtraction') {
        num1 = Math.floor(Math.random() * 80) + 20; 
        num2 = Math.floor(Math.random() * (num1 - 5)) + 1; 
        target = num1 - num2;
        operatorStr = '-';
    } else if (state.gameState.mode === 'division') {
        target = Math.floor(Math.random() * 11) + 2; 
        num2 = Math.floor(Math.random() * 11) + 2;   
        num1 = target * num2;                        
        operatorStr = '÷';
    } else { 
        num1 = Math.floor(Math.random() * 90) + 10; 
        num2 = Math.floor(Math.random() * 90) + 10;
        target = num1 + num2;
        operatorStr = '+';
    }

    let options = [{ text: `${num1} ${operatorStr} ${num2}`, isCorrect: true }];
    
    while(options.length < 3) {
        let w1, w2;
        if (state.gameState.mode === 'multiplication') {
            w1 = Math.floor(Math.random() * 11) + 2;
            w2 = Math.floor(Math.random() * 11) + 2;
            if (w1 * w2 !== target) options.push({ text: `${w1} ${operatorStr} ${w2}`, isCorrect: false });
        } else if (state.gameState.mode === 'subtraction') {
            w1 = Math.floor(Math.random() * 80) + 20;
            w2 = Math.floor(Math.random() * (w1 - 5)) + 1;
            if (w1 - w2 !== target) options.push({ text: `${w1} ${operatorStr} ${w2}`, isCorrect: false });
        } else if (state.gameState.mode === 'division') {
            let wTarget = Math.floor(Math.random() * 11) + 2;
            w2 = Math.floor(Math.random() * 11) + 2;
            w1 = wTarget * w2;
            if (wTarget !== target) options.push({ text: `${w1} ${operatorStr} ${w2}`, isCorrect: false });
        } else {
            w1 = Math.floor(Math.random() * 90) + 10;
            w2 = Math.floor(Math.random() * 90) + 10;
            if (w1 + w2 !== target) options.push({ text: `${w1} ${operatorStr} ${w2}`, isCorrect: false });
        }
    }
    return { target, options: options.sort(() => 0.5 - Math.random()) };
}

export function startGame() {
    state.isDailyMode = false;
    state.numPlayers = state.isMultiplayer ? state.numPlayers : 1; 
    state.timeLimit = state.gameState.level === 'easy' ? 20 : 10; 
    state.maxRounds = state.gameState.rounds; 

    state.doubleRounds = [];
    for (let i = 0; i < state.maxRounds; i += 5) {
        let min = i === 0 ? 2 : i; 
        let max = Math.min(i + 4, state.maxRounds - 1);
        if (min <= max) {
            let randomRound = Math.floor(Math.random() * (max - min + 1)) + min;
            state.doubleRounds.push(randomRound);
        }
    }
    
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

    const isDoubleRound = state.doubleRounds && state.doubleRounds.includes(state.curIdx);
    const doubleText = isDoubleRound ? " - ⭐ 2X BONUS!" : "";

    if (state.isMultiplayer && state.isHost) {
        document.getElementById('score-board').innerHTML = ''; 
        
        tag.innerText = `${manifest.title}: ROUND ${state.curIdx + 1}/${state.maxRounds}${doubleText}`;
        tag.style.color = isDoubleRound ? "#ffcc00" : "var(--highlight)";
        tag.style.borderColor = isDoubleRound ? "#ffcc00" : "var(--highlight)";
             
        db.ref(`rooms/${state.roomCode}/currentRound`).set(state.curIdx + 1);
        
        document.getElementById('feedback').innerHTML = `
            <div style="font-size:3.5rem; font-weight:900; color:#fff; margin-bottom:15px; letter-spacing: 2px;">Target: ${problem.target}</div>
            <div id="host-lock-status" style="color:var(--brand); font-size:1.3rem; font-weight:bold;">LOCKED IN: 0 / ${state.numPlayers}</div>
        `;

        let fbOptions = problem.options.map(opt => ({ str: opt.text, isCorrect: opt.isCorrect }));
        db.ref(`rooms/${state.roomCode}/currentMC`).set(fbOptions);
        db.ref(`rooms/${state.roomCode}/currentPrompt`).set(`Target: ${problem.target}`);
        
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            if (snap.exists()) {
                let updates = {};
                snap.forEach(p => { updates[`${p.key}/status`] = 'guessing'; updates[`${p.key}/guess`] = null; });
                db.ref(`rooms/${state.roomCode}/players`).update(updates);
            }
        });

    } else {
        tag.innerText = `FAST MATH: ROUND ${state.curIdx + 1}/${state.maxRounds}${doubleText}`;
        tag.style.color = isDoubleRound ? "#ffcc00" : colors[0]; 
        tag.style.borderColor = isDoubleRound ? "#ffcc00" : colors[0];
              
        document.getElementById('feedback').innerHTML = `<div style="font-size:3rem; font-weight:900; color:#fff; margin-bottom:15px;">Target: ${problem.target}</div>`;
        
        const mcContainer = document.getElementById('mc-fields');
        mcContainer.innerHTML = ''; mcContainer.classList.remove('hidden');
        problem.options.forEach(opt => {
            const btn = document.createElement('button'); btn.className = 'mc-btn'; btn.innerText = opt.text;
            btn.onclick = () => evaluateGuess(opt.isCorrect); 
            mcContainer.appendChild(btn);
        });
    }

    state.timeLeft = state.timeLimit;
    document.getElementById('timer').innerText = state.timeLeft;
    document.getElementById('timer').style.color = 'var(--highlight)';

    state.timerId = setInterval(() => {
        state.timeLeft--;
        document.getElementById('timer').innerText = state.timeLeft;

        if (state.isMultiplayer && state.isHost) {
            db.ref(`rooms/${state.roomCode}/timeLeft`).set(state.timeLeft);
        }

        if (state.gameState.level === 'easy' && state.timeLeft === 10) {
            if (state.isMultiplayer && state.isHost) {
                let removed = false;
                let newOptions = problem.options.filter(opt => {
                    if (!opt.isCorrect && !removed) { removed = true; return false; }
                    return true;
                });
                let fbOptions = newOptions.map(opt => ({ str: opt.text, isCorrect: opt.isCorrect }));
                db.ref(`rooms/${state.roomCode}/currentMC`).set(fbOptions);
            } else if (!state.isMultiplayer) {
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
    const isDoubleRound = state.doubleRounds.includes(state.curIdx);

    if (isCorrect) {
        state.streaks[0]++;
        roundPts = state.timeLeft * 10; 
        if (state.streaks[0] > 0 && state.streaks[0] % 3 === 0) roundPts += 50;
        
        if (isDoubleRound) roundPts *= 2;
        
        const bonusTxt = isDoubleRound ? "⭐ 2X BONUS! " : "CORRECT! ";
        document.getElementById('feedback').innerHTML = `<div style="color:${isDoubleRound ? '#ffcc00' : 'var(--success)'}; font-size:1.5rem; font-weight:bold;">✅ ${bonusTxt}+${roundPts}</div>`;
        
        state.rawScores[0] += roundPts;
        sfxCheer.currentTime = 0; sfxCheer.play().catch(()=>{});
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
    const isDoubleRound = state.doubleRounds.includes(state.curIdx);
    
    playerIds.forEach((pid, index) => {
        const p = players[pid];
        let roundPts = 0;
        let correct = (p.guess && p.guess.isMC && p.guess.correct);

        if (correct) {
            state.streaks[index]++;
            roundPts = p.guess.time * 10;
            if (state.streaks[index] > 0 && state.streaks[index] % 3 === 0) roundPts += 50; 
            
            if (isDoubleRound) roundPts *= 2;
            
            // Fixed Bug: Brought back the player's name so the host screen makes sense!
            const bonusTxt = isDoubleRound ? "⭐ 2X BONUS! " : "✅ ";
            fbHTML += `<div style="color:${isDoubleRound ? '#ffcc00' : 'var(--success)'}; font-size:1.1rem; font-weight:bold;">${bonusTxt}${p.nickname || p.name || "Player"}: +${roundPts}</div>`;
            
            state.rawScores[index] += roundPts;
        } else {
            fbHTML += `<div style="color:var(--fail); font-size:1.1rem; font-weight:bold;">❌ ${p.nickname || p.name || "Player"}: 0</div>`;
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
    
    const playlistBox = document.querySelector('.playlist-box');
    if (playlistBox) playlistBox.style.display = 'none'; 
    
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
   
    state.userStats.fast_math = state.userStats.fast_math || { gamesPlayed: 0, highScore: 0 };
    
    const currentScore = state.rawScores[0] || 0;
    if (currentScore > (state.userStats.fast_math.highScore || 0)) {
        state.userStats.fast_math.highScore = currentScore;
    }

    state.userStats.fast_math.gamesPlayed++;
    state.userStats.platformGamesPlayed++;
    
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
}
