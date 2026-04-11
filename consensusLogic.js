// consensusLogic.js
import { db } from './firebase.js';
import { state, sfxTick, sfxCheer, sfxBuzzer, colors } from './state.js';

export const manifest = {
    id: "consensus",
    title: "THE CONSENSUS",
    subtitle: "A Social Party Game",
    hasDaily: false,
    modes: [
        { id: "party_pack", title: "📦 Party Pack", desc: "Play with classic built-in questions." },
        { id: "ai_infinite", title: "✨ Infinite AI", desc: "Generate unique, absurd prompts using OpenAI." }
    ],
    levels: [
        { id: "easy", title: "🟢 Casual", desc: "30s rounds. Relaxed pacing." },
        { id: "medium", title: "🟡 Standard", desc: "20s rounds. Normal debating time." },
        { id: "hard", title: "🔴 Speedrun", desc: "10s rounds. Pure chaos." }
    ],
    clientUI: "dynamic"
};

const ROUND_TYPES = {
    1: "The Finger Point",
    2: "The Great Divide",
    3: "Hive Mind",
    4: "Guilty As Charged",
    5: "Shot In The Dark"
};

export function resetStats() {
    if(confirm("Reset Consensus lifetime stats?")) {
        state.userStats.consensus = { gamesPlayed: 0, highScore: 0 };
        localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
    }
}
export function startDailyChallenge() { alert("Daily mode not enabled for The Consensus"); }
export function handleStop() {}
export function forceLifeline() {}
export function shareChallenge() {}

export function startGame() {
    state.isDailyMode = false;
    state.numPlayers = state.isMultiplayer ? state.numPlayers : 1; 
    state.timeLimit = state.gameState.level === 'easy' ? 30 : 15; 
    state.maxRounds = state.gameState.rounds; 
    state.curIdx = 0;
    state.rawScores = new Array(state.numPlayers).fill(0);
    state.streaks = new Array(state.numPlayers).fill(0);

    state.doubleRounds = [];
    for (let i = 0; i < state.maxRounds; i += 5) {
        let min = i === 0 ? 1 : i; 
        let max = Math.min(i + 4, state.maxRounds - 1);
        if (min <= max) state.doubleRounds.push(Math.floor(Math.random() * (max - min + 1)) + min);
    }

    document.getElementById('start-btn-top').style.display = 'none';
    document.getElementById('feedback-setup').innerText = "Loading Prompts...";
    
    executeFetchLogic();
}

