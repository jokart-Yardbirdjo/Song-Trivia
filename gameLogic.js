// gameLogic.js

/**
 * ==============================================================================
 * YARDBIRD'S GAMES — CARTRIDGE: SONG TRIVIA  (gameLogic.js)
 * ==============================================================================
 *
 * WHAT THIS GAME IS:
 * Yardbird's original and flagship cartridge. A 30-second audio trivia battle
 * powered by the iTunes Search API. A song clip plays — players must stop it
 * and type the artist name and/or song title from memory. A lifeline system
 * auto-triggers multiple-choice buttons at the 10-second mark, rewarding
 * quick ears and punishing those who wait.
 *
 * MODES:
 * · Genre (Guess Artist + Song) — iTunes search by era, genre, or decade.
 * Scoring: both correct = 2× points; either correct = base points.
 * · Artist (Guess the Song)     — Deep dive into one artist's catalog.
 * Scoring: correct = 2× points.
 * · Movie (Guess the Film)      — Original soundtrack identification.
 * Scoring: correct = 2× points.
 *
 * DIFFICULTY LEVELS:
 * · Easy   — 30s timer, top-charting hits only, 1 song per artist.
 * · Medium — 30s timer, full back-catalog including B-sides.
 * · Hard   — 10s strict cutoff, no automatic lifeline, pure recall.
 *
 * SPECIAL FEATURES:
 * · Today Three: a seeded daily challenge — all players globally hear the
 * exact same 3 songs, sourced from db_daily.json + iTunes.
 * · Lifeline: at 10s remaining, MC buttons appear. Sacrifices typing
 * bonus but gives a safety net. forceLifeline() lets players call it
 * early at a scoring cost.
 * · Fuzzy Grading: Levenshtein distance + phonetic normalization means
 * typos and minor spelling errors are accepted.
 * · Double Rounds: randomly assigned, one per 5-round block (2× score).
 * · Streak Bonus: +50 pts every 3rd consecutive correct answer (typing only).
 * · Playlist reveal: finale screen shows links to Apple Music, Spotify, YouTube.
 * · Confetti cannon on game-over.
 * · Apple Music playlist URL import support.
 *
 * MULTIPLAYER:
 * Host (TV) runs the full game loop. Phones submit typed or MC guesses
 * via Firebase. Host evaluates all players simultaneously on each round.
 * Grace period: after 30s, multiplayer hosts give 30 extra seconds for
 * late submissions before evaluating.
 *
 * CARTRIDGE CONTRACT (required by app.js validateCartridge):
 * ✅ manifest                 — game metadata & setup config
 * ✅ startGame()              — entry point, triggers iTunes fetch
 * ✅ handleStop()             — pauses audio, shows typing fields
 * ✅ forceLifeline()          — early MC trigger (costs max score)
 * ✅ evaluateGuess()          — solo scoring logic (typed + MC)
 * ✅ evaluateMultiplayerRound() — multiplayer scoring (all players at once)
 * ✅ submitClientMCGuess()      — phone MC submission to Firebase
 * ✅ startDailyChallenge()      — loads Today Three from db_daily.json
 * ✅ resetStats()               — clears localStorage for this cartridge
 * ✅ shareChallenge()           — emoji grid + URL share sheet
 * ✅ renderStatsUI()            — injects stats HTML into stats modal
 *
 * FILE STRUCTURE (section map):
 * SECTION 1  — Imports & Module-Level State
 * SECTION 2  — Manifest (Cartridge Contract)
 * SECTION 3  — Stats Persistence
 * SECTION 4  — Stats UI & Trophy System
 * SECTION 5  — Daily Challenge (Today Three)
 * SECTION 6  — iTunes Fetch Logic (executeFetchLogic)
 * SECTION 7  — Game UI Launch (launchGameUI)
 * SECTION 8  — Round Loop (nextTrack)
 * SECTION 9  — Round Timer (_startTimer)
 * SECTION 10 — Lifeline System (forceLifeline / triggerLifeline / handleStop)
 * SECTION 11 — Fuzzy Answer Grading (levenshtein / isCloseEnough)
 * SECTION 12 — Score Helpers (getNormalizedScore / updateLeaderboard)
 * SECTION 13 — Guess Evaluation: Solo (evaluateGuess)
 * SECTION 14 — Guess Evaluation: Multiplayer (evaluateMultiplayerRound)
 * SECTION 15 — Phone Client (submitClientMCGuess)
 * SECTION 16 — End Game (endGameSequence / shootConfetti)
 * SECTION 17 — Share Challenge
 * SECTION 18 — Apple Music Playlist Import
 * SECTION 19 — UI & Platform Bridges (Mode & Sub Select)
 * ==============================================================================
 */


import { db } from './firebase.js';
import { state, audio, sfxTick, sfxCheer, sfxBuzzer, colors, top20DisneyMovies, top20BollywoodMovies, top20TamilMovies, top20HollywoodMovies, shweArtistsFull, oneHitWondersFull } from './state.js';
import { populateStats } from './ui.js';

export const manifest = {
    id: "song_trivia",
    title: "SONG TRIVIA",
    subtitle: "Yardbird's Original Masterpiece",
    hasDaily: true,
    rulesHTML: `
        <h2>How to Play</h2>
        <ul style="padding-left: 20px; font-size: 0.95rem; line-height: 1.6; color: #ccc;">
            <li><strong>Modes:</strong> Play Classic Genre, Artist-Specific, or Guess the Movie!</li>
            <li><strong>Today Three:</strong> A daily synced challenge.</li>
            <li><strong>The Lifeline:</strong> Multiple Choice options drop at 10s.</li>
        </ul>
        <button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px; width: 100%;">
            Got it! Let's Play
        </button>
    `,
    modes: [
        { id: "genre", title: "🎵 Guess the Artist & Song", desc: "Play by Era, Decade, or specific Genre." },
        { id: "artist", title: "🎤 Guess the Song", desc: "Focus strictly on a single Artist's catalog." },
        { id: "movie", title: "🎬 Guess the Movie", desc: "Identify the film from its original soundtrack." }
    ],
    levels: [
        { id: "easy", title: "🟢 Easy (Top Hits)", desc: "30s. Iconic hits. Lifeline at 10s." },
        { id: "medium", title: "🟡 Medium (Deep Catalog)", desc: "30s. All songs, including B-sides. Lifeline enabled." },
        { id: "hard", title: "🔴 Hard (The 10s Sprint)", desc: "10s cutoff. Pure recall typing. No Lifeline." }
    ],
    clientUI: "typing-and-mc", 
    // Tell the engine EXACTLY what baseline memory this game needs to function
    initialStats: { 
        gamesPlayed: 0, 
        highScore: 0, 
        trophies: [], 
        lastPlayedDate: null 
    }
};

function saveStats() {
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
}

export function resetStats() {
    if(confirm("Are you sure you want to reset all lifetime stats and trophies? This cannot be undone.")) {
        state.userStats.song_trivia = { gamesPlayed: 0, totalGuesses: 0, correctGuesses: 0, hsText: 0, hsMC: 0, sniperHits: 0, lastPlayedDate: null, currentStreak: 0, playedDailyToday: false, modesPlayed: { genre: false, artist: false, movie: false }, trophies: { perf: false, mara: false, snip: false, streak: false, expl: false } };
        saveStats();
        document.querySelectorAll('.trophy-row').forEach(row => row.classList.remove('unlocked'));
        const dailyBtn = document.getElementById('daily-btn-top');
        if(dailyBtn) { dailyBtn.innerText = "🌍 PLAY TODAY THREE"; dailyBtn.style.opacity = "1"; dailyBtn.style.cursor = "pointer"; dailyBtn.onclick = startDailyChallenge; }
    }
}

