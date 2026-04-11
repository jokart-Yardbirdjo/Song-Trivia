// consensusLogic.js
import { db } from './firebase.js';
import { state, sfxTick, sfxCheer, sfxBuzzer, colors } from './state.js';

export const manifest = {
    id: "consensus",
    title: "THE CONSENSUS",
    subtitle: "A Social Party Game",
    modes: [
        { id: "party_pack", title: "📦 Party Pack", desc: "Play with classic built-in questions." },
        { id: "ai_infinite", title: "✨ Infinite AI", desc: "Generate unique, absurd prompts using OpenAI." }
    ],
    levels: [
        { id: "easy", title: "🟢 Casual", desc: "30s rounds. Relaxed pacing." },
        { id: "hard", title: "🔴 Speedrun", desc: "15s rounds. Pure chaos." }
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

export function startDailyChallenge() { 
    alert("Daily mode not enabled for The Consensus yet!"); 
}

export function handleStop() {
    clearInterval(state.timerId);
    state.isProcessing = false;
}

export function forceLifeline() {}

export function shareChallenge() {
    const modeName = state.gameState.mode === 'ai_infinite' ? 'Infinite AI' : 'Party Pack';
    let shareText = `I just scored ${state.rawScores[0]} points in The Consensus (${modeName})! Think you can read the room better?`;
    
    if (navigator.share) {
        navigator.share({
            title: "Yardbird's Games",
            text: shareText,
            url: window.location.href
        }).catch(err => console.log("Share failed:", err));
    } else {
        navigator.clipboard.writeText(shareText + " " + window.location.href);
        alert("Score copied to clipboard!");
    }
}

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
            if (allowedTypes.includes(5)) typeInstructions += `Type 5 (Guesstimation): {"type": 5, "prompt": "A factual numeric guess question...", "answer": <int>}. Important: DO NOT generate questions about how many jellybeans (or objects) fit inside a container. Prioritize variety like speed, weight, population, time, distance, or cost. `;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{ 
                        role: "system", 
                        // UPDATED: Stricter instruction to ensure equal distribution
                        content: `Generate EXACTLY ${state.maxRounds} absurd, G-rated questions for a party game. You MUST ONLY generate questions from the Allowed Types: ${allowedTypes.join(', ')}. You MUST provide an equal distribution of these types. Format as JSON object with "questions" array. ${typeInstructions}`
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
            
            // NEW: Force a shuffle of the AI questions so they don't play sequentially by type
            state.songs = state.songs.sort(() => 0.5 - Math.random());
            
            if (state.songs.length === 0) throw new Error("AI generated invalid question types.");

            if (state.songs.length < state.maxRounds) {
                const needed = state.maxRounds - state.songs.length;
                const res = await fetch('db_consensus.json');
                const offlineData = await res.json();
                
                // NEW FIX: Shuffle all the backup pools first
                allowedTypes.forEach(t => {
                    if (offlineData[`type${t}`]) {
                        offlineData[`type${t}`] = offlineData[`type${t}`].sort(() => 0.5 - Math.random());
                    }
                });

                let typeTracker = 0;
                for(let i=0; i<needed; i++) {
                    const t = allowedTypes[typeTracker % allowedTypes.length];
                    const pool = offlineData[`type${t}`];
                    
                    // NEW FIX: Pop the question out so it can't be drawn again
                    if (pool && pool.length > 0) {
                        let rawQ = pool.pop();
                        state.songs.push({ ...rawQ, type: t }); 
                    }
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
    
    // NEW FIX: Shuffle every pool so we can draw cards from the top
    allowedTypes.forEach(t => {
        if (data[`type${t}`]) {
            data[`type${t}`] = data[`type${t}`].sort(() => 0.5 - Math.random());
        }
    });

    let typeTracker = 0;
    
    for (let i = 0; i < state.maxRounds; i++) {
        const type = allowedTypes[typeTracker % allowedTypes.length];
        const pool = data[`type${type}`];
        
        // NEW FIX: Pop the question out of the pool so it can't be picked again this game
        if (pool && pool.length > 0) {
            const rawQ = pool.pop();
            state.songs.push({ ...rawQ, type: type });
        }
        typeTracker++;
    }
    state.songs = state.songs.sort(() => 0.5 - Math.random());
}

function launchGameUI() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');
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
    if (state.curIdx >= state.maxRounds) { endGameSequence(); return; }
    state.isProcessing = false;
    
    // 👇 FIX: We MUST define the question 'q' at the very top before doing anything else!
    const q = state.songs[state.curIdx];
    const isDouble = state.doubleRounds.includes(state.curIdx);

    if (state.isHost) {
        document.getElementById('score-board').innerHTML = ''; 
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

        const currentType = parseInt(q.type) || 5; 
        
        // Sanitize the payload to completely eliminate 'undefined' crashes
        const safeQData = {
            type: currentType,
            prompt: q.prompt || "Check TV for prompt",
            answer: q.answer || 0,
            optA: q.optA || "",
            optB: q.optB || "",
            options: q.options || []
        };
        
        db.ref(`rooms/${state.roomCode}/hostState`).set({ 
            phase: 'input', 
            type: currentType, 
            qData: safeQData, 
            isDouble: !!isDouble 
        });
    } else if (state.numPlayers === 1) {
        renderSoloUI(q);
    }

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
    
    window.consensusTempPayload = { guess1: null, guess2: null }; 

    if (hostState.phase === 'loading') {
        if(promptDiv) { promptDiv.innerText = ""; promptDiv.classList.add('hidden'); }
        container.innerHTML = `<div style="font-size:1.5rem; color:var(--brand); font-weight:bold; margin-top:40px;">Loading Prompts...<br><span style="font-size:1rem; color:var(--text-muted);">Get ready!</span></div>`;
        return;
    }

    if (hostState.phase === 'reveal' || hostState.phase === 'gameover') {
        if(promptDiv) { promptDiv.innerText = ""; promptDiv.classList.add('hidden'); }
        container.innerHTML = `<div style="font-size:1.8rem; color:var(--text-muted); font-weight:bold; margin-top:40px;">Look at the TV!</div>`;
        return;
    }

    let html = "";
    
    // Safety Fallbacks
    const q = hostState.qData || {};
    const type = parseInt(hostState.type || q.type);
    
    if(promptDiv && q.prompt) {
        promptDiv.innerText = q.prompt;
        promptDiv.classList.remove('hidden');
    }

    if (type === 1) {
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            let inner = "";
            if (snap.exists()) {
                snap.forEach(p => {
                    const isMe = p.key === state.myPlayerId;
                    inner += `<button class="mc-btn touch-opt" onclick="setConsensusLocalGuess('guess1', '${p.key}'); submitConsensusPayload(true, 1)">${p.val().name} ${isMe ? '(You)' : ''}</button>`;
                });
            }
            container.innerHTML = inner;
        });
        return; 
    } 
    else if (type === 2) {
        html += `
            <div style="text-align:left; background:rgba(0,0,0,0.2); padding:15px; border-radius:12px; margin-bottom:15px; border:1px solid var(--border);">
                
                <div id="t2-part1-container" style="transition: all 0.3s ease;">
                    <div style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; font-weight:bold;">1. Your Pick</div>
                    <div style="display:flex; gap:10px; margin-bottom:15px;">
                        <button id="t2-g1-A" class="touch-opt mc-btn" style="margin:0; flex:1;" onclick="setConsensusLocalGuess('guess1', 'A')">${q.optA || 'Option A'}</button>
                        <button id="t2-g1-B" class="touch-opt mc-btn" style="margin:0; flex:1;" onclick="setConsensusLocalGuess('guess1', 'B')">${q.optB || 'Option B'}</button>
                    </div>
                </div>
                
                <div id="t2-part2-container" style="opacity:0.3; pointer-events:none; transition: all 0.3s ease;">
                    <div style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; font-weight:bold;">2. Room Prediction</div>
                    <div style="display:flex; gap:10px;">
                        <button id="t2-g2-A" class="touch-opt mc-btn" style="margin:0; flex:1;" onclick="setConsensusLocalGuess('guess2', 'A')">${q.optA || 'Option A'}</button>
                        <button id="t2-g2-B" class="touch-opt mc-btn" style="margin:0; flex:1;" onclick="setConsensusLocalGuess('guess2', 'B')">${q.optB || 'Option B'}</button>
                    </div>
                </div>

            </div>`;
        html += `<button class="btn btn-main" onclick="submitConsensusPayload(false, 2)">LOCK IT IN</button>`;
    }
    else if (type === 3) {
        if (q.options) {
            q.options.forEach((opt, idx) => {
                html += `<button class="mc-btn touch-opt" onclick="setConsensusLocalGuess('guess1', ${idx}); submitConsensusPayload(true, 3)">${opt}</button>`;
            });
        }
    }
    else if (type === 4) {
        html += `
            <div style="text-align:left; background:rgba(0,0,0,0.2); padding:15px; border-radius:12px; margin-bottom:15px; border:1px solid var(--border);">
                
                <div id="t4-part1-container" style="transition: all 0.3s ease;">
                    <div style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; font-weight:bold;">1. The Truth</div>
                    <div style="display:flex; gap:10px; margin-bottom:15px;">
                        <button id="t4-g1-true" class="touch-opt mc-btn" style="margin:0; flex:1; font-size:3rem; padding:10px;" onclick="setConsensusLocalGuess('guess1', true)">👍</button>
                        <button id="t4-g1-false" class="touch-opt mc-btn" style="margin:0; flex:1; font-size:3rem; padding:10px;" onclick="setConsensusLocalGuess('guess1', false)">👎</button>
                    </div>
                </div>
                
                <div id="t4-part2-container" style="opacity:0.3; pointer-events:none; transition: all 0.3s ease;">
                    <div style="font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px; font-weight:bold;">2. Prediction</div>
                    <input type="number" id="t4-g2" placeholder="How many 👍 total?" style="width:100%; padding:15px; background:var(--surface); color:#fff; border:2px solid var(--border); border-radius:8px; font-size:1.1rem; outline:none;" disabled oninput="window.consensusTempPayload.guess2 = this.value">
                </div>

            </div>`;
        html += `<button class="btn btn-main" onclick="submitConsensusPayload(false, 4)">LOCK IT IN</button>`;
    }
    else if (type === 5) {
        html += `<input type="number" id="cons-num" placeholder="Your Exact Guess" style="margin-bottom:15px; width:100%; padding:15px; background:var(--surface); color:#fff; border:2px solid var(--border); border-radius:8px; font-size:1.2rem; outline:none; text-align:center;" oninput="window.consensusTempPayload.guess1 = this.value">`;
        html += `<button class="btn btn-main" onclick="submitConsensusPayload(true, 5)">SUBMIT</button>`;
    } else {
        html = `<div style="color:var(--fail)">Loading UI...</div>`;
    }

    container.innerHTML = html;
}

window.setConsensusLocalGuess = (part, value) => {
    window.consensusTempPayload[part] = value;
    if (window.activeCartridge.manifest.id !== 'consensus') return; 
    
    if(part === 'guess1' && (value === 'A' || value === 'B')) { 
        document.getElementById('t2-g1-A').classList.remove('active'); document.getElementById('t2-g1-B').classList.remove('active');
        document.getElementById(`t2-g1-${value}`).classList.add('active');
        
        document.getElementById('t2-part1-container').style.opacity = '0.5';
        document.getElementById('t2-part1-container').style.pointerEvents = 'none';
        document.getElementById('t2-part2-container').style.opacity = '1';
        document.getElementById('t2-part2-container').style.pointerEvents = 'auto';

    } else if(part === 'guess2' && (value === 'A' || value === 'B')) { 
        document.getElementById('t2-g2-A').classList.remove('active'); document.getElementById('t2-g2-B').classList.remove('active');
        document.getElementById(`t2-g2-${value}`).classList.add('active');
    
    } else if(part === 'guess1' && typeof value === 'boolean') { 
        document.getElementById('t4-g1-true').classList.remove('active'); document.getElementById('t4-g1-false').classList.remove('active');
        document.getElementById(`t4-g1-${value}`).classList.add('active');
        
        document.getElementById('t4-part1-container').style.opacity = '0.5';
        document.getElementById('t4-part1-container').style.pointerEvents = 'none';
        document.getElementById('t4-part2-container').style.opacity = '1';
        document.getElementById('t4-part2-container').style.pointerEvents = 'auto';

        const predictInput = document.getElementById('t4-g2');
        if (predictInput) {
            predictInput.disabled = false;
            predictInput.focus();
        }
    }
};

window.submitConsensusPayload = (isSinglePart = false, roundType = null) => {
    const payload = window.consensusTempPayload;
    
    if (payload.guess1 === null || payload.guess1 === "") {
        return alert(isSinglePart ? "Please make a selection!" : "Please select an option for Part 1!");
    }

    if (!isSinglePart) {
        if (payload.guess2 === null || payload.guess2 === "") {
            return alert("Please make a prediction for Part 2!");
        }
        if (roundType === 4 && typeof payload.guess2 === 'string') {
            payload.guess2 = parseInt(payload.guess2, 10);
            if (isNaN(payload.guess2)) return alert("Please enter a valid number for Part 2!");
        }
    }

    payload.status = 'locked'; 
    db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update(payload);
    
    document.getElementById('client-consensus-ui').innerHTML = `<h2 style="color:var(--success); font-size:2.5rem; margin-top:30px;">🔐 Locked In!</h2><p style="color:var(--text-muted);">Look at the TV.</p>`;
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
        
        fb = `Actual Answer: <strong style="color:var(--brand)">${q.answer}</strong> (You guessed ${state.soloGuess || 0})`;
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
        document.getElementById('feedback').innerHTML = `<div style="color:var(--fail); font-size:1.5rem; font-weight:bold;">❌ 0 POINTS</div><div style="font-size:1.1rem; margin-top:10px;">${fb}</div>`;
    }

    if (state.curIdx + 1 < state.maxRounds) {
        document.getElementById('feedback').innerHTML += `<div style="margin-top:25px; font-size:1.2rem; color:var(--text-muted); font-weight:bold; text-transform:uppercase;">Next round loading...</div>`;
    } else {
        document.getElementById('feedback').innerHTML += `<div style="margin-top:25px; font-size:1.2rem; color:var(--text-muted); font-weight:bold; text-transform:uppercase;">Calculating final scores...</div>`;
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
    
    const pIds = Object.keys(players || {}).sort();
    pIds.forEach(pid => roundEarnings[pid] = 0);

    let revealHTML = "";

    if (q.type === 1) {
        let votes = {};
        pIds.forEach(pid => { if(players[pid].guess1) votes[players[pid].guess1] = (votes[players[pid].guess1] || 0) + 1; });
        
        let voteGroups = {};
        Object.keys(votes).forEach(pid => { let v = votes[pid]; if(!voteGroups[v]) voteGroups[v] = []; voteGroups[v].push(pid); });
        
        let sorted = Object.keys(voteGroups).map(Number).sort((a,b) => b - a);

        if(sorted.length > 0) {
            let topTierIds = voteGroups[sorted[0]];
            let names = topTierIds.map(pid => players[pid]?.name || 'Nobody').join(" & ");
            let tieTxt = topTierIds.length > 1 ? " (It's a tie!)" : "";
            
            revealHTML = `Most Voted${tieTxt}: <strong style="color:var(--brand)">${names}</strong> (${sorted[0]} votes)`;
            
            if(sorted[0] !== undefined) voteGroups[sorted[0]].forEach(pid => roundEarnings[pid] = 300 * mult);
            if(sorted[1] !== undefined) voteGroups[sorted[1]].forEach(pid => roundEarnings[pid] = 200 * mult);
            if(sorted[2] !== undefined) voteGroups[sorted[2]].forEach(pid => roundEarnings[pid] = 100 * mult);
        } else revealHTML = `Most Voted: Nobody`;
    } 
    else if (q.type === 2) {
        let aVotes = 0, bVotes = 0;
        pIds.forEach(pid => { if(players[pid].guess1 === 'A') aVotes++; else if(players[pid].guess1 === 'B') bVotes++; });
        let roomWinner = aVotes > bVotes ? 'A' : (bVotes > aVotes ? 'B' : 'Tie');
        
        // UPDATED: Distinct UI message for a tie
        if (roomWinner === 'Tie') {
            revealHTML = `<div style="color:var(--brand)">It's a Tie! Both sides win.</div>`;
        } else {
            revealHTML = `The Room Chose: <strong style="color:var(--brand)">${roomWinner === 'A' ? q.optA : q.optB}</strong>`;
        }
        
        pIds.forEach(pid => { 
            // UPDATED: If it's a tie, anyone who made a valid prediction gets points
            if (roomWinner === 'Tie' && (players[pid].guess2 === 'A' || players[pid].guess2 === 'B')) {
                roundEarnings[pid] = 300 * mult;
            } else if (players[pid].guess2 === roomWinner) {
                roundEarnings[pid] = 300 * mult; 
            }
        });
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
        revealHTML = `👍 Total Thumbs Up: <strong style="color:var(--brand)">${raised}</strong>`;
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

    document.getElementById('score-board').innerHTML = ''; 

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

    fbHTML += `</div>`; 

    if (state.curIdx + 1 < state.maxRounds) {
        fbHTML += `<div style="width:100%; text-align:center; margin-top:25px; font-size:1.2rem; color:var(--text-muted); font-weight:bold; text-transform:uppercase;">Next round loading...</div>`;
    } else {
        fbHTML += `<div style="width:100%; text-align:center; margin-top:25px; font-size:1.2rem; color:var(--text-muted); font-weight:bold; text-transform:uppercase;">Calculating final scores...</div>`;
    }

    db.ref(`rooms/${state.roomCode}/hostState`).set({ phase: 'reveal' });
    document.getElementById('feedback').innerHTML = fbHTML;
    
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
            const pIds = Object.keys(players || {}).sort();
            let results = pIds.map((pid, idx) => {
                db.ref(`rooms/${state.roomCode}/players/${pid}`).update({ finalScore: state.rawScores[idx] });
                return { name: players[pid].name, score: state.rawScores[idx] };
            });
            
            results.sort((a, b) => b.score - a.score);
            // NEW: Push the final sorted leaderboard to the room for clients to read
            db.ref(`rooms/${state.roomCode}/finalLeaderboard`).set(results);
            let podium = `<div style="text-align: left; background: var(--surface); padding: 15px; border-radius: 12px; border: 1px solid var(--border);">`;
            results.forEach((p, idx) => {
                let medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : '👏'));
                let color = idx === 0 ? 'var(--p1)' : (idx === 1 ? 'var(--p2)' : '#ccc');
                podium += `<div style="display:flex; justify-content:space-between; padding: 12px 5px; border-bottom: 1px solid #333; font-size: 1.3rem; font-weight: bold; color: ${color};"><span>${medal} ${p.name}</span><span>${p.score}</span></div>`;
            });
            document.getElementById('winner-text').innerHTML = podium + `</div>`;
            db.ref(`rooms/${state.roomCode}/state`).set('finished');
        });
    } else {
        document.getElementById('winner-text').innerText = `Final Score: ${state.rawScores[0]}`;
    }

    state.userStats.consensus = state.userStats.consensus || { gamesPlayed: 0, highScore: 0 };
    const maxScore = Math.max(...state.rawScores);
    if (maxScore > (state.userStats.consensus.highScore || 0)) state.userStats.consensus.highScore = maxScore;
    state.userStats.consensus.gamesPlayed++;
    state.userStats.platformGamesPlayed++;
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
}