async function executeFetchLogic() {
    const allowedTypes = state.numPlayers > 1 ? [1, 2, 3, 4, 5] : [3, 5]; 
    state.songs = []; 
    
    if (state.gameState.mode === 'ai_infinite') {
        const apiKey = document.getElementById('custom-input').value.trim(); 
        if (!apiKey) {
            alert("Please paste your OpenAI API Key in the custom input box!");
            document.getElementById('start-btn-top').style.display = 'block';
            document.getElementById('feedback-setup').innerText = "";
            return;
        }
        localStorage.setItem('consensus_openai_key', apiKey);
        
        try {
            document.getElementById('feedback-setup').innerText = "Generating absurd AI prompts...";

            let typeInstructions = "";
            if (allowedTypes.includes(1)) typeInstructions += `Type 1 (Who is most likely to): {"type": 1, "prompt": "Who is most likely to..."}. `;
            if (allowedTypes.includes(2)) typeInstructions += `Type 2 (This or That): {"type": 2, "prompt": "Which is superior?", "optA": "...", "optB": "..."}. `;
            if (allowedTypes.includes(3)) typeInstructions += `Type 3 (Survey): {"type": 3, "prompt": "Name a...", "options": ["#1", "#2", "#3", "Fake"]}. `;
            if (allowedTypes.includes(4)) typeInstructions += `Type 4 (Confession): {"type": 4, "prompt": "Raise your hand if..."}. `;
            if (allowedTypes.includes(5)) typeInstructions += `Type 5 (Guesstimation): {"type": 5, "prompt": "Guess the exact number of...", "answer": <int>}. `;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ 
                        role: "system", 
                        // 👇 ADD THE "EQUAL DISTRIBUTION" COMMAND HERE 👇
                        content: `Generate ${state.maxRounds} absurd, G-rated questions for a party game. You MUST ONLY generate questions from the Allowed Types: ${allowedTypes.join(', ')}. You MUST generate an equal number of questions for each allowed type so they are perfectly balanced. Format as JSON object with "questions" array. ${typeInstructions}`
                    }],
                    response_format: { type: "json_object" },
                    temperature: 1.1 
                })
            });
            
            const data = await response.json();
            let generatedQuestions = JSON.parse(data.choices[0].message.content).questions;

            state.songs = generatedQuestions
                .map(q => ({ ...q, type: parseInt(q.type) }))
                .filter(q => allowedTypes.includes(q.type));
            
            if (state.songs.length === 0) throw new Error("AI generated invalid question types.");

            if (state.songs.length < state.maxRounds) {
                const needed = state.maxRounds - state.songs.length;
                const res = await fetch('db_consensus.json');
                const offlineData = await res.json();
                let typeTracker = 0;
                for(let i=0; i<needed; i++) {
                    const t = allowedTypes[typeTracker % allowedTypes.length];
                    const pool = offlineData[`type${t}`];
                    state.songs.push(pool[Math.floor(Math.random() * pool.length)]);
                    typeTracker++;
                }
            }

        } catch(e) {
            console.error(e);
            alert("AI Generation failed or hallucinated. Falling back to Party Pack.");
            state.songs = [];
            await loadOfflineQuestions(allowedTypes);
        }
    } else {
        await loadOfflineQuestions(allowedTypes);
    }

    launchGameUI();
}

async function loadOfflineQuestions(allowedTypes) {
    const response = await fetch('db_consensus.json');
    const data = await response.json();
    let typeTracker = 0;
    
    for (let i = 0; i < state.maxRounds; i++) {
        const type = allowedTypes[typeTracker % allowedTypes.length];
        const pool = data[`type${type}`];
        state.songs.push(pool[Math.floor(Math.random() * pool.length)]);
        typeTracker++;
    }
    state.songs = state.songs.sort(() => 0.5 - Math.random());
}

function launchGameUI() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');
    
    document.querySelectorAll('.header-btn').forEach(btn => btn.classList.add('hidden'));
    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('btn-container').classList.add('hidden');
    document.getElementById('reveal-art').style.display = 'none';

    if (state.isHost) {
        document.getElementById('score-board').innerHTML = '';
    } else {
        document.getElementById('score-board').innerHTML = state.rawScores.map((s, i) => `
            <div class="score-pill" style="border-color:${colors[i % colors.length]};">
                <div class="p-name" style="color:${colors[i % colors.length]}">${state.numPlayers === 1 ? 'SCORE' : 'P'+(i+1)}</div>
                <div class="p-pts" style="color:#fff">${s}</div>
                <div class="p-streak" style="color:${colors[i % colors.length]}; opacity:${state.streaks[i] > 0 ? 1 : 0}">🔥 ${state.streaks[i]}</div>
            </div>`).join('');
    }

    nextRound();
}