export function renderStatsUI(stStats, container) {
    let acc = stStats.totalGuesses > 0 ? Math.round((stStats.correctGuesses / stStats.totalGuesses) * 100) : 0;
    const tr = stStats.trophies || {};
    
    container.innerHTML = `
        <h2 style="color:var(--brand); margin-top:0; text-align:center; border-bottom:1px solid #333; padding-bottom:15px;">Trivia Locker Room</h2>
        <div class="stat-grid">
            <div class="stat-box">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Games Played</div>
                <div class="stat-val">${stStats.gamesPlayed || 0}</div>
            </div>
            <div class="stat-box">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Accuracy</div>
                <div class="stat-val" style="color:var(--brand)">${acc}%</div>
            </div>
            <div class="stat-box">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">High Score</div>
                <div class="stat-val" style="color:var(--p1)">${stStats.hsText || 0}</div>
            </div>
            <div class="stat-box">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Sniper Hits</div>
                <div class="stat-val" style="color:var(--p3)">${stStats.sniperHits || 0}</div>
            </div>
        </div>

        <h3 style="color:#fff; font-size:1rem; border-bottom:1px solid #333; padding-bottom:8px; margin-bottom:15px;">Trophy Cabinet</h3>
        
        <div class="trophy-row ${tr.perf ? 'unlocked' : ''}">
            <div class="trophy-icon">🏆</div>
            <div class="trophy-text"><h4>The Perfectionist</h4><p>Score higher than 900/1000 points.</p></div>
        </div>
        <div class="trophy-row ${tr.mara ? 'unlocked' : ''}">
            <div class="trophy-icon">🏃</div>
            <div class="trophy-text"><h4>The Marathoner</h4><p>Complete a grueling 20-Round game.</p></div>
        </div>
        <div class="trophy-row ${tr.snip ? 'unlocked' : ''}">
            <div class="trophy-icon">🎯</div>
            <div class="trophy-text"><h4>The Sniper</h4><p>Guess 10 songs correctly in under 3 seconds.</p></div>
        </div>
        <div class="trophy-row ${tr.streak ? 'unlocked' : ''}">
            <div class="trophy-icon">🔥</div>
            <div class="trophy-text"><h4>The Daily Devotee</h4><p>Play 5 days in a row.</p></div>
        </div>
        <div class="trophy-row ${tr.expl ? 'unlocked' : ''}">
            <div class="trophy-icon">🗺️</div>
            <div class="trophy-text"><h4>The Explorer</h4><p>Play all 3 game modes.</p></div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px;">
            <button class="btn btn-main" onclick="hideModal('stats-modal')" style="flex: 1; margin-right: 10px;">Close</button>
            <button class="btn btn-reset" onclick="if(window.activeCartridge && window.activeCartridge.resetStats) { window.activeCartridge.resetStats(); hideModal('stats-modal'); }" style="margin-top: 0; padding: 16px;">Reset</button>
        </div>
    `;
}

export async function startDailyChallenge() {
    state.isDailyMode = true;
    state.numPlayers = 1; state.roundsPerPlayer = 3; state.maxRounds = 3; 
    state.timeLimit = 30; state.gameState.level = 'easy'; 
    
    document.getElementById('start-btn-top').style.display = 'none';
    document.getElementById('daily-btn-top').style.display = 'none';
    document.getElementById('feedback-setup').innerText = "Loading Today's Global Mix...";
    
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / 86400000);

    try {
        const res = await fetch('db_daily.json');
        if(!res.ok) throw new Error("Could not find db_daily.json");
        const vault = await res.json();
        
        // Retrieve the 3 JSON objects for today's challenge
        const todaysTargets = vault[dayOfYear % vault.length];
        
        state.songs = [];
        
        // Ruthless blocklist to prevent junk tracks
        const blocklist = /\b(cover|karaoke|tribute|instrumental|lullaby|remix|live|acoustic|mashup|compilation)\b/i;

        for (const target of todaysTargets) {
            const query = encodeURIComponent(`${target.artist} ${target.song}`);
            const trackRes = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=15`);
            const trackData = await trackRes.json();

            if (trackData.results && trackData.results.length > 0) {
                // Find the first result that passes our strict checks
                const bestMatch = trackData.results.find(t => {
                    if (!t.previewUrl) return false;

                    const trackName = t.trackName.toLowerCase();
                    const artistName = t.artistName.toLowerCase();
                    const collectionName = (t.collectionName || "").toLowerCase();
                    const targetSong = target.song.toLowerCase();
                    const targetArtist = target.artist.toLowerCase();

                    // 1. Baseline verification: Artist and Song names must generally match
                    if (!trackName.includes(targetSong) && !targetSong.includes(trackName)) return false;
                    if (!artistName.includes(targetArtist) && !targetArtist.includes(artistName)) return false;

                    // 2. Filter out Covers, Karaoke, and Live versions
                    if (blocklist.test(trackName) || blocklist.test(collectionName) || blocklist.test(artistName)) {
                        // Edge case: Only allow it if the actual song title genuinely contains the flagged word 
                        // (e.g., Bruce Springsteen's "Cover Me")
                        if (!targetSong.match(blocklist)) return false;
                    }

                    return true;
                });

                if (bestMatch) {
                    state.songs.push(bestMatch);
                } else if (trackData.results[0].previewUrl) {
                    // Absolute fallback: If our filter was too strict, grab the top result with audio
                    state.songs.push(trackData.results[0]);
                }
            }
        }
        
        // Fetch backup tracks to pad out the multiple-choice options AND fill any missing daily songs
        const padRes = await fetch(`https://itunes.apple.com/search?term=billboard+hits&limit=20&entity=song`);
        const padData = await padRes.json();
        let padTracks = padData.results.filter(t => t.previewUrl);
        
        // If an iTunes track was region-blocked or missing, borrow a backup track so we always have 3 rounds!
        while (state.songs.length < 3 && padTracks.length > 0) {
            let randomTrack = padTracks.splice(Math.floor(Math.random() * padTracks.length), 1)[0];
            if (!state.songs.some(s => s.trackId === randomTrack.trackId)) {
                state.songs.push(randomTrack);
            }
        }
        
        state.globalPool = [...state.songs, ...padTracks];
        
        state.maxRounds = state.songs.length;
        state.roundsPerPlayer = state.maxRounds;
        state.rawScores = [0]; state.streaks = [0]; state.matchHistory = [[]];
        state.doubleRounds = []; 
        
        // Correct Boot Sequence
        launchGameUI();

    } catch (e) {
        console.error(e);
        alert(e.message || "Daily Vault failed. Playing fallback...");
        const fallbackRes = await fetch(`https://itunes.apple.com/search?term=pop+rock+hits&limit=20&entity=song`);
        const fallbackData = await fallbackRes.json();
        state.globalPool = fallbackData.results.filter(t => t.previewUrl);
        state.songs = state.globalPool.sort(() => 0.5 - Math.random()).slice(0, 3);
        
        state.maxRounds = state.songs.length;
        state.roundsPerPlayer = state.maxRounds;
        state.rawScores = [0]; state.streaks = [0]; state.matchHistory = [[]];
        state.doubleRounds = []; 
        launchGameUI();
    }
}


export function startGame() {
    // 🧹 GARBAGE COLLECTION: Wipe leftover data from previous cartridges
    state.curIdx = 0;
    state.songs = [];
    state.globalPool = [];
    state.matchHistory = [];
    
    state.isDailyMode = false;
    state.numPlayers = state.isMultiplayer ? state.numPlayers : 1;
    state.timeLimit = state.gameState.level === 'hard' ? 10 : 30; 
    state.roundsPerPlayer = state.gameState.rounds;
    state.maxRounds = state.roundsPerPlayer;
    
    document.getElementById('start-btn-top').style.display = 'none';
    document.getElementById('daily-btn-top').style.display = 'none';
    document.getElementById('feedback-setup').innerText = "Connecting to iTunes Database...";
    executeFetchLogic();
}

function getMovieName(track) {
    const fromMatch = track.trackName.match(/\bFrom\s+["']?([^"'\)]+)["']?\)/i);
    if (fromMatch && fromMatch[1]) return fromMatch[1].trim();
    let col = track.collectionName || "Unknown Movie";
    col = col.replace(/\(Original Motion Picture Soundtrack\)/ig, '').replace(/Original Motion Picture Soundtrack/ig, '').replace(/\(Original Score\)/ig, '').replace(/\(Original Disney Soundtrack\)/ig, '').replace(/- Single/ig, '').replace(/- EP/ig, '').trim();
    return col || "Unknown Movie";
}

function levenshtein(a, b) {
    const matrix = Array.from({length: b.length + 1}, (_, i) => [i]);
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
        }
    }
    return matrix[b.length][a.length];
}

