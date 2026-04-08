// gameLogic.js
import { db } from './firebase.js';
import { state, audio, sfxTick, sfxCheer, sfxBuzzer, colors, top20DisneyMovies, top20BollywoodMovies, top20TamilMovies, top20HollywoodMovies, shweArtistsFull, oneHitWondersFull } from './state.js';
import { populateStats } from './ui.js';

export const manifest = {
    id: "song_trivia",
    title: "SONG TRIVIA",
    subtitle: "Yardbird's Original Masterpiece",
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
    clientUI: "typing-and-mc" 
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
        const dailyIds = vault[dayOfYear % vault.length];
        
        const apiRes = await fetch(`https://itunes.apple.com/lookup?id=${dailyIds.join(',')}`);
        const data = await apiRes.json();
        
        state.globalPool = data.results;
        state.songs = state.globalPool;
        
        state.rawScores = [0]; state.streaks = [0]; state.matchHistory = [[]];
        launchGameUI();
    } catch (e) {
        alert(e.message || "Daily Vault requires db_daily.json. Playing fallback...");
        const fallbackRes = await fetch(`https://itunes.apple.com/search?term=pop+rock+hits&limit=20&entity=song`);
        const fallbackData = await fallbackRes.json();
        state.globalPool = fallbackData.results.filter(t => t.previewUrl);
        state.songs = state.globalPool.sort(() => 0.5 - Math.random()).slice(0, 3);
        state.rawScores = [0]; state.streaks = [0]; state.matchHistory = [[]];
        launchGameUI();
    }
}

export function startGame() {
    state.isDailyMode = false;
    state.numPlayers = state.gameState.players;
    state.timeLimit = state.gameState.level === 'hard' ? 10 : 30; 
    state.roundsPerPlayer = state.gameState.rounds;
    state.maxRounds = state.roundsPerPlayer * state.numPlayers;
    
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
        const bColor = isActive ? colors[i % colors.length] : '#333';
        const tColor = isActive ? colors[i % colors.length] : '#666';
        const ptsColor = isActive ? '#fff' : '#aaa';
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
        const customVal = document.getElementById('custom-input').value;
        const seenTracks = new Set(); const artistCount = {}; 
        let hitLimit = state.gameState.level === 'easy' ? 15 : 150; 
        
        if (state.gameState.mode === 'movie') {
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
        
        launchGameUI();
    } catch (e) { 
        alert(e.message || "Network Error or iTunes timeout. Please try again."); 
        document.getElementById('feedback-setup').innerText = "";
        document.getElementById('start-btn-top').style.display = 'block';
        document.getElementById('daily-btn-top').style.display = 'block';
    }
}

function launchGameUI() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');
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

    // --- NEW: PRE-GENERATE MC OPTIONS FOR THIS ROUND ---
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
    // --------------------------------------------------
    
    const pIdx = state.curIdx % state.numPlayers;
    const currentColor = colors[pIdx % colors.length]; 
    const tag = document.getElementById('active-player');
    
    if (state.isMultiplayer && state.isHost) {
        updateLeaderboard(-1); 
        document.documentElement.style.setProperty('--active-vis', 'var(--highlight)');
        document.getElementById('main-title').style.color = '#ffffff';
        tag.innerText = `ROUND ${state.curIdx + 1} / ${state.maxRounds}`;
        tag.style.color = "var(--highlight)"; tag.style.borderColor = "var(--highlight)";
        db.ref(`rooms/${state.roomCode}/currentRound`).set(state.curIdx + 1);
        db.ref(`rooms/${state.roomCode}/currentMC`).remove(); // Hide from phones

        // Secretly save the options in the background for individual phones to grab!
        let fbOptions = state.currentMCOptions.map(opt => ({ str: opt.str, isCorrect: opt.correct }));
        db.ref(`rooms/${state.roomCode}/roundMC`).set(fbOptions);

    } else {
        updateLeaderboard(pIdx); 
        document.documentElement.style.setProperty('--active-vis', currentColor);
        if(!state.isDailyMode) document.getElementById('main-title').style.color = currentColor;
        const currentRound = Math.floor(state.curIdx / state.numPlayers) + 1;
        tag.innerText = state.numPlayers > 1 ? `PLAYER ${pIdx + 1} TURN (Round ${currentRound}/${state.roundsPerPlayer})` : `Round ${currentRound}/${state.roundsPerPlayer}`;
        tag.style.color = currentColor; tag.style.borderColor = currentColor;
        document.getElementById('stop-btn').style.backgroundColor = currentColor; document.getElementById('stop-btn').style.color = "#000";
        document.getElementById('submit-btn').style.backgroundColor = currentColor; document.getElementById('submit-btn').style.color = "#000";
    }
    
    document.getElementById('feedback').innerHTML = ""; document.getElementById('feedback').classList.remove('fade-in');
    document.getElementById('reveal-art').style.display = 'none'; document.getElementById('reveal-art').classList.remove('fade-in');
    document.getElementById('timer').innerText = "Load..."; document.getElementById('timer').style.color = '#fff';
    document.getElementById('visualizer').classList.remove('active', 'paused'); document.getElementById('visualizer').classList.add('hidden');
    
    if (state.isMultiplayer && state.isHost) {
        document.getElementById('btn-container').classList.add('hidden');
        document.getElementById('feedback').innerHTML = `<div id="host-lock-status" style="color:var(--brand); font-size:1.3rem; font-weight:bold; margin-top:20px;">LOCKED IN: 0 / ${state.numPlayers}</div>`;
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

    audio.src = state.songs[state.curIdx].previewUrl; 
    audio.load();

    let playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.then(_ => { startRoundClock(); }).catch(error => { startRoundClock(); });
    } else {
        startRoundClock();
    }
}