function nextRound() {
    if (state.curIdx >= state.maxRounds) { ; return; }
    state.isProcessing = false;
    
    if (state.isHost) {
        document.getElementById('score-board').innerHTML = ''; // Keep clean during prompts
        
        // FIX #1: Update current round in Firebase so phones sync!
        db.ref(`rooms/${state.roomCode}/currentRound`).set(state.curIdx + 1);
        
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            if(snap.exists()) {
                let updates = {};
                snap.forEach(p => { 
                    updates[`${p.key}/guess1`] = null; 
                    updates[`${p.key}/guess2`] = null; 
                    updates[`${p.key}/status`] = 'guessing'; 
                });
                db.ref(`rooms/${state.roomCode}/players`).update(updates);
            }
        });
    }

    const q = state.songs[state.curIdx];
    const isDouble = state.doubleRounds.includes(state.curIdx);
    const tag = document.getElementById('active-player');
    tag.innerText = `${ROUND_TYPES[q.type]} (Round ${state.curIdx + 1}/${state.maxRounds}) ${isDouble ? '🔥 2X BONUS' : ''}`;
    tag.style.color = isDouble ? "#ffcc00" : "var(--highlight)";
    tag.style.borderColor = isDouble ? "#ffcc00" : "var(--highlight)";

    let subText = "Check your phone to answer!";
    if(state.numPlayers === 1) subText = q.type === 3 ? "Pick the #1 Survey Answer!" : "Type your closest guess!";
    
    document.getElementById('feedback').innerHTML = `
        <div style="font-size:2.5rem; font-weight:900; color:#fff; margin-bottom:10px;">${q.prompt}</div>
        <div style="color:var(--p4); font-weight:bold; text-transform:uppercase;">${subText}</div>
        ${state.isHost ? `<div id="host-lock-status" style="color:var(--brand); font-size:1.3rem; font-weight:bold; margin-top:20px;">LOCKED IN: 0 / ${state.numPlayers}</div>` : ''}
    `;

    if (state.isHost) {
        db.ref(`rooms/${state.roomCode}/hostState`).set({ phase: 'input', type: q.type, qData: q, isDouble: isDouble });
    } else if (state.numPlayers === 1) {
        renderSoloUI(q);
    }

    state.timeLeft = state.timeLimit;
    document.getElementById('timer').innerText = state.timeLeft;
    document.getElementById('timer').style.color = 'var(--highlight)';

    state.timerId = setInterval(() => {
        state.timeLeft--;
        document.getElementById('timer').innerText = state.timeLeft;
        if (state.isHost) db.ref(`rooms/${state.roomCode}/timeLeft`).set(state.timeLeft);

        if (state.timeLeft <= 3 && state.timeLeft > 0) sfxTick.play().catch(()=>{});

        if (state.timeLeft <= 0) {
            clearInterval(state.timerId);
            if (state.isHost) {
                db.ref(`rooms/${state.roomCode}/players`).once('value', snap => evaluateMultiplayerRound(snap.val()));
            } else {
                evaluateSoloGuess(); 
            }
        }
    }, 1000);
}