function isCloseEnough(guess, actual, isArtist = false) {
    if (!guess || !actual) return false;
    let cleanA = actual.replace(/\(.*?\)|\[.*?\]/g, '').toLowerCase().trim();
    let cleanG = guess.toLowerCase().trim();
    if (cleanA === cleanG || cleanA.includes(cleanG)) return true;

    const reduce = s => s.replace(/[^a-z0-9 ]/g, '').replace(/([a-z])\1+/g, '$1').replace(/y/g, 'i').replace(/h/g, '');
    let phonA = reduce(cleanA); let phonG = reduce(cleanG);
    const stopWords = ['the','a','an','and','of','to','in','on','i','dont','want','my','is','it','for','with','you','me','feat','ft','version','remix','mix','edit','radio','live','studio'];
    
    let aWords = phonA.split(' ').filter(w => w.length > 2 && !stopWords.includes(w));
    let gWords = phonG.split(' ').filter(w => w.length > 2 && !stopWords.includes(w));
    if (gWords.length === 0) return false;

    if (isArtist && gWords.length === 1) {
        let gW = gWords[0];
        let allowedTypos = gW.length >= 8 ? 2 : (gW.length > 5 ? 1 : 0);
        for (let aW of aWords) {
            if (aW === gW || aW.includes(gW) || gW.includes(aW) || levenshtein(gW, aW) <= allowedTypos) return true; 
        }
    }

    if (!isArtist) {
        let matchCount = 0;
        gWords.forEach(gW => {
            let allowedTypos = gW.length >= 7 ? 2 : (gW.length >= 4 ? 1 : 0);
            for (let aW of aWords) {
                if (aW === gW || aW.includes(gW) || gW.includes(aW) || levenshtein(gW, aW) <= allowedTypos) { matchCount++; break; }
            }
        });
        if (aWords.length <= 2 && matchCount >= 1) return true;
        if (matchCount >= 2) return true;
    }

    if (aWords.length <= 1) {
        let gW = gWords[0];
        if (aWords.length === 1) {
            let allowedTypos = gW.length >= 8 ? 3 : (gW.length > 5 ? 2 : 1);
            return levenshtein(gW, aWords[0]) <= allowedTypos || gW.includes(aWords[0]) || aWords[0].includes(gW);
        }
        return false;
    }

    let matchCount = 0; let matchedIndices = new Set();
    gWords.forEach(gW => {
        for (let i = 0; i < aWords.length; i++) {
            if (!matchedIndices.has(i)) {
                let aW = aWords[i];
                if (aW === gW || aW.includes(gW) || gW.includes(aW) || levenshtein(gW, aW) <= 1) {
                    matchCount++; matchedIndices.add(i); break;
                }
            }
        }
    });
    return matchCount >= 2; 
}

function getNormalizedScore(rawScore) {
    const maxRawPossible = (state.roundsPerPlayer * 60) + (Math.floor(state.roundsPerPlayer / 3) * 50);
    return Math.min(1000, Math.round((rawScore / maxRawPossible) * 1000));
}

function updateLeaderboard(activeIdx = 0) {
    if (state.isMultiplayer && state.isHost) {
        document.getElementById('score-board').innerHTML = '';
        return; 
    }
    document.getElementById('score-board').innerHTML = state.rawScores.map((s, i) => {
        const isActive = (i === activeIdx) || activeIdx === -1;
        const bColor = isActive ? colors[i % colors.length] : 'var(--border-light)';
        const tColor = isActive ? colors[i % colors.length] : 'var(--text-muted)';
        const ptsColor = isActive ? 'var(--dark-text)' : '#aaa';
        const displayScore = activeIdx === -1 ? getNormalizedScore(s) : Math.round(s);
        
        return `
        <div class="score-pill" style="border-color:${bColor};">
            <div class="p-name" style="color:${tColor}">${state.numPlayers === 1 ? 'SCORE' : 'P'+(i+1)}</div>
            <div class="p-pts" style="color:${ptsColor}">${displayScore}</div>
            <div class="p-streak" style="color:${tColor}; opacity:${state.streaks[i] > 0 ? 1 : 0}">🔥 ${state.streaks[i]}</div>
        </div>`;
    }).join('');
}

