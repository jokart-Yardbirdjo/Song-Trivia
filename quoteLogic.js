// quoteLogic.js
import { db } from './firebase.js';
import { state, sfxTick, sfxCheer, sfxBuzzer, colors } from './state.js';

export const manifest = {
    id: "who_said_it",
    title: "WHO SAID IT?",
    subtitle: "Pop Culture & Iconic Quotes",
    hasDaily: false,
    modes: [
        { id: "celeb", title: "🎤 Celebs & Creators", desc: "Celebrities, viral Tweets, and TikTok sounds." },
        { id: "movie", title: "🎬 Screen & Stage", desc: "Iconic lines from Movies, Netflix, and TV shows." },
        { id: "text", title: "📖 Lyrics & Lore", desc: "Guess the Song Lyric or Book Quote." }
    ],
    levels: [
        { id: "easy", title: "🟢 Casual", desc: "20s. Standard pacing." },
        { id: "hard", title: "🔴 Speedrun", desc: "10s. Pure reflex." }
    ],
    clientUI: "multiple-choice" 
};

// Simple PRNG to ensure challengers get the exact same quotes
function createPRNG(seed) {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// Deterministic Fisher-Yates Shuffle
function deterministicShuffle(array, prng) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        // Pick a remaining element using our seeded math
        randomIndex = Math.floor(prng() * currentIndex);
        currentIndex--;
        // Swap it with the current element
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

export function resetStats() { 
    if(confirm("Are you sure you want to reset your Who Said It stats?")) {
        state.userStats.who_said_it = { gamesPlayed: 0, highScore: 0 };
        localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
        alert("Who Said It stats reset.");
        if (window.hideModal) window.hideModal('stats-modal');
    }
}

// Required hooks to prevent platform errors
export function handleStop() { return; }
export function forceLifeline() { return; }
export function startDailyChallenge() { alert("Daily mode coming soon!"); }

export function shareChallenge() {
    const score = Math.max(...state.rawScores); 
    
    // Build URL with Mode and Seed
    const url = `${window.location.origin}${window.location.pathname}?game=who_said_it&mode=${state.gameState.mode}&seed=${state.gameSeed}&beat=${score}`;
    const text = `🗣️ I just scored ${score} points in Who Said It! Think you can beat me?`;

    if (navigator.share) {
        navigator.share({ title: "Beat My Quote Score!", text: text, url: url }).catch(console.error);
    } else {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(`${text}\n${url}`)
                .then(() => alert("Challenge Link Copied! Paste it to a friend."))
                .catch(err => prompt("Copy this link manually:", url));
        } else {
            prompt("Copy this link to challenge a friend:", url);
        }
    }
}

export async function startGame() {
    state.numPlayers = state.isMultiplayer ? state.numPlayers : 1; 
    state.timeLimit = state.gameState.level === 'easy' ? 20 : 10; 
    state.maxRounds = state.gameState.rounds;
    state.curIdx = 0;
    state.rawScores = new Array(state.numPlayers).fill(0);
    state.streaks = new Array(state.numPlayers).fill(0);

    // 👇 URL PARSER & PRNG INITIALIZATION 👇
    const urlParams = new URLSearchParams(window.location.search);
    const targetScore = urlParams.get('beat');
    const urlSeed = urlParams.get('seed');
    const urlMode = urlParams.get('mode');

    // Force the correct category if challenged
    if (urlMode) state.gameState.mode = urlMode; 

    // Use Challenger's seed, or make a new one
    state.gameSeed = urlSeed ? parseInt(urlSeed) : Math.floor(Math.random() * 1000000);
    state.prng = createPRNG(state.gameSeed);

    if (targetScore) {
        document.getElementById('feedback').insertAdjacentHTML('afterend', 
            `<div id="challenge-banner" style="background:var(--primary); color:white; padding:8px; border-radius:8px; margin-top:10px; text-align:center; font-weight:bold; font-size: 1.2rem;">
                🎯 Target to Beat: ${targetScore} Pts
            </div>`
        );
    }

    // Platform UI Prep
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');
    document.querySelectorAll('.header-btn').forEach(btn => btn.classList.add('hidden'));
    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('btn-container').classList.add('hidden');
    document.getElementById('visualizer').classList.add('hidden');

    if (!state.isHost) {
        document.getElementById('score-board').innerHTML = `<div class="score-pill" style="border-color:${colors[0]};"><div class="p-name" style="color:${colors[0]}">SCORE</div><div class="p-pts" style="color:var(--dark-text)">0</div><div class="p-streak" style="opacity:0">🔥 0</div></div>`;
    }

    document.getElementById('feedback').innerHTML = `<div style="color:var(--primary); font-size:1.5rem; margin-top:40px;">Loading Database...</div>`;

    try {
        const res = await fetch('db_quotes.json');
        const dbData = await res.json();
        const mode = state.gameState.mode;
        
        let pool = dbData[mode] || [];
        if(pool.length < state.maxRounds) {
            alert(`Not enough quotes in ${mode} category. Lower rounds or add to DB!`);
            location.reload(); return;
        }

        // Shuffle and slice for the game using PRNG
        state.songs = deterministicShuffle([...pool], state.prng).slice(0, state.maxRounds);
        
        // Build a global pool of authors for wrong answers
        state.globalPool = [];
        Object.keys(dbData).forEach(k => {
            dbData[k].forEach(item => { if(!state.globalPool.includes(item.a)) state.globalPool.push(item.a); });
        });

        nextRound();
    } catch(e) {
        console.error(e);
        alert("Failed to load db_quotes.json!");
        location.reload();
    }
}