// --- DYNAMIC CLIENT UI HOOK ---
export function renderClientUI(hostState) {
    const container = document.getElementById('client-consensus-ui');
    const promptDiv = document.getElementById('client-prompt');
    if (!container) return; 
    
    if (hostState.phase === 'reveal' || hostState.phase === 'gameover') {
        if(promptDiv) promptDiv.innerText = "";
        container.innerHTML = `<div style="font-size:1.5rem; color:var(--text-muted); font-weight:bold; margin-top:40px;">Look at the TV!</div>`;
        return;
    }

    let html = "";
    const q = hostState.qData;
    
    if(promptDiv && q) {
        promptDiv.innerText = q.prompt;
        promptDiv.classList.remove('hidden');
    }

    if (hostState.type === 1) {
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            let inner = "";
            snap.forEach(p => {
                const isMe = p.key === state.myPlayerId;
                inner += `<button class="mc-btn" ${isMe ? 'disabled' : ''} onclick="submitConsensusGuess('guess1', '${p.key}')">${p.val().name} ${isMe ? '(You)' : ''}</button>`;
            });
            container.innerHTML = inner;
        });
        return; 
    } 
    else if (hostState.type === 2) {
        html += `<div style="text-align:left; background:rgba(0,0,0,0.2); padding:15px; border-radius:12px; margin-bottom:15px; border:1px solid var(--border);">
                    <div style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; font-weight:bold;">1. Your Pick</div>
                    <select id="t2-g1" style="width:100%; padding:15px; background:var(--surface); color:#fff; border:2px solid var(--border); border-radius:8px; font-size:1.1rem; margin-bottom:15px; outline:none;">
                        <option value="" disabled selected>Select your answer...</option>
                        <option value="A">${q.optA}</option>
                        <option value="B">${q.optB}</option>
                    </select>
                    <div style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; font-weight:bold;">2. Room Prediction</div>
                    <select id="t2-g2" style="width:100%; padding:15px; background:var(--surface); color:#fff; border:2px solid var(--border); border-radius:8px; font-size:1.1rem; outline:none;">
                        <option value="" disabled selected>What will the majority pick?</option>
                        <option value="A">${q.optA}</option>
                        <option value="B">${q.optB}</option>
                    </select>
                </div>`;
        html += `<button class="btn btn-main" onclick="submitConsensusGuess({guess1: document.getElementById('t2-g1').value, guess2: document.getElementById('t2-g2').value})">LOCK IT IN</button>`;
    }
    else if (hostState.type === 3) {
        q.options.forEach((opt, idx) => {
            html += `<button class="mc-btn" onclick="submitConsensusGuess('guess1', ${idx})">${opt}</button>`;
        });
    }
    else if (hostState.type === 4) {
        html += `<div style="text-align:left; background:rgba(0,0,0,0.2); padding:15px; border-radius:12px; margin-bottom:15px; border:1px solid var(--border);">
                    <div style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; font-weight:bold;">1. The Truth</div>
                    <select id="t4-g1" style="width:100%; padding:15px; background:var(--surface); color:#fff; border:2px solid var(--border); border-radius:8px; font-size:1.1rem; margin-bottom:15px; outline:none;">
                        <option value="" disabled selected>Have you done it?</option>
                        <option value="true">🖐️ Yes, I have</option>
                        <option value="false">No / Skip</option>
                    </select>
                    <div style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; font-weight:bold;">2. Room Prediction</div>
                    <input type="number" id="t4-g2" placeholder="How many total hands?" style="width:100%; padding:15px; background:var(--surface); color:#fff; border:2px solid var(--border); border-radius:8px; font-size:1.1rem; outline:none;">
                </div>`;
        html += `<button class="btn btn-main" onclick="submitConsensusGuess({guess1: document.getElementById('t4-g1').value === 'true', guess2: document.getElementById('t4-g2').value})">LOCK IT IN</button>`;
    }
    else if (hostState.type === 5) {
        html += `<input type="number" id="cons-num" placeholder="Your Exact Guess" style="margin-bottom:15px; width:100%; padding:15px; background:var(--surface); color:#fff; border:2px solid var(--border); border-radius:8px; font-size:1.2rem; outline:none; text-align:center;">`;
        html += `<button class="btn btn-main" onclick="submitConsensusGuess('guess1', document.getElementById('cons-num').value)">SUBMIT</button>`;
    }

    container.innerHTML = html;
}

window.submitConsensusGuess = (payload, optionalVal) => {
    if (typeof payload === 'object') {
        if (!payload.guess1 && payload.guess1 !== false && payload.guess1 !== 0) return alert("Please select an option for Part 1!");
        if (!payload.guess2 && payload.guess2 !== false && payload.guess2 !== 0) return alert("Please enter a prediction for Part 2!");
        payload.status = 'locked'; 
        db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update(payload);
    } else {
        if (!optionalVal && optionalVal !== 0) return alert("Please enter a value!");
        db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update({ [payload]: optionalVal, status: 'locked' }); 
    }
    document.getElementById('client-consensus-ui').innerHTML = `<h2 style="color:var(--success); font-size:2.5rem; margin-top:30px;">Locked In!</h2><p style="color:var(--text-muted);">Look at the TV.</p>`;
};