export async function executeFetchLogic() {
    state.rawScores = new Array(state.numPlayers).fill(0); 
    state.streaks = new Array(state.numPlayers).fill(0);
    state.matchHistory = new Array(state.numPlayers).fill().map(() => []); 
    
    try {
        let pool = []; let searchTerm = ""; let minYear = 1900, maxYear = 2099;
        const customVal = document.getElementById('custom-input').value.trim(); 
        const seenTracks = new Set(); const artistCount = {}; 
        let hitLimit = state.gameState.level === 'easy' ? 15 : 150; 
        
        if (state.gameState.sub === 'custom' && customVal.startsWith('http')) {
            document.getElementById('feedback-setup').innerText = "Extracting Playlist & Matching Audio (Takes ~10 seconds)...";
            pool = await extractPlaylistData(customVal);
        } 
        else if (state.gameState.mode === 'movie') {
            let selectedMovieGenre = state.gameState.sub;
            
            if (selectedMovieGenre === 'Disney Classics' || selectedMovieGenre === 'Bollywood Hits' || selectedMovieGenre === 'Tamil Cinema' || selectedMovieGenre === 'Hollywood Blockbusters') {
                
                let jsonFile = ''; let vaultName = '';
                if (selectedMovieGenre === 'Disney Classics') { jsonFile = 'db_disney.json'; vaultName = 'Disney'; }
                else if (selectedMovieGenre === 'Bollywood Hits') { jsonFile = 'db_bollywood.json'; vaultName = 'Bollywood'; }
                else if (selectedMovieGenre === 'Tamil Cinema') { jsonFile = 'db_tamil.json'; vaultName = 'Tamil'; }
                else if (selectedMovieGenre === 'Hollywood Blockbusters') { jsonFile = 'db_hollywood.json'; vaultName = 'Hollywood'; }

                document.getElementById('feedback-setup').innerText = `Loading Curated ${vaultName} Vault...`;
                const dbRes = await fetch(jsonFile);
                if (!dbRes.ok) throw new Error(`Could not find ${jsonFile}. Ensure it is uploaded.`);
                const allIds = await dbRes.json();

                const shuffledIds = allIds.sort(() => 0.5 - Math.random()).slice(0, 200);
                const fetchPromise = fetch(`https://itunes.apple.com/lookup?id=${shuffledIds.join(',')}`);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Network Timeout.")), 10000));
                const res = await Promise.race([fetchPromise, timeoutPromise]);
                const d = await res.json();

                pool = d.results.filter(t => {
                    if (!t.previewUrl) return false;
                    const cleanTitle = t.trackName.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
                    if (seenTracks.has(cleanTitle)) return false; 
                    const cArt = (t.artistName || "").toLowerCase();
                    const artLimit = (vaultName === 'Bollywood' || vaultName === 'Tamil') ? 4 : 3;
                    if (artistCount[cArt] >= artLimit) return false; 
                    artistCount[cArt] = (artistCount[cArt] || 0) + 1;
                    seenTracks.add(cleanTitle); return true;
                });
            } else {
                searchTerm = customVal;
                if (searchTerm === customVal && customVal.includes(',')) {
                    let terms = customVal.split(',').map(s => s.trim().toLowerCase());
                    let cleanTerms = [];
                    terms.forEach(t => {
                        if (t === '90s' || t === '1990s') { minYear = 1990; maxYear = 1999; }
                        else if (t === '80s' || t === '1980s') { minYear = 1980; maxYear = 1989; }
                        else if (t === '70s' || t === '1970s') { minYear = 1970; maxYear = 1979; }
                        else if (t === '2000s') { minYear = 2000; maxYear = 2009; }
                        else if (t === '2010s') { minYear = 2010; maxYear = 2019; }
                        else { cleanTerms.push(t); }
                    });
                    searchTerm = cleanTerms.join(' ');
                }
                const wildcards = ['a', 'e', 'i', 'o', 'u'];
                let apiSearchTerm = searchTerm + " " + wildcards[Math.floor(Math.random() * wildcards.length)];

                const fetchPromise = fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(apiSearchTerm)}&limit=300&entity=song`);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Network Timeout.")), 10000));
                const res = await Promise.race([fetchPromise, timeoutPromise]);
                const d = await res.json();
                
                const compRegex = /\b(hits|best of|compilation|essential|top \d+|collection|mashup|remix|greatest|tunes|anthems|classics|favorites|rewind|mixtape|playlist|vol\.|volume|party|dance|covers|karaoke|instrumental|unwind|lofi)\b/i;
                let requiredSearchWords = apiSearchTerm.split(' ').filter(w => w.length > 2 && w !== 'a' && w !== 'e' && w !== 'i' && w !== 'o' && w !== 'u').map(w => w.toLowerCase());
                if (requiredSearchWords.includes('bollywood')) requiredSearchWords.push('hindi');
                if (requiredSearchWords.includes('hindi')) requiredSearchWords.push('bollywood');

                pool = d.results.filter(t => {
                    if (!t.previewUrl) return false;
                    const cleanTitle = t.trackName.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
                    if (seenTracks.has(cleanTitle)) return false; 
                    const yr = new Date(t.releaseDate).getFullYear();
                    if (yr < minYear || yr > maxYear) return false; 
                    const colName = getMovieName(t).toLowerCase();
                    const gName = (t.primaryGenreName || "").toLowerCase();
                    let searchLower = apiSearchTerm.toLowerCase();
                    let metaString = (t.artistName + " " + colName + " " + t.trackName + " " + gName).toLowerCase();
                    
                    if (searchLower.includes('tamil')) {
                        if (!metaString.includes('tamil')) return false;
                    } else if (searchLower.includes('bollywood') || searchLower.includes('hindi')) {
                        if (!metaString.includes('bollywood') && !metaString.includes('hindi')) return false;
                    } else {
                        if (metaString.includes('bollywood') || metaString.includes('tamil') || metaString.includes('hindi') || metaString.includes('telugu')) return false;
                    }

                    if (requiredSearchWords.length > 0) {
                        let hasMatch = requiredSearchWords.some(w => metaString.includes(w));
                        if (!hasMatch) return false; 
                    }
                    if (compRegex.test(colName) || compRegex.test(t.trackName)) return false;
                    const isVerifiedMovie = gName.includes('soundtrack') || gName.includes('bollywood') || gName.includes('tamil') || colName.includes('soundtrack') || colName.includes('motion picture') || colName.includes('ost') || colName.includes('o.s.t') || colName.includes('original score') || colName.includes('film');
                    if (!isVerifiedMovie) return false;
                    seenTracks.add(cleanTitle); return true;
                });
            }
        } 
        else {
            let apiSearchTerm = "";
            if (state.gameState.mode === 'genre') {
                const genre = state.gameState.sub;
                if (genre === 'shwe-special' || genre === 'one-hit-wonders') {
                    let selectedArr = genre === 'shwe-special' ? shweArtistsFull : oneHitWondersFull;
                    const selected = selectedArr.sort(() => 0.5 - Math.random()).slice(0, 15);
                    let localHitLimit = state.gameState.level === 'easy' ? 5 : 15; 
                    if(genre === 'one-hit-wonders') localHitLimit = 1;

                    const fetches = selected.map(a => fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(a)}&entity=song&limit=${localHitLimit === 1 ? 5 : 15}`));
                    const res = await Promise.all(fetches);
                    const data = await Promise.all(res.map(r => r.json()));
                    
                    data.forEach((d, i) => {
                        const targetArtist = selected[i].toLowerCase();
                        const filtered = d.results.filter(t => {
                            if (!t.previewUrl) return false;
                            const yr = new Date(t.releaseDate).getFullYear();
                            const cleanTitle = t.trackName.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
                            if (genre === 'shwe-special' && (yr < 1990 || yr > 1999)) return false;
                            if (seenTracks.has(cleanTitle)) return false;
                            if (!t.artistName.toLowerCase().includes(targetArtist)) return false;
                            const cArt = (t.artistName || "").toLowerCase();
                            if (localHitLimit < 30 && artistCount[cArt] >= (localHitLimit <= 5 ? 1 : 2)) return false;
                            seenTracks.add(cleanTitle); artistCount[cArt] = (artistCount[cArt] || 0) + 1;
                            return true;
                        }).slice(0, localHitLimit);
                        pool = pool.concat(filtered);
                    });
                } else {
                    searchTerm = genre === 'custom' ? customVal : genre;
                    if (searchTerm === customVal && customVal.includes(',')) {
                        let terms = customVal.split(',').map(s => s.trim().toLowerCase());
                        let cleanTerms = [];
                        terms.forEach(t => {
                            if (t === '90s' || t === '1990s') { minYear = 1990; maxYear = 1999; }
                            else if (t === '80s' || t === '1980s') { minYear = 1980; maxYear = 1989; }
                            else if (t === '70s' || t === '1970s') { minYear = 1970; maxYear = 1979; }
                            else if (t === '2000s') { minYear = 2000; maxYear = 2009; }
                            else if (t === '2010s') { minYear = 2010; maxYear = 2019; }
                            else { cleanTerms.push(t); }
                        });
                        apiSearchTerm = cleanTerms.join(' ');
                    } else {
                        switch(genre) {
                            case 'classic-rock': apiSearchTerm = "Classic Rock Hits"; minYear = 1960; maxYear = 1989; break;
                            case '2000s-hits': apiSearchTerm = "2000s Pop"; minYear = 1995; maxYear = 2012; break;
                            default: apiSearchTerm = searchTerm;
                        }
                    }
                }
            } else if (state.gameState.mode === 'artist') {
                const art = state.gameState.sub;
                searchTerm = art === 'custom' ? customVal : art;
                const artists = searchTerm.split(/[,;]+/).map(a => a.trim()).filter(a => a);
                const fetches = artists.map(a => fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(a)}&limit=150&entity=song`));
                const res = await Promise.all(fetches);
                const data = await Promise.all(res.map(r => r.json()));
                
                data.forEach((d, idx) => {
                    const targetArtist = artists[idx].toLowerCase();
                    const filtered = d.results.filter(t => {
                        if (!t.previewUrl) return false;
                        const cleanTitle = t.trackName.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
                        if (seenTracks.has(cleanTitle)) return false; 
                        if (!t.artistName.toLowerCase().includes(targetArtist)) return false;
                        const colName = (t.collectionName || "").toLowerCase();
                        if (colName.includes('- single') || colName.includes('- ep')) return false;
                        const flatCol = colName.replace(/[^a-z0-9]/g, '');
                        if (flatCol === cleanTitle || flatCol.includes(cleanTitle)) return false;
                        seenTracks.add(cleanTitle); return true;
                    }).slice(0, Math.ceil(hitLimit / artists.length)); 
                    pool = pool.concat(filtered);
                });
            }

            if (apiSearchTerm !== "") {
                const wildcards = ['a', 'e', 'i', 'o', 'u'];
                apiSearchTerm = apiSearchTerm + " " + wildcards[Math.floor(Math.random() * wildcards.length)];
                let fetchLimit = state.gameState.level === 'easy' ? 30 : 200;
                const fetchPromise = fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(apiSearchTerm)}&limit=${fetchLimit}&entity=song`);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Network Timeout.")), 10000));
                const res = await Promise.race([fetchPromise, timeoutPromise]);
                const d = await res.json();

                pool = d.results.filter(t => {
                    if (!t.previewUrl) return false;
                    const cleanTitle = t.trackName.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
                    if (seenTracks.has(cleanTitle)) return false; 
                    if (state.gameState.mode === 'genre') {
                        const yr = new Date(t.releaseDate).getFullYear();
                        if (yr < minYear - 8 || yr > maxYear + 8) return false; 
                    } 
                    const cArt = (t.artistName || "").toLowerCase();
                    if (state.gameState.level === 'easy' && artistCount[cArt] >= 1) return false;
                    artistCount[cArt] = (artistCount[cArt] || 0) + 1;
                    seenTracks.add(cleanTitle); return true;
                });
            }
        } 
        
        state.globalPool = [...pool]; 
        state.songs = [];
        let seenGameMovies = new Set();
        let shuffledPool = pool.sort(() => 0.5 - Math.random());

        for (let t of shuffledPool) {
            if (state.songs.length >= state.maxRounds) break;
            if (state.gameState.mode === 'movie') {
                let mName = getMovieName(t).toLowerCase();
                if (seenGameMovies.has(mName)) continue; 
                seenGameMovies.add(mName);
            }
            state.songs.push(t);
        }

        if(state.songs.length < 3) throw new Error("Not enough tracks found! Try broadening your search.");
        else if(state.songs.length < state.maxRounds) state.maxRounds = state.songs.length;

        state.doubleRounds = [];
        for (let i = 0; i < state.maxRounds; i += 5) {
            let min = i === 0 ? 2 : i; 
            let max = Math.min(i + 4, state.maxRounds - 1);
            if (min <= max) {
                let randomRound = Math.floor(Math.random() * (max - min + 1)) + min;
                state.doubleRounds.push(randomRound);
            }
        }
        
        launchGameUI();
    } catch (error) { 
        console.error(error);
        const fbSetup = document.getElementById('feedback-setup');
        if (fbSetup) {
            fbSetup.innerHTML = `<span style="color: var(--fail);">❌ ${error.message || "Network Error or iTunes timeout. Please try again."}</span>`;
        } else {
            alert("Error: " + (error.message || "Network Error")); 
        }
        
        document.getElementById('custom-input').value = "";
        document.getElementById('start-btn-top').style.display = 'block';
        document.getElementById('daily-btn-top').style.display = 'block';
        return; 
    }
}

