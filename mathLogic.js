// mathLogic.js
import { db } from './firebase.js';
import { state, sfxTick, sfxCheer, sfxBuzzer, colors } from './state.js';

export const manifest = {
    id: "fast_math",
    title: "FAST MATH",
    subtitle: "Quick-fire arithmetic battles",
    hasDaily: false,
    rulesHTML: `
        <h2>Fast Math Rules</h2>
        <p style="color:#ccc; line-height: 1.6;">
            Solve the arithmetic problem shown on the screen as fast as possible. 
            The faster you answer, the more points you get. 
            <br><br>
            Get 3 in a row correct for a <strong>+50 Streak Bonus!</strong>
        </p>
        <button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px; width: 100%;">
            Let's Go!
        </button>
    `,
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

export function resetStats() { 
    if(confirm("Are you sure you want to reset your Fast Math lifetime stats? This cannot be undone.")) {
        state.userStats.fast_math = { gamesPlayed: 0, highScore: 0, correctGuesses: 0, totalGuesses: 0 };
        localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
        
        const hsElement = document.querySelector('#stats-modal .stat-val.p1');
        if (hsElement) hsElement.innerText = "0";
        alert("Fast Math stats have been reset.");
    }
}

export function renderStatsUI(fmStats, container) {
    container.innerHTML = `
        <h2 style="color:var(--brand); margin-top:0; text-align:center; border-bottom:1px solid #333; padding-bottom:15px;">Fast Math Locker</h2>
        <div class="stat-grid">
            <div class="stat-box">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Games Played</div>
                <div class="stat-val">${fmStats.gamesPlayed || 0}</div>
            </div>
            <div class="stat-box">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">High Score</div>
                <div class="stat-val" style="color:var(--p1)">${fmStats.highScore || fmStats.hsText || 0}</div>
            </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
            <button class="btn btn-main" onclick="hideModal('stats-modal')" style="flex: 1; margin-right: 10px;">Close</button>
            <button class="btn btn-reset" onclick="if(window.activeCartridge && window.activeCartridge.resetStats) { window.activeCartridge.resetStats(); hideModal('stats-modal'); }" style="margin-top: 0; padding: 16px;">Reset</button>
        </div>
    `;
}

export function shareChallenge() { 
    const currentScore = state.rawScores[0] || 0;
    const modeName = state.gameState.level.charAt(0).toUpperCase() + state.gameState.level.slice(1);
    
    const text = `Yardbird's Fast Math ➕\nI just scored ${currentScore} points on ${modeName} difficulty!\nThink you're faster? Play here:`;
    const url = `${window.location.origin}${window.location.pathname}`;
    
    if (navigator.share) { 
        navigator.share({ title: "Beat My Math Score!", text: text, url: url }).catch(console.error); 
    } else { 
        navigator.clipboard.writeText(text + "\n" + url); 
        alert("Challenge link copied to clipboard! Paste it to your friends."); 
    }
}

export function startDailyChallenge() { console.warn("Not supported in Math"); }
export function handleStop() { return; }
export function forceLifeline() { return; }

function generateMathProblem() {
    let num1, num2, target, operatorStr;

    if (state.gameState.mode === 'multiplication') {
        num1 = Math.floor(Math.random() * 11) + 2; 
        num2 = Math.floor(Math.random() * 11) + 2;
        target = num1 * num2; operatorStr = 'x';
    } else if (state.gameState.mode === 'subtraction') {
        num1 = Math.floor(Math.random() * 80) + 20; 
        num2 = Math.floor(Math.random() * (num1 - 5)) + 1; 
        target = num1 - num2; operatorStr = '-';
    } else if (state.gameState.mode === 'division') {
        target = Math.floor(Math.random() * 11) + 2; 
        num2 = Math.floor(Math.random() * 11) + 2;   
        num1 = target * num2; operatorStr = '÷';
    } else { 
        num1 = Math.floor(Math.random() * 90) + 10; 
        num2 = Math.floor(Math.random() * 90) + 10;
        target = num1 + num2; operatorStr = '+';
    }

    let options = [{ text: `${num1} ${operatorStr} ${num2}`, isCorrect: true }];
    
    while(options.length < 3) {
        let w1, w2;
        if (state.gameState.mode === 'multiplication') {
            w1 = Math.floor(Math.random() * 11) + 2; w2 = Math.floor(Math.random() * 11) + 2;
            if (w1 * w2 !== target) options.push({ text: `${w1} ${operatorStr} ${w2}`, isCorrect: false });
        } else if (state.gameState.mode === 'subtraction') {
            w1 = Math.floor(Math.random() * 80) + 20; w2 = Math.floor(Math.random() * (w1 - 5)) + 1;
            if (w1 - w2 !== target) options.push({ text: `${w1} ${operatorStr} ${w2}`, isCorrect: false });
        } else if (state.gameState.mode === 'division') {
            let wTarget = Math.floor(Math.random() * 11) + 2; w2 = Math.floor(Math.random() * 11) + 2; w1 = wTarget * w2;
            if (wTarget !== target) options.push({ text: `${w1} ${operatorStr} ${w2}`, isCorrect: false });
        } else {
            w1 = Math.floor(Math.random() * 90) + 10; w2 = Math.floor(Math.random() * 90) + 10;
            if (w1 + w2 !== target) options.push({ text: `${w1} ${operatorStr} ${w2}`, isCorrect: false });
        }
    }
    return { target, options: options.sort(() => 0.5 - Math.random()) };
}

export function startGame() {
    state.isDailyMode = false;
    state.numPlayers = state.isMultiplayer ? state.numPlayers : 1; 

    if (state.gameState.level === 'easy') state.timeLimit = 20;
    else if (state.gameState.level === 'medium') state.timeLimit = 15;
    else state.timeLimit = 8; 

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
    document.querySelectorAll('.header-btn').forEach(btn => btn.classList.add('hidden'));
    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('btn-container').classList.add('hidden');
    document.getElementById('visualizer').classList.add('hidden');
    document.getElementById('reveal-art').style.display = 'none';

    if (!state.isHost) {
        document.getElementById('score-board').innerHTML = `<div class="score-pill" style="border-color:${colors[0]};">
            <div class="p-name" style="color:${colors[0]}">SCORE</div>
            <div class="p-pts" style="color:var(--dark-text)">0</div>
            <div class="p-streak" style="opacity:0">🔥 0</div>
        </div>`;
    }
    
    nextRound();
}

export function nextRound() {
    if (state.curIdx >= state.maxRounds) { endGameSequence(); return; }

    state.isProcessing = false;
    const problem = generateMathProblem();
    state.currentCorrectAnswer = problem.target;
    const tag = document.getElementById('active-player');

    const isDoubleRound = state.doubleRounds && state.doubleRounds.includes(state.curIdx);
    const doubleText = isDoubleRound ? " - ⭐ 2X BONUS!" : "";

    if (state.isMultiplayer && state.isHost) {
        document.getElementById('score-board').innerHTML = ''; 
        
        tag.innerText = `${manifest.title}: ROUND ${state.curIdx + 1}/${state.maxRounds}${doubleText}`;
        tag.style.color = isDoubleRound ? "#f39c12" : "var(--primary)";
        tag.style.borderColor = isDoubleRound ? "#f39c12" : "var(--primary)";
             
        db.ref(`rooms/${state.roomCode}/currentRound`).set(state.curIdx + 1);
        
        document.getElementById('feedback').innerHTML = `
            <div style="font-size:3.5rem; font-weight:900; color:var(--dark-text); margin-bottom:15px; letter-spacing: 2px;">Target: ${problem.target}</div>
            <div id="host-lock-status" style="color:var(--primary); font-size:1.3rem; font-weight:bold;">LOCKED IN: 0 / ${state.numPlayers}</div>
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
        tag.style.color = isDoubleRound ? "#f39c12" : "var(--primary)"; 
        tag.style.borderColor = isDoubleRound ? "#f39c12" : "var(--primary)";
              
        document.getElementById('feedback').innerHTML = `<div style="font-size:3rem; font-weight:900; color:var(--dark-text); margin-bottom:15px;">Target: ${problem.target}</div>`;
        
        const mcContainer = document.getElementById('mc-fields');
        mcContainer.innerHTML = ''; mcContainer.classList.remove('hidden');
        problem.options.forEach(opt => {
            const btn = document.createElement('button'); 
            btn.className = 'mc-btn'; 
            btn.innerText = opt.text;
            btn.onclick = (e) => evaluateGuess(opt.isCorrect, e.target); 
            mcContainer.appendChild(btn);
        });
    }

    state.timeLeft = state.timeLimit;
    
    const timerElement = document.getElementById('timer');
    timerElement.style.color = ''; 
    timerElement.innerHTML = `<div class="timer-bar-container"><div id="timer-bar-fill" class="timer-bar-fill"></div></div>`;
    const timerFill = document.getElementById('timer-bar-fill');

    // 👇 FIXED: The proper non-nested setInterval that works for both! 👇
    state.timerId = setInterval(() => {
        state.timeLeft--;
        
        let percentage = (state.timeLeft / state.timeLimit) * 100;
        if(timerFill) timerFill.style.width = `${percentage}%`;

        if (state.isMultiplayer && state.isHost) {
            db.ref(`rooms/${state.roomCode}/timeLeft`).set(state.timeLeft);
        }

        const helpThreshold = state.gameState.level === 'easy' ? 10 : 5;
        
        if (state.gameState.level !== 'hard' && state.timeLeft === helpThreshold) {
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
        
        if (state.timeLeft <= 3) {
            if(timerFill) timerFill.style.backgroundColor = 'var(--fail)';
            sfxTick.play().catch(()=>{});
        }

        if (state.timeLeft <= 0) {
            clearInterval(state.timerId);
            // Only force the end locally if we are NOT in multiplayer. 
            // If multiplayer, the Console handles it!
            if (!state.isMultiplayer) {
                evaluateGuess(false, null); 
            }
        }
    }, 1000);
}

export function evaluateGuess(isCorrect, clickedBtn = null) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearInterval(state.timerId);

    document.querySelectorAll('.mc-btn').forEach(b => b.disabled = true);
    let roundPts = 0;
    const isDoubleRound = state.doubleRounds.includes(state.curIdx);

    if (isCorrect) {
        if(clickedBtn) clickedBtn.classList.add('correct');
        state.streaks[0]++;
        roundPts = state.timeLeft * 10; 
        if (state.streaks[0] > 0 && state.streaks[0] % 3 === 0) roundPts += 50;
        if (isDoubleRound) roundPts *= 2;
        
        const bonusTxt = isDoubleRound ? "⭐ 2X BONUS! " : "CORRECT! ";
        document.getElementById('feedback').innerHTML = `<div style="color:${isDoubleRound ? '#ffcc00' : 'var(--success)'}; font-size:1.5rem; font-weight:bold;">✅ ${bonusTxt}+${roundPts}</div>`;
        state.rawScores[0] += roundPts;
        sfxCheer.currentTime = 0; sfxCheer.play().catch(()=>{});
    } else {
        if(clickedBtn) clickedBtn.classList.add('wrong');
        state.streaks[0] = 0;
        sfxBuzzer.currentTime = 0; sfxBuzzer.play().catch(()=>{});
        document.getElementById('feedback').innerHTML = `<div style="color:var(--fail); font-size:1.5rem; font-weight:bold; margin-bottom:5px;">❌ INCORRECT</div>`;
    }

    document.getElementById('score-board').innerHTML = `<div class="score-pill" style="border-color:${colors[0]}"><div class="p-name">SCORE</div><div class="p-pts" style="color:var(--dark-text);">${state.rawScores[0]}</div><div class="p-streak">🔥 ${state.streaks[0]}</div></div>`;
    
    state.curIdx++; 
    setTimeout(nextRound, 2000); 
}

export async function evaluateMultiplayerRound(players) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearInterval(state.timerId); 

    const results = [];
    const correctAnswer = state.currentCorrectAnswer; 

    Object.keys(players).forEach(pid => {
        const p = players[pid];
        let points = 0;
        
        if (p.guess && p.guess.isMC && p.guess.correct) {
            const speedFactor = p.guess.time / state.timeLimit;
            points = Math.round(100 + (speedFactor * 100));
            if (state.doubleRounds.includes(state.curIdx)) points *= 2;
        }

        results.push({
            id: pid,
            newScore: (p.score || 0) + points
        });
    });

    window.finalizeMultiplayerRound(results);
    document.getElementById('feedback').innerHTML = `<h2 style="color:var(--brand)">ROUND OVER</h2><p>Check your phones!</p>`;
}

function getNormalizedScore(rawScore) {
    const maxPossible = state.maxRounds * 250; 
    return Math.min(1000, Math.round((rawScore / maxPossible) * 1000));
}

function endGameSequence() {
    document.getElementById('play-screen').classList.add('hidden');
    document.getElementById('final-screen').classList.remove('hidden');
    
    const playlistBox = document.querySelector('.playlist-box');
    if (playlistBox) playlistBox.style.display = 'none'; 
    document.getElementById('final-subtitle').innerText = "Scores Normalized to 1000";
    
    const normalizedScores = state.rawScores.map(s => getNormalizedScore(s));
    const maxScore = Math.max(...normalizedScores);
    
    if (state.isMultiplayer && state.isHost) {
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            const players = snap.val();
            const pIds = Object.keys(players);
            let finalResults = [];
            
            pIds.forEach((pid, index) => {
                finalResults.push({ name: players[pid].name, score: normalizedScores[index], id: pid });
                db.ref(`rooms/${state.roomCode}/players/${pid}`).update({ finalScore: normalizedScores[index] });
            });
            
            finalResults.sort((a, b) => b.score - a.score); 
            db.ref(`rooms/${state.roomCode}/finalLeaderboard`).set(finalResults);
            
            let podiumHTML = `<div style="margin-top: 15px; text-align: left; background: var(--surface); padding: 15px; border-radius: 12px; border: 2px solid var(--border-light);"><h3 style="margin-top:0; color:var(--primary); text-align:center; text-transform:uppercase; margin-bottom:15px;">Final Standings</h3>`;
            finalResults.forEach((p, idx) => {
                let medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : '👏'));
                let color = idx === 0 ? 'var(--p1)' : (idx === 1 ? 'var(--p2)' : 'var(--text-muted)');
                podiumHTML += `<div style="display:flex; justify-content:space-between; padding: 12px 5px; border-bottom: 1px solid var(--border-light); font-size: 1.3rem; font-weight: bold; color: ${color};"><span>${medal} ${p.name}</span><span style="font-family:'Courier New', monospace; color: var(--dark-text);">${p.score}</span></div>`;
            });
            podiumHTML += `</div>`;
            
            document.getElementById('winner-text').innerHTML = podiumHTML;
            document.getElementById('final-grid').innerHTML = ""; 
            db.ref(`rooms/${state.roomCode}/state`).set('finished');
        });
    } else {
        const hypeText = maxScore > 800 ? "Math Genius! 🧠" : (maxScore > 500 ? "Solid Speed! ⚡" : "Keep Practicing! 📈");
        document.getElementById('winner-text').innerHTML = `
            <div style="background: linear-gradient(135deg, var(--primary), #8e2de2); padding: 50px 20px; border-radius: 24px; color: white; box-shadow: 0 12px 24px rgba(110, 69, 226, 0.2); margin: 30px 0; text-align: center;">
                <div style="font-size: 1.1rem; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; opacity: 0.9; margin-bottom: 10px;">Final Score</div>
                <div style="font-size: 5.5rem; font-weight: 900; line-height: 1; text-shadow: 2px 4px 10px rgba(0,0,0,0.2);">${maxScore}</div>
                <div style="font-size: 1.2rem; font-weight: 600; margin-top: 15px; opacity: 0.9;">${hypeText}</div>
            </div>
        `;
        document.getElementById('winner-text').style.color = ''; 
        document.getElementById('final-grid').innerHTML = "";
    }
   
    state.userStats.fast_math = state.userStats.fast_math || { gamesPlayed: 0, highScore: 0 };
    if (maxScore > (state.userStats.fast_math.highScore || 0)) state.userStats.fast_math.highScore = maxScore;
    state.userStats.fast_math.gamesPlayed++;
    state.userStats.platformGamesPlayed++;
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
}