// --- SOLO UI LOGIC ---
function renderSoloUI(q) {
    const mcFields = document.getElementById('mc-fields');
    mcFields.innerHTML = ""; mcFields.classList.remove('hidden');
    document.getElementById('btn-container').classList.add('hidden');

    if (q.type === 3) {
        q.options.forEach((opt, idx) => {
            const btn = document.createElement('button'); btn.className = 'mc-btn'; btn.innerText = opt;
            btn.onclick = () => { state.soloGuess = idx; evaluateSoloGuess(); };
            mcFields.appendChild(btn);
        });
    } else if (q.type === 5) {
        mcFields.innerHTML = `<input type="number" id="solo-num" placeholder="Your Exact Guess" style="width:100%; padding:15px; background:var(--surface); border:2px solid var(--border); border-radius:8px; color:#fff; font-size:1.2rem; outline:none; margin-bottom:10px;">
                              <button class="btn btn-main" onclick="window.activeCartridge.evaluateSoloGuess('num')">SUBMIT</button>`;
    }
}

export function evaluateSoloGuess(source) {
    if (state.isProcessing) return;
    
    if (source === 'num') {
        state.soloGuess = document.getElementById('solo-num').value;
        if (state.soloGuess === "") {
            alert("Please enter a guess!");
            return;
        }
    }
    
    state.isProcessing = true;
    clearInterval(state.timerId);
    
    document.getElementById('mc-fields').classList.add('hidden');
    let roundPts = 0;
    const q = state.songs[state.curIdx];
    const isDouble = state.doubleRounds.includes(state.curIdx);
    const mult = isDouble ? 2 : 1;
    let fb = "";

    if (q.type === 3) {
        if (state.soloGuess === 0) roundPts = 300 * mult;
        else if (state.soloGuess === 1) roundPts = 200 * mult;
        else if (state.soloGuess === 2) roundPts = 100 * mult;
        
        fb = `Top Answer: <strong style="color:var(--brand)">${q.options[0]}</strong><br>#2: ${q.options[1]}<br>#3: ${q.options[2]}`;
    } else if (q.type === 5) {
        const diff = Math.abs(q.answer - parseInt(state.soloGuess || 0));
        if (diff === 0) roundPts = 300 * mult; 
        else if (diff <= q.answer * 0.1) roundPts = 200 * mult; 
        else if (diff <= q.answer * 0.25) roundPts = 100 * mult; 
        
        const guessDisplay = state.soloGuess ? state.soloGuess : "Time's Up";
        fb = `Actual Answer: <strong style="color:var(--brand)">${q.answer}</strong> (You guessed ${guessDisplay})`;
    }

    if (roundPts > 0) {
        state.streaks[0]++;
        if (state.streaks[0] > 0 && state.streaks[0] % 3 === 0) roundPts += 50; 
        state.rawScores[0] += roundPts;
        sfxCheer.play().catch(()=>{});
        document.getElementById('feedback').innerHTML = `<div style="color:var(--success); font-size:1.5rem; font-weight:bold;">✅ +${roundPts} POINTS</div><div style="font-size:1.1rem; margin-top:10px;">${fb}</div>`;
    } else {
        state.streaks[0] = 0;
        sfxBuzzer.play().catch(()=>{});
        document.getElementById('feedback').innerHTML = `<div style="color:var(--fail); font-size:1.5rem; font-weight:bold; margin-bottom:5px;">❌ INCORRECT</div><div style="font-size:1.1rem; margin-top:10px;">${fb}</div>`;
    }

    document.getElementById('score-board').innerHTML = `<div class="score-pill" style="border-color:${colors[0]}"><div class="p-name">SCORE</div><div class="p-pts">${state.rawScores[0]}</div><div class="p-streak">🔥 ${state.streaks[0]}</div></div>`;
    state.curIdx++; setTimeout(nextRound, 4000);
}