function launchGameUI() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');
    document.querySelectorAll('.header-btn').forEach(btn => btn.classList.add('hidden'));
    document.getElementById('guess-artist').classList.toggle('hidden', state.gameState.mode !== 'genre');
    document.getElementById('guess-song').classList.toggle('hidden', state.gameState.mode === 'movie');
    document.getElementById('guess-movie').classList.toggle('hidden', state.gameState.mode !== 'movie');
    updateLeaderboard(0);
    
    if(state.isDailyMode) { document.getElementById('main-title').innerText = "🌍 TODAY THREE CHALLENGE"; }
    
    if (!state.isDailyMode) {
        if (state.gameState.mode === 'genre') state.userStats.song_trivia.modesPlayed.genre = true;
        if (state.gameState.mode === 'artist') state.userStats.song_trivia.modesPlayed.artist = true;
        if (state.gameState.mode === 'movie') state.userStats.song_trivia.modesPlayed.movie = true;
        if (state.userStats.song_trivia.modesPlayed.genre && state.userStats.song_trivia.modesPlayed.artist && state.userStats.song_trivia.modesPlayed.movie) {
            state.userStats.song_trivia.trophies.expl = true;
        }
    }
    nextTrack();
}

function nextTrack() {
    if (state.curIdx >= state.maxRounds) { endGameSequence(); return; }
    if(state.timerId) clearInterval(state.timerId);
    if(state.guessTimerId) clearInterval(state.guessTimerId);
    
    state.isProcessing = false; state.hasUsedLifeline = false;

    const correctStr = getMCLabel(state.songs[state.curIdx]);
    let wrongOptionsPool = [];
    state.globalPool.forEach(s => {
        let str = getMCLabel(s);
        if (str !== correctStr && str !== "Unknown Movie" && str !== "Unknown") wrongOptionsPool.push(str);
    });
    wrongOptionsPool = [...new Set(wrongOptionsPool)].sort(() => 0.5 - Math.random());
    let options = [{ str: correctStr, correct: true }];
    wrongOptionsPool.slice(0, 3).forEach(str => options.push({ str: str, correct: false }));
    state.currentMCOptions = options.sort(() => 0.5 - Math.random());
    
    const pIdx = state.curIdx % state.numPlayers;
    const currentColor = colors[pIdx % colors.length]; 
    const tag = document.getElementById('active-player');
    
    const isDoubleRound = state.doubleRounds && state.doubleRounds.includes(state.curIdx);
    const doubleText = isDoubleRound ? " - ⭐ 2X BONUS!" : "";
    
    if (state.isMultiplayer && state.isHost) {
        updateLeaderboard(-1);
        document.documentElement.style.setProperty('--active-vis', 'var(--primary)');

        tag.innerText = `ROUND ${state.curIdx + 1} / ${state.maxRounds}${doubleText}`;
        tag.style.color = isDoubleRound ? "#f39c12" : "var(--primary)"; 
        tag.style.borderColor = isDoubleRound ? "#f39c12" : "var(--primary)";
        
        db.ref(`rooms/${state.roomCode}/currentRound`).set(state.curIdx + 1);
        db.ref(`rooms/${state.roomCode}/currentMC`).remove(); 

        let fbOptions = state.currentMCOptions.map(opt => ({ str: opt.str, isCorrect: opt.correct }));
        db.ref(`rooms/${state.roomCode}/roundMC`).set(fbOptions);

    } else {
        updateLeaderboard(pIdx); 
        document.documentElement.style.setProperty('--active-vis', currentColor);
        
        const currentRound = Math.floor(state.curIdx / state.numPlayers) + 1;
        
        if (state.isDailyMode) {
             tag.innerText = `TODAY'S SONG ${currentRound}/${state.roundsPerPlayer}`;
        } else {
             tag.innerText = state.numPlayers > 1 ? `PLAYER ${pIdx + 1} TURN (Round ${currentRound}/${state.roundsPerPlayer})` : `Round ${currentRound}/${state.roundsPerPlayer}${doubleText}`;
        }
        
        tag.style.color = isDoubleRound ? "#f39c12" : "var(--primary)"; 
        tag.style.borderColor = isDoubleRound ? "#f39c12" : "var(--border-light)";
        
        document.getElementById('stop-btn').style.cssText = "";
        document.getElementById('submit-btn').style.cssText = "";
    }
    
    document.getElementById('feedback').innerHTML = ""; document.getElementById('feedback').classList.remove('fade-in');
    document.getElementById('reveal-art').style.display = 'none'; document.getElementById('reveal-art').classList.remove('fade-in');
    
    // Clear out any old timer text
    const timerElement = document.getElementById('timer');
    timerElement.style.color = '';
    timerElement.innerHTML = '';
    
    document.getElementById('visualizer').classList.remove('active', 'paused'); document.getElementById('visualizer').classList.add('hidden');
    
    if (state.isMultiplayer && state.isHost) {
        document.getElementById('btn-container').classList.add('hidden');
        document.getElementById('feedback').innerHTML = `<div id="host-lock-status" style="color:var(--primary); font-size:1.3rem; font-weight:bold; margin-top:20px;">LOCKED IN: 0 / ${state.numPlayers}</div>`;
        document.getElementById('feedback').classList.add('fade-in');

        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            if (snap.exists()) {
                let updates = {};
                snap.forEach(p => { updates[`${p.key}/status`] = 'guessing'; updates[`${p.key}/guess`] = null; });
                db.ref(`rooms/${state.roomCode}/players`).update(updates);
            }
        });

        db.ref(`rooms/${state.roomCode}/lifelineForced`).set(false);
    } else {
        document.getElementById('btn-container').classList.remove('hidden');
        document.getElementById('stop-btn').classList.remove('hidden');
        document.getElementById('force-mc-btn').classList.toggle('hidden', state.gameState.level === 'hard');
    }

    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('mc-fields').classList.add('hidden');

    // --- REPLACE YOUR EXISTING AUDIO LOAD BLOCK WITH THIS ENTIRE SNIPPET ---

audio.src = state.songs[state.curIdx].previewUrl;
audio.load();

const timerEl = document.getElementById('timer');
timerEl.innerHTML = 'Load...';

let playPromise = audio.play();

if (playPromise !== undefined) {
    playPromise
        .then(() => {
            // Success! Browser allowed it.
            startRoundClock();
        })
        .catch(err => {
            // Mobile Chrome blocked it. Recover the UI.
            console.warn("🔇 Autoplay blocked, recovering UI...", err);
            
            timerEl.innerHTML = `<span style="cursor:pointer; color:var(--primary); font-size:1.5rem; animation: pulse 1s infinite alternate;">▶️ TAP TO PLAY</span>`;
            
            timerEl.onclick = () => {
                timerEl.onclick = null; // Clean up listener
                timerEl.innerHTML = 'Load...'; // Reset UI
                
                audio.play()
                    .then(() => startRoundClock())
                    .catch(() => startRoundClock()); // Failsafe
            };
        });
} else {
    startRoundClock();
}

// -----------------------------------------------------------------------
}

function startRoundClock() {
    document.getElementById('visualizer').classList.remove('hidden'); document.getElementById('visualizer').classList.add('active');
    state.timeLeft = state.timeLimit; state.startTime = Date.now();
    state.scoreLock = 0; state.isGracePeriod = false; state.forcedEarly = false;
    
    // Inject horizontal timer bar
    const timerElement = document.getElementById('timer');
    timerElement.innerHTML = `<div class="timer-bar-container"><div id="timer-bar-fill" class="timer-bar-fill"></div></div>`;
    const timerFill = document.getElementById('timer-bar-fill');

    state.timerId = setInterval(() => {
        state.timeLeft--; 
        
        let percentage = (state.timeLeft / state.timeLimit) * 100;
        if(timerFill) timerFill.style.width = `${percentage}%`;
        
        if (state.isMultiplayer && state.isHost) {
            db.ref(`rooms/${state.roomCode}/timeLeft`).set(state.timeLeft);
            db.ref(`rooms/${state.roomCode}/phase`).set(state.isGracePeriod ? 'grace' : 'audio');
        }
        
        if (state.timeLeft <= 3 && state.timeLeft > 0 && !state.hasUsedLifeline) { 
            if(timerFill) timerFill.style.backgroundColor = 'var(--fail)'; 
            sfxTick.currentTime = 0; sfxTick.play().catch(e => {}); 
        }
        
        if (state.timeLeft === 10 && !state.isGracePeriod && state.gameState.level !== 'hard' && !state.hasUsedLifeline) {
            if (state.isMultiplayer && state.isHost) { db.ref(`rooms/${state.roomCode}/lifelineForced`).set(true); triggerLifeline(); } else { triggerLifeline(); }
        }
        
        if (state.timeLeft <= 0) {
            if (state.isMultiplayer && state.isHost && !state.isGracePeriod) {
                state.isGracePeriod = true; state.timeLeft = 30; audio.pause();
                document.getElementById('visualizer').classList.add('paused');
                document.getElementById('feedback').innerHTML += `<div style="color:var(--text-muted); font-size:1.1rem; margin-top:10px; font-weight:bold;">Song completed! Please submit final answers in the next 30 seconds.</div>`;
            } else {
                if(state.timerId) clearInterval(state.timerId); audio.pause();
                document.getElementById('visualizer').classList.add('paused');
                
                if (state.isMultiplayer && state.isHost) {
                    db.ref(`rooms/${state.roomCode}/players`).once('value', snap => { (snap.val()); });
                } else if (state.hasUsedLifeline) {
                    evaluateGuess(false); 
                } else {
                    handleStop(); 
                }
            }
        }
    }, 1000);
}