function startRoundClock() {
    document.getElementById('visualizer').classList.remove('hidden'); document.getElementById('visualizer').classList.add('active');
    state.timeLeft = state.timeLimit; state.startTime = Date.now();
    state.scoreLock = 0; state.isGracePeriod = false;
    document.getElementById('timer').innerText = state.timeLeft; document.getElementById('timer').style.color = 'var(--highlight)';

    state.timerId = setInterval(() => {
        state.timeLeft--; document.getElementById('timer').innerText = state.timeLeft;
        if (state.isMultiplayer && state.isHost) {
            db.ref(`rooms/${state.roomCode}/timeLeft`).set(state.timeLeft);
            db.ref(`rooms/${state.roomCode}/phase`).set(state.isGracePeriod ? 'grace' : 'audio');
        }
        if (state.timeLeft <= 3 && state.timeLeft > 0 && !state.hasUsedLifeline) { 
            document.getElementById('timer').style.color = '#ff3333'; sfxTick.currentTime = 0; sfxTick.play().catch(e => {}); 
        }
        if (state.timeLeft === 10 && !state.isGracePeriod && state.gameState.level !== 'hard' && !state.hasUsedLifeline) {
            if (state.isMultiplayer && state.isHost) { db.ref(`rooms/${state.roomCode}/lifelineForced`).set(true); triggerLifeline(); } else { triggerLifeline(); }
        }
        
        if (state.timeLeft <= 0) {
            if (state.isMultiplayer && state.isHost && !state.isGracePeriod) {
                state.isGracePeriod = true; state.timeLeft = 30; audio.pause();
                document.getElementById('visualizer').classList.add('paused');
                document.getElementById('feedback').innerHTML += `<div style="color:var(--p4); font-size:1.1rem; margin-top:10px; font-weight:bold;">Song completed! Please submit final answers in the next 30 seconds.</div>`;
            } else {
                if(state.timerId) clearInterval(state.timerId); audio.pause();
                document.getElementById('visualizer').classList.add('paused');
                
                if (state.isMultiplayer && state.isHost) {
                    db.ref(`rooms/${state.roomCode}/players`).once('value', snap => { evaluateMultiplayerRound(snap.val()); });
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
        state.timeLeft = 10; document.getElementById('timer').innerText = state.timeLeft; triggerLifeline();
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

        let guessTime = 20; document.getElementById('timer').innerText = guessTime; document.getElementById('timer').style.color = '#ffcc00'; 
        state.guessTimerId = setInterval(() => {
            guessTime--; document.getElementById('timer').innerText = guessTime;
            if (guessTime <= 3 && guessTime > 0) { document.getElementById('timer').style.color = '#ff3333'; sfxTick.currentTime = 0; sfxTick.play().catch(e => {}); }
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
        btn.onclick = () => evaluateGuess(opt.correct); container.appendChild(btn);
    });

    if (state.isMultiplayer && state.isHost) {
        let fbOptions = state.currentMCOptions.map(opt => ({ str: opt.str, isCorrect: opt.correct }));
        db.ref(`rooms/${state.roomCode}/currentMC`).set(fbOptions); // Force it to all phones
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

export function evaluateGuess(isCorrectMC = null) {
    if(state.isProcessing && isCorrectMC === null) return; 
    state.isProcessing = true;
    
    if(state.timerId) clearInterval(state.timerId); if(state.guessTimerId) clearInterval(state.guessTimerId); audio.pause(); 
    document.getElementById('visualizer').classList.add('paused');
    document.getElementById('guess-fields').classList.add('hidden'); document.getElementById('btn-container').classList.add('hidden');
    
    if (state.hasUsedLifeline) document.querySelectorAll('.mc-btn').forEach(b => b.disabled = true);

    const pIdx = state.curIdx % state.numPlayers;
    let roundPts = state.hasUsedLifeline ? Math.max(0, state.timeLeft) : state.scoreLock;
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
        if (artOk && sonOk) fbHTML += `<div style="color:${succColor}; font-size:1.2rem; font-weight:bold;">🔥 PERFECT DOUBLE!</div>`;
        else if (artOk || sonOk) fbHTML += `<div style="font-size:1.1rem; font-weight:bold; display:flex; justify-content:center; gap:15px;"><span style="color:${artOk ? succColor : failColor}">${artOk ? '✅' : '❌'} ARTIST</span><span style="color:#666;">|</span><span style="color:${sonOk ? succColor : failColor}">${sonOk ? '✅' : '❌'} SONG</span></div>`;
        else fbHTML += `<div style="color:${failColor}; font-size:1.2rem; font-weight:bold;">❌ INCORRECT</div>`;
    } else {
        if (correct) fbHTML += `<div style="color:${succColor}; font-size:1.2rem; font-weight:bold;">🔥 CORRECT!</div>`;
        else fbHTML += `<div style="color:${failColor}; font-size:1.2rem; font-weight:bold;">❌ INCORRECT</div>`;
    }

    if (correct) {
        state.streaks[pIdx]++;
        if(fbHTML.includes("DOUBLE") || fbHTML.includes("CORRECT")) { sfxCheer.currentTime=0; sfxCheer.play().catch(e=>{}); }
        if (state.streaks[pIdx] % 3 === 0) { roundPts += 50; fbHTML += `<div style="color:var(--p4); font-size:0.85rem; margin-top:5px;">+50 STREAK BONUS</div>`; }
    } else {
        sfxBuzzer.currentTime = 0; sfxBuzzer.play().catch(e=>{});
        state.streaks[pIdx] = 0; roundPts = 0; 
    }

    state.rawScores[pIdx] += roundPts; updateLeaderboard(pIdx); 

    fbHTML += `<div style="font-size:1.05rem; color:#fff; margin-top:10px;">${realA} - ${realS}</div>`;
    if (state.gameState.mode === 'movie') fbHTML += `<div style="font-size:0.9rem; color:#ffcc00; margin-top:3px;">🎬 ${realM}</div>`;

    document.getElementById('feedback').innerHTML = fbHTML; document.getElementById('feedback').classList.add('fade-in');
    
    const img = document.getElementById('reveal-art');
    img.src = state.songs[state.curIdx].artworkUrl100.replace('100x100bb', '400x400bb'); img.classList.add('fade-in'); img.style.display = 'block';

    if(document.getElementById('guess-artist')) document.getElementById('guess-artist').value = ""; 
    if(document.getElementById('guess-song')) document.getElementById('guess-song').value = ""; 
    if(document.getElementById('guess-movie')) document.getElementById('guess-movie').value = "";
    
    state.curIdx++; setTimeout(nextTrack, 4000); 
}

export function evaluateMultiplayerRound(players) {
    if(state.isProcessing) return; 
    state.isProcessing = true;
    
    if(state.timerId) clearInterval(state.timerId); audio.pause(); 
    document.getElementById('visualizer').classList.add('paused'); document.getElementById('btn-container').classList.add('hidden');

    const realA = state.songs[state.curIdx].artistName; const realS = state.songs[state.curIdx].trackName; const realM = getMovieName(state.songs[state.curIdx]); 

    let fbHTML = `<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:15px; font-weight:bold;">`;
    const playerIds = Object.keys(players);
    
    playerIds.forEach((pid, index) => {
        const p = players[pid]; let roundPts = 0; let correct = false; let artOk = false, sonOk = false, movOk = false;
        let basePts = (p.guess && p.guess.phase === 'grace') ? 5 : (p.guess ? p.guess.time : 0);

        if (p.guess && p.guess.isMC) {
            correct = p.guess.correct; if (correct) roundPts = basePts; 
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
            state.streaks[index]++;
            if (state.streaks[index] % 3 === 0) { roundPts += 50; } 
            state.rawScores[index] += roundPts;
            fbHTML += `<div style="color:var(--success); font-size:1.1rem;">✅ ${p.name}: +${roundPts}</div>`;
        } else {
            fbHTML += `<div style="color:var(--fail); font-size:1.1rem;">❌ ${p.name}: 0</div>`;
            state.streaks[index] = 0;
        }
    });
    fbHTML += `</div>`;
    fbHTML += `<div style="font-size:1.05rem; color:#fff; margin-top:10px;">${realA} - ${realS}</div>`;
    if (state.gameState.mode === 'movie') fbHTML += `<div style="font-size:0.9rem; color:#ffcc00; margin-top:3px;">🎬 ${realM}</div>`;

    updateLeaderboard(-1); 
    document.getElementById('feedback').innerHTML = fbHTML; document.getElementById('feedback').classList.add('fade-in');
    
    const img = document.getElementById('reveal-art');
    img.src = state.songs[state.curIdx].artworkUrl100.replace('100x100bb', '400x400bb'); img.classList.add('fade-in'); img.style.display = 'block';

    state.curIdx++; setTimeout(nextTrack, 5000); 
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

function endGameSequence() {
    document.getElementById('play-screen').classList.add('hidden');
    document.getElementById('final-screen').classList.remove('hidden');
    if(state.isDailyMode) { document.getElementById('main-title').innerText = "🌍 TODAY THREE CHALLENGE"; }
    document.getElementById('main-title').style.color = '#ffffff'; 
    
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
                    const normScore = normalizedScores[index] || 0;
                    finalResults.push({ name: players[pid].name, score: normScore, id: pid });
                    db.ref(`rooms/${state.roomCode}/players/${pid}`).update({ finalScore: normScore });
                });
                
                finalResults.sort((a, b) => b.score - a.score); 
                let podiumHTML = `<div style="margin-top: 15px; text-align: left; background: var(--surface); padding: 15px; border-radius: 12px; border: 1px solid var(--border);"><h3 style="margin-top:0; color:var(--brand); text-align:center; text-transform:uppercase; margin-bottom:15px;">Final Standings</h3>`;
                finalResults.forEach((p, idx) => {
                    let medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : '👏'));
                    let color = idx === 0 ? 'var(--p1)' : (idx === 1 ? 'var(--p2)' : '#ccc');
                    podiumHTML += `<div style="display:flex; justify-content:space-between; padding: 12px 5px; border-bottom: 1px solid #333; font-size: 1.3rem; font-weight: bold; color: ${color};"><span>${medal} ${p.name}</span><span style="font-family:'Courier New', monospace;">${p.score}</span></div>`;
                });
                podiumHTML += `</div>`;
                document.getElementById('winner-text').innerHTML = podiumHTML; document.getElementById('final-grid').innerHTML = ""; 
                const challengeBtn = document.querySelector('button[onclick="shareChallenge()"]'); if(challengeBtn) challengeBtn.style.display = 'none';
                const playlistBox = document.querySelector('.playlist-box'); if(playlistBox) playlistBox.style.display = 'none';
            }
            db.ref(`rooms/${state.roomCode}/state`).set('finished');
        });
    } else {
        document.getElementById('winner-text').innerText = state.numPlayers > 1 ? `🏆 PLAYER ${winIdx + 1} WINS! Total: ${maxScore} Pts` : `🏆 Final Score: ${maxScore} Pts`;
        document.getElementById('winner-text').style.color = colors[winIdx];
        let gridHTML = '<div style="font-size:1.8rem; letter-spacing:4px; margin: 15px 0; text-align:center;">';
        state.matchHistory[winIdx].forEach((res, idx) => { gridHTML += res; if ((idx + 1) % 5 === 0) gridHTML += '<br>'; });
        gridHTML += '</div>'; document.getElementById('final-grid').innerHTML = gridHTML;
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