// --- MULTIPLAYER SCORING ENGINE ---
export function evaluateMultiplayerRound(players) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearInterval(state.timerId);

    const q = state.songs[state.curIdx];
    const isDouble = state.doubleRounds.includes(state.curIdx);
    const mult = isDouble ? 2 : 1;
    let roundEarnings = {}; 
    const pIds = Object.keys(players || {});
    pIds.forEach(pid => roundEarnings[pid] = 0);

    let revealHTML = "";

    if (q.type === 1) {
        let votes = {};
        pIds.forEach(pid => { if(players[pid].guess1) votes[players[pid].guess1] = (votes[players[pid].guess1] || 0) + 1; });
        let voteGroups = {};
        Object.keys(votes).forEach(pid => { let v = votes[pid]; if(!voteGroups[v]) voteGroups[v] = []; voteGroups[v].push(pid); });
        let sorted = Object.keys(voteGroups).map(Number).sort((a,b) => b - a);

        if(sorted.length > 0) {
            let names = voteGroups[sorted[0]].map(pid => players[pid]?.name || 'Nobody').join(" & ");
            revealHTML = `Most Voted: <strong style="color:var(--brand)">${names}</strong> (${sorted[0]} votes)`;
            if(sorted[0]) voteGroups[sorted[0]].forEach(pid => roundEarnings[pid] = 300 * mult);
            if(sorted[1]) voteGroups[sorted[1]].forEach(pid => roundEarnings[pid] = 200 * mult);
            if(sorted[2]) voteGroups[sorted[2]].forEach(pid => roundEarnings[pid] = 100 * mult);
        } else revealHTML = `Most Voted: Nobody`;
    } 
    else if (q.type === 2) {
        let aVotes = 0, bVotes = 0;
        pIds.forEach(pid => { if(players[pid].guess1 === 'A') aVotes++; else if(players[pid].guess1 === 'B') bVotes++; });
        let roomWinner = aVotes > bVotes ? 'A' : (bVotes > aVotes ? 'B' : 'Tie');
        revealHTML = `The Room Chose: <strong style="color:var(--brand)">${roomWinner === 'A' ? q.optA : (roomWinner === 'B' ? q.optB : 'Tie')}</strong>`;
        pIds.forEach(pid => { if (players[pid].guess2 === roomWinner) roundEarnings[pid] = 300 * mult; });
    }
    else if (q.type === 3) {
        revealHTML = `Top Answer: <strong style="color:var(--brand)">${q.options[0]}</strong><br>#2: ${q.options[1]}<br>#3: ${q.options[2]}`;
        pIds.forEach(pid => {
            let g = players[pid].guess1;
            let pts = g === 0 ? 300 : (g === 1 ? 200 : (g === 2 ? 100 : 0));
            roundEarnings[pid] = pts * mult;
        });
    }
    else if (q.type === 4) {
        let raised = 0;
        pIds.forEach(pid => { if(players[pid].guess1 === true) raised++; });
        revealHTML = `Total Hands Raised: <strong style="color:var(--brand)">${raised}</strong>`;
        pIds.forEach(pid => { if (parseInt(players[pid].guess2) === raised) roundEarnings[pid] = 300 * mult; });
    }
    else if (q.type === 5) {
        revealHTML = `Actual Answer: <strong style="color:var(--brand)">${q.answer}</strong>`;
        let diffs = [];
        pIds.forEach(pid => { if(players[pid].guess1) diffs.push({ pid: pid, diff: Math.abs(q.answer - parseInt(players[pid].guess1)) }); });
        let diffGroups = {};
        diffs.forEach(d => { if(!diffGroups[d.diff]) diffGroups[d.diff] = []; diffGroups[d.diff].push(d.pid); });
        let sorted = Object.keys(diffGroups).map(Number).sort((a,b) => a - b);

        if(sorted.length > 0) {
            let names = diffGroups[sorted[0]].map(pid => players[pid]?.name || 'Nobody').join(" & ");
            revealHTML += `<br>Closest: <strong style="color:var(--p2)">${names}</strong> (Off by ${sorted[0]})`;
            if(sorted[0] !== undefined) diffGroups[sorted[0]].forEach(pid => roundEarnings[pid] = 300 * mult);
            if(sorted[1] !== undefined) diffGroups[sorted[1]].forEach(pid => roundEarnings[pid] = 200 * mult);
            if(sorted[2] !== undefined) diffGroups[sorted[2]].forEach(pid => roundEarnings[pid] = 100 * mult);
        }
    }

    let fbHTML = `<div style="font-size:1.3rem; margin-bottom:15px; color:#fff;">${revealHTML}</div><div style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px;">`;
    pIds.forEach((pid, index) => {
        if (roundEarnings[pid] > 0) {
            state.streaks[index]++;
            if (state.streaks[index] > 0 && state.streaks[index] % 3 === 0) roundEarnings[pid] += 50; 
            state.rawScores[index] += roundEarnings[pid];
            fbHTML += `<div style="background:var(--surface); border:1px solid var(--success); padding:8px 12px; border-radius:8px; color:var(--success); font-weight:bold; font-size:0.9rem;">✅ ${players[pid].name}: +${roundEarnings[pid]}</div>`;
        } else {
            state.streaks[index] = 0;
            fbHTML += `<div style="background:var(--surface); border:1px solid var(--fail); padding:8px 12px; border-radius:8px; color:var(--fail); font-weight:bold; font-size:0.9rem;">❌ ${players[pid].name}: 0</div>`;
        }
    });

    db.ref(`rooms/${state.roomCode}/hostState`).set({ phase: 'reveal' });

    document.getElementById('feedback').innerHTML = fbHTML + `</div>`;
    
    document.getElementById('score-board').innerHTML = state.rawScores.map((s, i) => `
        <div class="score-pill" style="border-color:${colors[i % colors.length]};">
            <div class="p-name" style="color:${colors[i % colors.length]}">P${i+1}</div>
            <div class="p-pts" style="color:#fff">${s}</div>
            <div class="p-streak" style="color:${colors[i % colors.length]}; opacity:${state.streaks[i] > 0 ? 1 : 0}">🔥 ${state.streaks[i]}</div>
        </div>`).join('');

    state.curIdx++; setTimeout(nextRound, 7000); 
}

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
            let results = Object.keys(players).map((pid, idx) => {
                db.ref(`rooms/${state.roomCode}/players/${pid}`).update({ finalScore: state.rawScores[idx] });
                return { name: players[pid].name, score: state.rawScores[idx] };
            });
            
            results.sort((a, b) => b.score - a.score);
            let podium = `<div style="margin-top: 15px; text-align: left; background: var(--surface); padding: 15px; border-radius: 12px; border: 1px solid var(--border);"><h3 style="margin-top:0; color:var(--brand); text-align:center; text-transform:uppercase; margin-bottom:15px;">Final Standings</h3>`;
            results.forEach((p, idx) => {
                let medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : '👏'));
                let color = idx === 0 ? 'var(--p1)' : (idx === 1 ? 'var(--p2)' : '#ccc');
                podium += `<div style="display:flex; justify-content:space-between; padding: 12px 5px; border-bottom: 1px solid #333; font-size: 1.3rem; font-weight: bold; color: ${color};"><span>${medal} ${p.name}</span><span style="font-family:'Courier New', monospace;">${p.score}</span></div>`;
            });
            document.getElementById('winner-text').innerHTML = podium + `</div>`;
            db.ref(`rooms/${state.roomCode}/state`).set('finished');
        });
    } else {
        document.getElementById('winner-text').innerText = `🏆 Final Score: ${state.rawScores[0]} Pts`;
        document.getElementById('winner-text').style.color = colors[0];
        document.getElementById('final-grid').innerHTML = ""; // Clears any grid leftovers from Trivia
    }

    state.userStats.consensus = state.userStats.consensus || { gamesPlayed: 0, highScore: 0 };
    const maxScore = Math.max(...state.rawScores);
    if (maxScore > (state.userStats.consensus.highScore || 0)) state.userStats.consensus.highScore = maxScore;
    state.userStats.consensus.gamesPlayed++;
    state.userStats.platformGamesPlayed++;
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
}