export function forceLifeline() {
    if (state.timeLeft > 10 && !state.hasUsedLifeline) {
        state.forcedEarly = true; 
        state.timeLeft = 10; 
        triggerLifeline();
    }
}

function triggerLifeline() {
    state.hasUsedLifeline = true;
    document.getElementById('btn-container').classList.add('hidden');
    document.getElementById('mc-fields').classList.remove('hidden');
    document.getElementById('mc-fields').classList.add('fade-in');
    setupMC(); 
}

export function handleStop() { 
    if(state.isProcessing) return; 
    state.isProcessing = true;
    
    if(state.timerId) clearInterval(state.timerId); audio.pause(); 
    document.getElementById('visualizer').classList.add('paused');
    document.getElementById('btn-container').classList.add('hidden');

    state.scoreLock = Math.max(0, state.timeLeft);
    if (state.gameState.level === 'hard') state.scoreLock *= 3; 
    
    if (!state.hasUsedLifeline) {
        document.getElementById('guess-fields').classList.remove('hidden'); document.getElementById('guess-fields').classList.add('fade-in');
        setTimeout(() => {
            state.isProcessing = false; 
            if(state.gameState.mode === 'genre') document.getElementById('guess-artist').focus();
            else if(state.gameState.mode === 'artist') document.getElementById('guess-song').focus();
            else document.getElementById('guess-movie').focus();
        }, 50);

        let guessTime = 20; 
        // Inject an orange timer bar for the typing phase
        const timerElement = document.getElementById('timer');
        timerElement.innerHTML = `<div class="timer-bar-container"><div id="timer-bar-fill" class="timer-bar-fill" style="background: #f39c12;"></div></div>`;
        const timerFill = document.getElementById('timer-bar-fill');
        
        state.guessTimerId = setInterval(() => {
            guessTime--; 
            let percentage = (guessTime / 20) * 100;
            if(timerFill) timerFill.style.width = `${percentage}%`;
            
            if (guessTime <= 3 && guessTime > 0) { 
                if(timerFill) timerFill.style.backgroundColor = 'var(--fail)'; 
                sfxTick.currentTime = 0; sfxTick.play().catch(e => {}); 
            }
            if (guessTime <= 0) { if(state.guessTimerId) clearInterval(state.guessTimerId); evaluateGuess(); }
        }, 1000);
    } else {
        evaluateGuess(false); 
    }
}

function getMCLabel(s) {
    if (state.gameState.mode === 'movie') return getMovieName(s); 
    else if (state.gameState.mode === 'artist') return s.trackName;
    else return `${s.artistName} - ${s.trackName}`;
}

function setupMC() {
    const container = document.getElementById('mc-fields'); container.innerHTML = ''; 
    state.currentMCOptions.forEach(opt => {
        const btn = document.createElement('button'); btn.className = 'mc-btn'; btn.innerText = opt.str;
        // NEW: Pass the clicked button so we can style it green/red
        btn.onclick = (e) => evaluateGuess(opt.correct, e.target); container.appendChild(btn);
    });

    if (state.isMultiplayer && state.isHost) {
        let fbOptions = state.currentMCOptions.map(opt => ({ str: opt.str, isCorrect: opt.correct }));
        db.ref(`rooms/${state.roomCode}/currentMC`).set(fbOptions); 
    }
}

export function submitClientMCGuess(isCorrect) {
    const currentTime = parseInt(document.getElementById('client-timer-display').innerText) || 0;
    const currentPhase = !document.getElementById('client-grace-msg').classList.contains('hidden') ? 'grace' : 'audio';
    const finalTime = Math.min(10, currentTime);

    db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update({
        guess: { isMC: true, correct: isCorrect, time: finalTime, phase: currentPhase },
        status: 'locked'
    });
    
    document.getElementById('client-mc-inputs').classList.add('hidden');
    document.getElementById('client-locked-screen').classList.remove('hidden');
}

export function evaluateGuess(isCorrectMC = null, clickedBtn = null) {
    if(state.isProcessing && isCorrectMC === null) return; 
    state.isProcessing = true;
    
    if(state.timerId) clearInterval(state.timerId); if(state.guessTimerId) clearInterval(state.guessTimerId); audio.pause(); 
    document.getElementById('visualizer').classList.add('paused');
    document.getElementById('guess-fields').classList.add('hidden'); document.getElementById('btn-container').classList.add('hidden');
    
    if (state.hasUsedLifeline) {
        document.querySelectorAll('.mc-btn').forEach(b => b.disabled = true);
        if (clickedBtn) {
            clickedBtn.classList.add(isCorrectMC ? 'correct' : 'wrong');
        }
    }

    const pIdx = state.curIdx % state.numPlayers;
    
    let roundPts = 0;
    if (state.hasUsedLifeline) {
        roundPts = state.forcedEarly ? 5 : Math.max(0, state.timeLeft);
    } else {
        roundPts = state.scoreLock;
    }

    let correct = false; let artOk = false, sonOk = false, movOk = false;

    const realA = state.songs[state.curIdx].artistName;
    const realS = state.songs[state.curIdx].trackName;
    const realM = getMovieName(state.songs[state.curIdx]); 

    if (state.hasUsedLifeline) {
        correct = (isCorrectMC === true);
        if (correct) { artOk = true; sonOk = true; movOk = true; }
    } else {
        const artG = document.getElementById('guess-artist').value;
        const sonG = document.getElementById('guess-song').value;
        const movG = document.getElementById('guess-movie').value;
        
        if (state.gameState.mode === 'genre') {
            artOk = isCloseEnough(artG, realA, true); sonOk = isCloseEnough(sonG, realS, false);
            if (artOk || sonOk) { correct = true; if (artOk && sonOk) roundPts *= 2; }
        } else if (state.gameState.mode === 'artist') {
            if (isCloseEnough(sonG, realS, false)) { correct = true; sonOk = true; roundPts *= 2; }
        } else if (state.gameState.mode === 'movie') {
            if (isCloseEnough(movG, realM, false)) { correct = true; movOk = true; roundPts *= 2; }
        }
    }

    state.matchHistory[pIdx].push(correct ? (state.hasUsedLifeline ? '🟨' : '🟩') : '🟥');
    state.userStats.song_trivia.totalGuesses++;
    if (correct) {
        state.userStats.song_trivia.correctGuesses++;
        if (!state.hasUsedLifeline && state.scoreLock >= 27) state.userStats.song_trivia.sniperHits++;
    }

    let fbHTML = ""; const succColor = "var(--success)"; const failColor = "var(--fail)";

    if (state.gameState.mode === 'genre' && !state.hasUsedLifeline) {
        if (artOk && sonOk) fbHTML += `<div style="color:${succColor}; font-size:1.5rem; font-weight:bold; margin-bottom:5px;">🔥 PERFECT DOUBLE!</div>`;
        else if (artOk || sonOk) fbHTML += `<div style="font-size:1.1rem; font-weight:bold; display:flex; justify-content:center; gap:15px; margin-bottom:5px; color:var(--dark-text);"><span style="color:${artOk ? succColor : failColor}">${artOk ? '✅' : '❌'} ARTIST</span><span style="color:var(--text-muted);">|</span><span style="color:${sonOk ? succColor : failColor}">${sonOk ? '✅' : '❌'} SONG</span></div>`;
        else fbHTML += `<div style="color:${failColor}; font-size:1.5rem; font-weight:bold; margin-bottom:5px;">❌ INCORRECT</div>`;
    } else {
        if (correct) fbHTML += `<div style="color:${succColor}; font-size:1.5rem; font-weight:bold; margin-bottom:5px;">🔥 CORRECT!</div>`;
        else fbHTML += `<div style="color:${failColor}; font-size:1.5rem; font-weight:bold; margin-bottom:5px;">❌ INCORRECT</div>`;
    }

    if (correct) {
        if (!state.hasUsedLifeline) {
            state.streaks[pIdx]++;
            if (state.streaks[pIdx] % 3 === 0) { roundPts += 50; fbHTML += `<div style="color:var(--primary); font-size:0.85rem; margin-top:5px;">+50 PURE STREAK BONUS</div>`; }
        } else {
            state.streaks[pIdx] = 0; 
        }
        if(fbHTML.includes("DOUBLE") || fbHTML.includes("CORRECT")) { sfxCheer.currentTime=0; sfxCheer.play().catch(e=>{}); }
    } else {
        sfxBuzzer.currentTime = 0; sfxBuzzer.play().catch(e=>{});
        state.streaks[pIdx] = 0; roundPts = 0; 
    }

    if (state.doubleRounds && state.doubleRounds.includes(state.curIdx) && correct) {
        roundPts *= 2;
        fbHTML += `<div style="color:#f39c12; font-size:0.9rem; margin-top:5px; font-weight:bold;">⭐ 2X BONUS ROUND APPLIED!</div>`;
    }
    
    state.rawScores[pIdx] += roundPts; updateLeaderboard(pIdx); 

    fbHTML += `<div style="font-size:1.05rem; color:var(--dark-text); margin-top:10px;">${realA} - ${realS}</div>`;
    if (state.gameState.mode === 'movie') fbHTML += `<div style="font-size:0.9rem; color:var(--primary); margin-top:3px;">🎬 ${realM}</div>`;

    document.getElementById('feedback').innerHTML = fbHTML; document.getElementById('feedback').classList.add('fade-in');
    
    const img = document.getElementById('reveal-art');
    img.src = state.songs[state.curIdx].artworkUrl100.replace('100x100bb', '400x400bb'); img.classList.add('fade-in'); img.style.display = 'block';

    if(document.getElementById('guess-artist')) document.getElementById('guess-artist').value = ""; 
    if(document.getElementById('guess-song')) document.getElementById('guess-song').value = ""; 
    if(document.getElementById('guess-movie')) document.getElementById('guess-movie').value = "";
    
    state.curIdx++; setTimeout(nextTrack, 4000); 
}