function nextRound() {
    if (state.curIdx >= state.maxRounds) { endGameSequence(); return; }
    state.isProcessing = false;
    const currentData = state.songs[state.curIdx];
    const tag = document.getElementById('active-player');

    // Generate 3 random wrong answers using deterministic shuffle
    let options = [{ str: currentData.a, isCorrect: true }];
    
    let filteredGlobal = state.globalPool.filter(a => a !== currentData.a);
    let wrongPool = deterministicShuffle(filteredGlobal, state.prng);
    
    for(let i=0; i<3; i++) {
        if(wrongPool[i]) options.push({ str: wrongPool[i], isCorrect: false });
    }
    
    options = deterministicShuffle(options, state.prng);

    if (state.isMultiplayer && state.isHost) {
        document.getElementById('score-board').innerHTML = ''; 
        tag.innerText = `QUOTE ${state.curIdx + 1}/${state.maxRounds}`;
        tag.style.color = "var(--primary)"; tag.style.borderColor = "var(--primary)";
             
        db.ref(`rooms/${state.roomCode}/currentRound`).set(state.curIdx + 1);
        
        document.getElementById('feedback').innerHTML = `
            <div class="prompt-text" style="font-style:italic;">"${currentData.q}"</div>
            <div id="host-lock-status" style="color:var(--primary); font-size:1.3rem; font-weight:bold; margin-top:20px;">LOCKED IN: 0 / ${state.numPlayers}</div>
        `;

        db.ref(`rooms/${state.roomCode}/currentMC`).set(options);
        db.ref(`rooms/${state.roomCode}/currentPrompt`).set(`"${currentData.q}"`);
        
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            if (snap.exists()) {
                let updates = {};
                snap.forEach(p => { updates[`${p.key}/status`] = 'guessing'; updates[`${p.key}/guess`] = null; });
                db.ref(`rooms/${state.roomCode}/players`).update(updates);
            }
        });

    } else {
        tag.innerText = `ROUND ${state.curIdx + 1}/${state.maxRounds}`;
        tag.style.color = "var(--primary)"; tag.style.borderColor = "var(--primary)";
              
        document.getElementById('feedback').innerHTML = `<div class="prompt-text" style="font-style:italic; font-size: 2rem;">"${currentData.q}"</div>`;

        // 👇 ADD THIS TEXT-TO-SPEECH BLOCK 👇
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); 
            const msg = new SpeechSynthesisUtterance(currentData.q);
            msg.rate = 0.95;  
            window.speechSynthesis.speak(msg);
        }
        
        const mcContainer = document.getElementById('mc-fields');
        mcContainer.innerHTML = ''; mcContainer.classList.remove('hidden');
        
        options.forEach(opt => {
            const btn = document.createElement('button'); 
            btn.className = 'mc-btn'; btn.innerText = opt.str;
            btn.onclick = (e) => evaluateGuess(opt.isCorrect, e.target); 
            mcContainer.appendChild(btn);
        });
    }

    state.timeLeft = state.timeLimit;
    const timerElement = document.getElementById('timer');
    timerElement.innerHTML = `<div class="timer-bar-container"><div id="timer-bar-fill" class="timer-bar-fill"></div></div>`;
    const timerFill = document.getElementById('timer-bar-fill');

    state.timerId = setInterval(() => {
        state.timeLeft--;
        let percentage = (state.timeLeft / state.timeLimit) * 100;
        if(timerFill) timerFill.style.width = `${percentage}%`;

        if (state.isMultiplayer && state.isHost) db.ref(`rooms/${state.roomCode}/timeLeft`).set(state.timeLeft);

        if (state.timeLeft <= 3) {
            if(timerFill) timerFill.style.backgroundColor = 'var(--fail)';
            sfxTick.play().catch(()=>{});
        }

        if (state.timeLeft <= 0) {
            clearInterval(state.timerId);
            if (state.isMultiplayer && state.isHost) {
                db.ref(`rooms/${state.roomCode}/players`).once('value', snap => evaluateMultiplayerRound(snap.val()));
            } else {
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

    if (isCorrect) {
        if(clickedBtn) clickedBtn.classList.add('correct');
        state.streaks[0]++;
        roundPts = state.timeLeft * 10; 
        if (state.streaks[0] > 0 && state.streaks[0] % 3 === 0) roundPts += 50;
        
        document.getElementById('feedback').innerHTML = `<div style="color:var(--success); font-size:1.5rem; font-weight:bold;">✅ CORRECT! +${roundPts}</div>`;
        state.rawScores[0] += roundPts;
        sfxCheer.currentTime = 0; sfxCheer.play().catch(()=>{});
    } else {
        if(clickedBtn) clickedBtn.classList.add('wrong');
        
        const realAuthor = state.songs[state.curIdx].a;
        document.querySelectorAll('.mc-btn').forEach(b => {
            if(b.innerText === realAuthor) b.classList.add('correct');
        });
        
        state.streaks[0] = 0;
        sfxBuzzer.currentTime = 0; sfxBuzzer.play().catch(()=>{});
        document.getElementById('feedback').innerHTML = `<div style="color:var(--fail); font-size:1.5rem; font-weight:bold; margin-bottom:5px;">❌ INCORRECT</div><div style="color:var(--text-muted);">It was ${realAuthor}</div>`;
    }

    document.getElementById('score-board').innerHTML = `<div class="score-pill" style="border-color:${colors[0]}"><div class="p-name">SCORE</div><div class="p-pts" style="color:var(--dark-text);">${state.rawScores[0]}</div><div class="p-streak">🔥 ${state.streaks[0]}</div></div>`;
    
    state.curIdx++; 
    setTimeout(nextRound, 2500); 
}

export function evaluateMultiplayerRound(players) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearInterval(state.timerId);

    let fbHTML = `<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:15px; font-weight:bold;">`;
    const playerIds = Object.keys(players);
    const realAuthor = state.songs[state.curIdx].a;
    
    playerIds.forEach((pid, index) => {
        const p = players[pid];
        let roundPts = 0;
        let correct = (p.guess && p.guess.isMC && p.guess.correct);

        if (correct) {
            state.streaks[index]++;
            roundPts = p.guess.time * 10;
            if (state.streaks[index] > 0 && state.streaks[index] % 3 === 0) roundPts += 50; 
            
            fbHTML += `<div style="color:var(--success); font-size:1.1rem; font-weight:bold;">✅ ${p.nickname || p.name || "Player"}: +${roundPts}</div>`;
            state.rawScores[index] += roundPts;
        } else {
            fbHTML += `<div style="color:var(--fail); font-size:1.1rem; font-weight:bold;">❌ ${p.nickname || p.name || "Player"}: 0</div>`;
            state.streaks[index] = 0;
        }
    });

    fbHTML += `</div><div style="font-size:1.2rem; color:var(--text-muted);">Answer: <strong style="color:var(--primary);">${realAuthor}</strong></div>`;
    document.getElementById('feedback').innerHTML = fbHTML; 
    
    state.curIdx++; 
    setTimeout(nextRound, 4000); 
}

function endGameSequence() {
    document.getElementById('play-screen').classList.add('hidden');
    document.getElementById('final-screen').classList.remove('hidden');
    document.getElementById('final-subtitle').innerText = "Scores Normalized to 1000";
    document.querySelector('.playlist-box').style.display = 'none';
    
    const maxRawPossible = state.maxRounds * 250; 
    const normalizedScores = state.rawScores.map(s => Math.min(1000, Math.round((s / maxRawPossible) * 1000)));
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
        document.getElementById('winner-text').innerText = `🏆 Final Score: ${maxScore} Pts`;
        document.getElementById('winner-text').style.color = colors[0];
        document.getElementById('final-grid').innerHTML = "";
    }
    
    // Add this to the very bottom of endGameSequence() in quoteLogic.js
    state.userStats.who_said_it = state.userStats.who_said_it || { gamesPlayed: 0, highScore: 0 };
    
    if (maxScore > (state.userStats.who_said_it.highScore || 0)) {
        state.userStats.who_said_it.highScore = maxScore;
    }

    state.userStats.who_said_it.gamesPlayed++;
    state.userStats.platformGamesPlayed++;
    
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
}