function shootConfetti() {
    for(let i=0; i<100; i++) {
        const conf = document.createElement('div');
        conf.style.position = 'fixed'; conf.style.width = '8px'; conf.style.height = '8px';
        conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        conf.style.left = Math.random() * 100 + 'vw'; conf.style.top = '-10px';
        conf.style.zIndex = '9999'; conf.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
        document.body.appendChild(conf);
        const fallDuration = Math.random() * 2 + 2;
        conf.animate([
            { transform: `translate3d(0,0,0) rotate(0deg)`, opacity: 1 },
            { transform: `translate3d(${Math.random()*200 - 100}px, 100vh, 0) rotate(${Math.random()*720}deg)`, opacity: 0 }
        ], { duration: fallDuration * 1000, easing: 'cubic-bezier(.37,0,.63,1)' }).onfinish = () => conf.remove();
    }
}

export function shareChallenge() {
    const normalizedScores = state.rawScores.map(s => getNormalizedScore(s));
    const maxScore = Math.max(...normalizedScores);
    const winIdx = normalizedScores.indexOf(maxScore);
    const grid = state.matchHistory[winIdx].reduce((res, item, idx) => { res += item; if ((idx + 1) % 5 === 0) res += '\n'; return res; }, '');
    let headerText = state.isDailyMode ? `🌍 Yardbird TODAY THREE` : `Yardbird's Song Trivia 🎸`;
    const trackIds = state.songs.map(s => s.trackId).join(',');
    const url = `${window.location.origin}${window.location.pathname}?score=${maxScore}&tracks=${trackIds}`;
    const text = `${headerText}\nScore: ${maxScore}/1000 Pts\n\n${grid}\nThink you can beat me? Play my exact songs here:`;
    
    if (navigator.share) { navigator.share({ title: "Beat My Score!", text: text, url: url }).catch(console.error); }
    else { navigator.clipboard.writeText(text + "\n" + url); alert("Challenge link & grid copied to clipboard! Paste it to your friends."); }
}

// --- Replace evaluateMultiplayerRound in gameLogic.js ---
export function evaluateMultiplayerRound(players) {
    if(state.isProcessing) return; 
    state.isProcessing = true;
    
    if(state.timerId) clearInterval(state.timerId); audio.pause(); 
    document.getElementById('visualizer').classList.add('paused'); document.getElementById('btn-container').classList.add('hidden');

    const realA = state.songs[state.curIdx].artistName; const realS = state.songs[state.curIdx].trackName; const realM = getMovieName(state.songs[state.curIdx]); 

    let fbHTML = `<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:15px; font-weight:bold;">`;
    const playerIds = Object.keys(players);
    const results = []; // 👈 NEW: Array to collect points
    
    playerIds.forEach((pid, index) => {
        const p = players[pid]; let roundPts = 0; let correct = false; let artOk = false, sonOk = false, movOk = false;
        let basePts = (p.guess && p.guess.phase === 'grace') ? 5 : (p.guess ? p.guess.time : 0);

        if (p.guess && p.guess.isMC) {
            correct = p.guess.correct; 
            if (correct) { roundPts = p.guess.time > 10 ? 5 : basePts; }
        } else {
            let artG = p.guess ? p.guess.artist || "" : ""; let sonG = p.guess ? p.guess.song || "" : ""; let movG = p.guess ? p.guess.movie || "" : "";
            if (state.gameState.mode === 'genre') {
                artOk = isCloseEnough(artG, realA, true); sonOk = isCloseEnough(sonG, realS, false);
                if (artOk || sonOk) { correct = true; roundPts = basePts; if (artOk && sonOk) roundPts *= 2; }
            } else if (state.gameState.mode === 'artist') {
                if (isCloseEnough(sonG, realS, false)) { correct = true; roundPts = basePts * 2; }
            } else if (state.gameState.mode === 'movie') {
                if (isCloseEnough(movG, realM, false)) { correct = true; roundPts = basePts * 2; }
            }
            if (correct && p.guess && p.guess.phase === 'grace') roundPts = 5;
        }

        if (correct) {
            if (!(p.guess && p.guess.isMC)) {
                state.streaks[index]++;
                if (state.streaks[index] % 3 === 0) { roundPts += 50; fbHTML += `<div style="color:var(--primary); font-size:0.85rem; margin-top:5px;">+50 PURE STREAK BONUS</div>`; }
            } else { state.streaks[index] = 0; }

            if (state.doubleRounds && state.doubleRounds.includes(state.curIdx)) {
                roundPts *= 2; fbHTML += `<div style="color:#f39c12; font-size:0.85rem; margin-top:2px; font-weight:bold;">⭐ 2X BONUS APPLIED!</div>`;
            }
            
            state.rawScores[index] += roundPts;
            fbHTML += `<div style="color:var(--success); font-size:1.1rem;">✅ ${p.nickname || p.name || "Player"}: +${roundPts}</div>`;
        } else {
            fbHTML += `<div style="color:var(--fail); font-size:1.1rem;">❌ ${p.nickname || p.name || "Player"}: 0</div>`;
            state.streaks[index] = 0;
        }

        // 👈 NEW: Push the calculated score to the array
        results.push({
            id: pid,
            newScore: (p.score || 0) + roundPts
        });
    });
    
    fbHTML += `</div>`;
    fbHTML += `<div style="font-size:1.05rem; color:var(--dark-text); margin-top:10px;">${realA} - ${realS}</div>`;
    if (state.gameState.mode === 'movie') fbHTML += `<div style="font-size:0.9rem; color:var(--primary); margin-top:3px;">🎬 ${realM}</div>`;

    updateLeaderboard(-1); 
    document.getElementById('feedback').innerHTML = fbHTML; document.getElementById('feedback').classList.add('fade-in');
    
    const img = document.getElementById('reveal-art');
    img.src = state.songs[state.curIdx].artworkUrl100.replace('100x100bb', '400x400bb'); img.classList.add('fade-in'); img.style.display = 'block';

    state.curIdx++; 
    
    // 👈 NEW: Sync with platform and set local timer
    window.finalizeMultiplayerRound(results);
    setTimeout(nextTrack, 5000); 
}


// --- Replace endGameSequence in gameLogic.js ---
function endGameSequence() {
    document.getElementById('play-screen').classList.add('hidden');
    document.getElementById('final-screen').classList.remove('hidden');
    
    if(state.isDailyMode) { document.getElementById('main-title').innerText = "🌍 TODAY THREE CHALLENGE"; }
    
    document.getElementById('final-subtitle').innerText = "Scores Normalized to 1000";
    
    updateLeaderboard(-1); shootConfetti(); 
    
    const normalizedScores = state.rawScores.map(s => getNormalizedScore(s));
    const maxScore = Math.max(...normalizedScores); const winIdx = normalizedScores.indexOf(maxScore);

    if (state.isMultiplayer && state.isHost && state.roomCode) {
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            const players = snap.val();
            if (players) {
                const pIds = Object.keys(players);
                let finalResults = [];
                pIds.forEach((pid, index) => {
                    // 👈 NEW: Calculate the Normalized Score using Firebase Data!
                    const rawFirebaseScore = players[pid].score || 0;
                    const normScore = getNormalizedScore(rawFirebaseScore);
                    
                    finalResults.push({ name: players[pid].nickname || players[pid].name || "Player", score: normScore, id: pid });
                    db.ref(`rooms/${state.roomCode}/players/${pid}`).update({ finalScore: normScore });
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
                document.getElementById('winner-text').innerHTML = podiumHTML; document.getElementById('final-grid').innerHTML = ""; 
                const challengeBtn = document.querySelector('button[onclick="shareChallenge()"]'); if(challengeBtn) challengeBtn.style.display = 'none';
                const playlistBox = document.querySelector('.playlist-box'); if(playlistBox) playlistBox.style.display = 'none';
            }
            db.ref(`rooms/${state.roomCode}/state`).set('finished');
        });
    } else {
        // Custom hype text for Song Trivia
        const hypeText = maxScore > 800 ? "Music Maestro! 🎧" : (maxScore > 500 ? "Solid Ear! 📻" : "Keep Listening! 🎶");
        
        document.getElementById('winner-text').innerHTML = `
            <div style="background: linear-gradient(135deg, #ff6b6b, var(--primary)); padding: 50px 20px; border-radius: 24px; color: white; box-shadow: 0 12px 24px rgba(255, 107, 107, 0.2); margin: 30px 0; text-align: center;">
                <div style="font-size: 1.1rem; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; opacity: 0.9; margin-bottom: 10px;">Final Score</div>
                <div style="font-size: 5.5rem; font-weight: 900; line-height: 1; text-shadow: 2px 4px 10px rgba(0,0,0,0.2);">${maxScore}</div>
                <div style="font-size: 1.2rem; font-weight: 600; margin-top: 15px; opacity: 0.9;">${hypeText}</div>
            </div>
        `;
        document.getElementById('winner-text').style.color = ''; 
        
        // Preserve the awesome emoji grid!
        let gridHTML = '<div style="font-size:1.8rem; letter-spacing:4px; margin: 15px 0; text-align:center; color: var(--dark-text);">';
        state.matchHistory[winIdx].forEach((res, idx) => { gridHTML += res; if ((idx + 1) % 5 === 0) gridHTML += '<br>'; });
        gridHTML += '</div>'; 
        document.getElementById('final-grid').innerHTML = gridHTML;
    }

    state.userStats.song_trivia.gamesPlayed++;
    state.userStats.platformGamesPlayed++;
    if (maxScore > state.userStats.song_trivia.hsText) state.userStats.song_trivia.hsText = maxScore;
    if (maxScore > 900) state.userStats.song_trivia.trophies.perf = true;
    if (state.roundsPerPlayer >= 20) state.userStats.song_trivia.trophies.mara = true;
    if (state.userStats.song_trivia.sniperHits >= 10) state.userStats.song_trivia.trophies.snip = true;
    if (state.isDailyMode) state.userStats.song_trivia.playedDailyToday = true;

    const todayStr = new Date().toDateString();
    if (state.userStats.song_trivia.lastPlayedDate !== todayStr) {
        let yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        if (state.userStats.song_trivia.lastPlayedDate === yesterday.toDateString()) state.userStats.song_trivia.currentStreak++; else state.userStats.song_trivia.currentStreak = 1;
        state.userStats.song_trivia.lastPlayedDate = todayStr;
    }
    if (state.userStats.song_trivia.currentStreak >= 5) state.userStats.song_trivia.trophies.streak = true;
    saveStats();

    if (maxScore > state.globalHighScore && maxScore > 0) { localStorage.setItem('yardbirdHighScore', maxScore); document.getElementById('new-record-msg').style.display = 'block'; }
}

async function extractPlaylistData(urlInput) {
    let extractedTracks = [];
    let validPool = [];
    
    const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(urlInput)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Proxy blocked (HTTP ${response.status})`);
    const html = await response.text();

    if (urlInput.includes('music.apple.com')) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        let playlistData = null;
        scripts.forEach(script => {
            if (script.innerText.includes('MusicPlaylist')) {
                try { playlistData = JSON.parse(script.innerText); } catch(e) {}
            }
        });
        if (!playlistData || !playlistData.track) throw new Error("Could not find public track data. Ensure playlist is public.");
        
        extractedTracks = playlistData.track.map(t => {
            let artistName = "";
            if (t.byArtist) {
                if (Array.isArray(t.byArtist) && t.byArtist.length > 0) {
                    artistName = t.byArtist[0].name;
                } else {
                    artistName = t.byArtist.name || "";
                }
            }
            return { title: t.name, artist: artistName };
        });
    } else {
        throw new Error("Only Apple Music playlists are currently supported in this mode.");
    }

    if (extractedTracks.length === 0) throw new Error("No tracks extracted from the playlist.");

    const tracksToProcess = extractedTracks.slice(0, 40);
    const searchPromises = tracksToProcess.map(async (track) => {
        let cleanTitle = track.title.replace(/\(Official.*?\)/gi, '').replace(/\[Official.*?\]/gi, '').trim();
        const query = encodeURIComponent(`${cleanTitle} ${track.artist}`.trim());
        
        try {
            const res = await fetch(`https://itunes.apple.com/search?term=${query}&limit=1&entity=song`);
            const data = await res.json();
            if (data.results && data.results.length > 0 && data.results[0].previewUrl) {
                return data.results[0]; 
            }
        } catch (e) {
            console.warn("iTunes match failed for:", track.title);
        }
        return null;
    });

    const resolvedTracks = await Promise.all(searchPromises);
    validPool = resolvedTracks.filter(track => track !== null);

    if (validPool.length < 3) throw new Error("Could not find enough playable audio files for this playlist.");
    
    return validPool; 
}

import { subOptions } from './state.js'; // Ensure this is imported at the top of gameLogic.js!

export function onModeSelect(mode) {
    const customInput = document.getElementById('custom-input');
    const subArea = document.getElementById('sub-selection-area');
    
    if (subOptions[mode]) {
        state.gameState.sub = subOptions[mode][0]; 
        document.getElementById('sub-label').innerText = mode === 'movie' ? 'Select Cinema Region' : (mode === 'artist' ? 'Select Artist' : 'Select Era / Genre');
        customInput.classList.add('hidden');
        customInput.placeholder = "Paste your Public Apple Music Playlist or any custom text comma separated";
        customInput.type = "text";
        subArea.classList.remove('hidden');

        // Render the pills locally!
        const container = document.getElementById('sub-pills');
        container.innerHTML = '';
        subOptions[mode].forEach(opt => {
            const pill = document.createElement('div');
            pill.className = `pill pill-wide ${state.gameState.sub === opt ? 'active' : ''}`;
            pill.innerText = opt === 'shwe-special' ? 'Shwe Special (90s)' : (opt.charAt(0).toUpperCase() + opt.slice(1).replace(/-/g, ' '));
            pill.onclick = () => window.setSub(opt, pill);
            container.appendChild(pill);
        });
    }

    const levelGroup = document.getElementById('level-group');
    if (mode === 'movie') {
        window.setLevel('medium', document.getElementById('lvl-medium'));
        levelGroup.style.opacity = '0.5';
        levelGroup.style.pointerEvents = 'none';
    } else {
        levelGroup.style.opacity = '1';
        levelGroup.style.pointerEvents = 'auto';
    }
}

export function onSubSelect(val) {
    const customInput = document.getElementById('custom-input');
    if (val === 'custom') {
        customInput.classList.remove('hidden');
        customInput.placeholder = "Paste your Public Apple Music Playlist or any custom text comma separated";
        customInput.type = "text";
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
    }
}

// Add to gameLogic.js
export function hasPlayedDaily() {
    return state.userStats.song_trivia ? state.userStats.song_trivia.playedDailyToday : false;
}

export function checkDailyReset() {
    const todayStr = new Date().toDateString();
    if (state.userStats.song_trivia && state.userStats.song_trivia.lastPlayedDate !== todayStr && state.userStats.song_trivia.lastPlayedDate !== null) {
        state.userStats.song_trivia.playedDailyToday = false;
        localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
    }
}
