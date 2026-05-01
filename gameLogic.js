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


// ==============================================================================
// SECTION 1 — IMPORTS & MODULE-LEVEL STATE
// ==============================================================================

import { db } from './firebase.js';
import {
    state, audio, sfxTick, sfxCheer, sfxBuzzer, colors,
    top20DisneyMovies, top20BollywoodMovies, top20TamilMovies,
    top20HollywoodMovies, shweArtistsFull, oneHitWondersFull
} from './state.js';
import { populateStats } from './ui.js';


// ==============================================================================
// SECTION 2 — MANIFEST (CARTRIDGE CONTRACT)
// ==============================================================================

export const manifest = {
    id: "song_trivia",
    title: "SONG TRIVIA",
    subtitle: "Yardbird's Original Masterpiece",
    hasDaily: true,
    rulesHTML: `
        <h2>How to Play</h2>
        <ul style="padding-left: 20px; font-size: 0.95rem; line-height: 1.6; color: #ccc;">
            <li><strong>Modes:</strong> Play Classic Genre, Artist-Specific, or Guess the Movie!</li>
            <li><strong>Today Three:</strong> A daily synced challenge — same songs for everyone.</li>
            <li><strong>The Lifeline:</strong> Multiple Choice options appear at 10 seconds. Call it early to skip typing.</li>
            <li><strong>Scoring:</strong> Get both Artist + Song = 2× points. Speed matters.</li>
            <li><strong>Streak:</strong> 3 correct in a row = +50 bonus (typing mode only).</li>
        </ul>
        <button class="btn btn-main" onclick="hideModal('rules-modal')" style="margin-top: 10px; width: 100%;">
            Got it! Let's Play
        </button>
    `,
    modes: [
        { id: "genre",  title: "🎵 Guess the Artist & Song", desc: "Play by Era, Decade, or specific Genre." },
        { id: "artist", title: "🎤 Guess the Song",           desc: "Focus strictly on a single Artist's catalog." },
        { id: "movie",  title: "🎬 Guess the Movie",          desc: "Identify the film from its original soundtrack." }
    ],
    levels: [
        { id: "easy",   title: "🟢 Easy (Top Hits)",        desc: "30s. Iconic hits. Lifeline at 10s." },
        { id: "medium", title: "🟡 Medium (Deep Catalog)",  desc: "30s. All songs, including B-sides. Lifeline enabled." },
        { id: "hard",   title: "🔴 Hard (The 10s Sprint)",  desc: "10s cutoff. Pure recall typing. No Lifeline." }
    ],
    clientUI: "typing-and-mc",
    initialStats: {
        gamesPlayed: 0,
        highScore: 0,
        trophies: [],
        lastPlayedDate: null
    }
};


// ==============================================================================
// SECTION 3 — STATS PERSISTENCE
// ==============================================================================

function saveStats() {
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
}

export function resetStats() {
    if (confirm("Are you sure you want to reset all lifetime stats and trophies? This cannot be undone.")) {
        state.userStats.song_trivia = {
            gamesPlayed: 0, highScore: 0, hsText: 0,
            sniperHits: 0, currentStreak: 0, lastPlayedDate: null,
            playedDailyToday: false,
            modesPlayed: { genre: false, artist: false, movie: false },
            trophies: { perf: false, mara: false, snip: false, streak: false, expl: false }
        };
        saveStats();
        alert("Song Trivia stats and trophies have been reset.");
        if (window.hideModal) window.hideModal('stats-modal');
    }
}


// ==============================================================================
// SECTION 4 — STATS UI & TROPHY SYSTEM
// ==============================================================================

export function renderStatsUI() {
    const st = state.userStats.song_trivia || {};
    const tr = st.trophies || {};

    document.getElementById('stats-content').innerHTML = `
        <h2 style="color:var(--brand); margin-top:0; text-align:center; border-bottom:1px solid #333; padding-bottom:15px;">Song Trivia Locker</h2>
        <div class="stat-grid">
            <div class="stat-box">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Games Played</div>
                <div class="stat-val">${st.gamesPlayed || 0}</div>
            </div>
            <div class="stat-box">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">High Score</div>
                <div class="stat-val" style="color:var(--p1)">${st.hsText || 0}</div>
            </div>
            <div class="stat-box">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Day Streak</div>
                <div class="stat-val" style="color:var(--p3)">${st.currentStreak || 0}</div>
            </div>
            <div class="stat-box">
                <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">Sniper Hits</div>
                <div class="stat-val">${st.sniperHits || 0}</div>
            </div>
        </div>
        <hr style="border-color:#333; margin:15px 0;">
        <h3 style="text-align:center; color:#aaa; text-transform:uppercase; font-size:0.85rem; letter-spacing:2px; margin-bottom:15px;">Trophy Locker</h3>
        <div class="trophy-row ${tr.perf   ? 'unlocked' : ''}"><div class="trophy-icon">🏆</div><div class="trophy-text"><h4>The Perfectionist</h4><p>Score 900+ points in a single game.</p></div></div>
        <div class="trophy-row ${tr.mara   ? 'unlocked' : ''}"><div class="trophy-icon">🏃</div><div class="trophy-text"><h4>The Marathoner</h4><p>Play a 20+ round session.</p></div></div>
        <div class="trophy-row ${tr.snip   ? 'unlocked' : ''}"><div class="trophy-icon">🎯</div><div class="trophy-text"><h4>The Sniper</h4><p>Guess 10 songs correctly in under 3 seconds.</p></div></div>
        <div class="trophy-row ${tr.streak ? 'unlocked' : ''}"><div class="trophy-icon">🔥</div><div class="trophy-text"><h4>The Daily Devotee</h4><p>Play 5 days in a row.</p></div></div>
        <div class="trophy-row ${tr.expl   ? 'unlocked' : ''}"><div class="trophy-icon">🗺️</div><div class="trophy-text"><h4>The Explorer</h4><p>Play all 3 game modes.</p></div></div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;">
            <button class="btn btn-main" onclick="hideModal('stats-modal')" style="flex:1; margin-right:10px;">Close</button>
            <button class="btn btn-reset" onclick="if(window.activeCartridge&&window.activeCartridge.resetStats){window.activeCartridge.resetStats();hideModal('stats-modal');}" style="margin-top:0; padding:16px;">Reset</button>
        </div>`;
}


// ==============================================================================
// SECTION 5 — DAILY CHALLENGE (TODAY THREE)
// ==============================================================================

export async function startDailyChallenge() {
    // 🎵 PRIMER: Permanently unlock audio for this session BEFORE the network fetch
    audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    audio.play().then(() => audio.pause()).catch(() => {});

    state.isDailyMode  = true;
    state.numPlayers   = 1;
    state.roundsPerPlayer = 3;
    state.maxRounds    = 3;
    state.timeLimit    = 30;
    state.gameState.level = 'easy';

    document.getElementById('start-btn-top').style.display = 'none';
    document.getElementById('daily-btn-top').style.display = 'none';
    document.getElementById('feedback-setup').innerText = "Loading Today's Global Mix...";

    const now       = new Date();
    const start     = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / 86400000);

    // Blocklist: reject known junk track labels
    const blocklist = /\b(cover|karaoke|tribute|instrumental|lullaby|remix|live|acoustic|mashup|compilation)\b/i;

    try {
        const res = await fetch('db_daily.json');
        if (!res.ok) throw new Error("Could not find db_daily.json");
        const vault = await res.json();

        const todaysTargets = vault[dayOfYear % vault.length];
        state.songs = [];

        for (const target of todaysTargets) {
            const query      = encodeURIComponent(`${target.artist} ${target.song}`);
            const trackRes   = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=15`);
            const trackData  = await trackRes.json();

            if (trackData.results?.length > 0) {
                const bestMatch = trackData.results.find(t => {
                    if (!t.previewUrl) return false;
                    const trackName    = t.trackName.toLowerCase();
                    const artistName   = t.artistName.toLowerCase();
                    const targetSong   = target.song.toLowerCase();
                    const targetArtist = target.artist.toLowerCase();
                    // Must be an exact-ish name match and pass the blocklist
                    if (!trackName.includes(targetSong) && !targetSong.includes(trackName)) return false;
                    if (!artistName.includes(targetArtist) && !targetArtist.includes(artistName)) return false;
                    if (blocklist.test(t.trackName) || blocklist.test(t.collectionName || '')) return false;
                    return true;
                });
                if (bestMatch) state.songs.push(bestMatch);
            }
        }

        if (state.songs.length === 0) throw new Error("No daily tracks found.");

        // Shared pool for MC wrong-answer generation
        const fallback = await fetch(`https://itunes.apple.com/search?term=pop+hits&limit=50&entity=song`);
        const fallbackData = await fallback.json();
        state.globalPool = fallbackData.results.filter(t => t.previewUrl);

        state.maxRounds       = state.songs.length;
        state.roundsPerPlayer = state.maxRounds;
        state.rawScores    = [0];
        state.streaks      = [0];
        state.matchHistory = [[]];
        state.doubleRounds = [];

        launchGameUI();

    } catch (err) {
        console.error(err);
        console.warn("Daily fetch failed — playing fallback...");
        const fallbackRes  = await fetch(`https://itunes.apple.com/search?term=pop+rock+hits&limit=20&entity=song`);
        const fallbackData = await fallbackRes.json();
        state.globalPool   = fallbackData.results.filter(t => t.previewUrl);
        state.songs        = state.globalPool.sort(() => 0.5 - Math.random()).slice(0, 3);
        state.maxRounds       = state.songs.length;
        state.roundsPerPlayer = state.maxRounds;
        state.rawScores    = [0]; state.streaks = [0]; state.matchHistory = [[]];
        state.doubleRounds = [];
        launchGameUI();
    }
}


// ==============================================================================
// SECTION 6 — ITUNES FETCH LOGIC (executeFetchLogic)
// ==============================================================================

export function startGame() {
    // 🎵 PRIMER: Permanently unlock audio for this session BEFORE the heavy fetching
    audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    audio.play().then(() => audio.pause()).catch(() => {});

    // ── Garbage collection: wipe state from other cartridges ──
    state.curIdx       = 0;
    state.songs        = [];
    state.globalPool   = [];
    state.matchHistory = [];

    state.isDailyMode     = false;
    state.numPlayers      = state.isMultiplayer ? state.numPlayers : 1;
    state.timeLimit       = state.gameState.level === 'hard' ? 10 : 30;
    
    // 🛠️ FALLBACK FIX: Force strict integer parsing to prevent empty-string math failures
    state.roundsPerPlayer = parseInt(state.gameState.rounds, 10);
    if (isNaN(state.roundsPerPlayer) || state.roundsPerPlayer <= 0) {
        state.roundsPerPlayer = 5; 
    }
    state.maxRounds       = state.roundsPerPlayer;

    document.getElementById('start-btn-top').style.display = 'none';
    document.getElementById('daily-btn-top').style.display = 'none';
    document.getElementById('feedback-setup').innerText = "Connecting to iTunes Database...";

    executeFetchLogic();
}

function getMovieName(track) {
    const fromMatch = track.trackName.match(/\bFrom\s+["']?([^"'\)]+)["']?\)/i);
    if (fromMatch?.[1]) return fromMatch[1].trim();
    let col = track.collectionName || "Unknown Movie";
    col = col
        .replace(/\(Original Motion Picture Soundtrack\)/ig, '')
        .replace(/Original Motion Picture Soundtrack/ig, '')
        .replace(/\(Original Score\)/ig, '')
        .replace(/\(Original Disney Soundtrack\)/ig, '')
        .replace(/- Single/ig, '')
        .replace(/- EP/ig, '')
        .trim();
    return col || "Unknown Movie";
}

async function executeFetchLogic() {
    const sub = state.gameState.sub;
    let pool  = [];
    const seenTracks  = new Set();
    const artistCount = {};

    // ── Range metadata for genre/decade modes ──
    const genreMeta = {
        '60s': { term: '60s hits', minYear: 1960, maxYear: 1969 },
        '70s': { term: '70s classic rock', minYear: 1970, maxYear: 1979 },
        '80s': { term: '80s pop hits', minYear: 1980, maxYear: 1989 },
        '90s': { term: '90s pop', minYear: 1990, maxYear: 1999 },
        '00s': { term: '2000s hits', minYear: 2000, maxYear: 2009 },
        '10s': { term: '2010s pop', minYear: 2010, maxYear: 2019 },
        '20s': { term: '2020s hits', minYear: 2020, maxYear: 2029 }
    };

    // ── Curated artist/genre lists from state.js ──
    const subLists = {
        disney:     top20DisneyMovies,
        bollywood:  top20BollywoodMovies,
        tamil:      top20TamilMovies,
        hollywood:  top20HollywoodMovies,
        shwe:       shweArtistsFull,
        onehit:     oneHitWondersFull
    };

    try {
        let apiSearchTerm = '';
        let minYear = 1960, maxYear = 2029;

        // ── Determine iTunes search strategy from sub-mode ──
        if (genreMeta[sub]) {
            apiSearchTerm = genreMeta[sub].term;
            minYear       = genreMeta[sub].minYear;
            maxYear       = genreMeta[sub].maxYear;
        } else if (subLists[sub] && state.gameState.mode === 'movie') {
            const hitLimit = state.maxRounds * 4;
            for (const title of subLists[sub]) {
                const fetchPromise   = fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title + ' soundtrack')}&limit=10&entity=song`);
                const timeoutPromise = new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 8000));
                const res = await Promise.race([fetchPromise, timeoutPromise]);
                const d   = await res.json();
                const filtered = d.results.filter(t => {
                    if (!t.previewUrl) return false;
                    const cleanTitle = t.trackName.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
                    if (seenTracks.has(cleanTitle)) return false;
                    seenTracks.add(cleanTitle);
                    return true;
                }).slice(0, Math.ceil(hitLimit / subLists[sub].length));
                pool = pool.concat(filtered);
            }
        } else if (subLists[sub] && state.gameState.mode === 'artist') {
            const hitLimit  = state.maxRounds * 4;
            const artists   = subLists[sub];
            for (const artist of artists) {
                const fetchPromise   = fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&limit=15&entity=song`);
                const timeoutPromise = new Promise((_, r) => setTimeout(() => r(new Error("Timeout")), 8000));
                const res = await Promise.race([fetchPromise, timeoutPromise]);
                const d   = await res.json();
                const filtered = d.results.filter(t => {
                    if (!t.previewUrl) return false;
                    const cleanTitle = t.trackName.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
                    if (seenTracks.has(cleanTitle)) return false;
                    if (!t.artistName.toLowerCase().includes(artist.toLowerCase())) return false;
                    const colName   = (t.collectionName || '').toLowerCase();
                    if (colName.includes('- single') || colName.includes('- ep')) return false;
                    seenTracks.add(cleanTitle); return true;
                }).slice(0, Math.ceil(hitLimit / artists.length));
                pool = pool.concat(filtered);
            }
        } else if (sub === 'playlist') {
            const url   = document.getElementById('custom-input').value.trim();
            const songs = await extractPlaylistData(url);
            pool = songs;
        } else {
            apiSearchTerm = document.getElementById('custom-input')?.value?.trim() || sub || 'pop hits';
        }

        if (apiSearchTerm) {
            const vowels = ['a', 'e', 'i', 'o', 'u'];
            apiSearchTerm += ' ' + vowels[Math.floor(Math.random() * vowels.length)];

            const fetchLimit     = state.gameState.level === 'easy' ? 30 : 200;
            const fetchPromise   = fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(apiSearchTerm)}&limit=${fetchLimit}&entity=song`);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Network Timeout.")), 10000));
            const res = await Promise.race([fetchPromise, timeoutPromise]);
            const d   = await res.json();

            pool = d.results.filter(t => {
                if (!t.previewUrl) return false;
                const cleanTitle = t.trackName.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
                if (seenTracks.has(cleanTitle)) return false;
                if (state.gameState.mode === 'genre') {
                    const yr = new Date(t.releaseDate).getFullYear();
                    if (yr < minYear - 8 || yr > maxYear + 8) return false;
                }
                const cArt = (t.artistName || '').toLowerCase();
                if (state.gameState.level === 'easy' && artistCount[cArt] >= 1) return false;
                artistCount[cArt] = (artistCount[cArt] || 0) + 1;
                seenTracks.add(cleanTitle); return true;
            });
        }

        // ── Deduplicate movies if in movie mode ──
        state.globalPool = [...pool];
        state.songs      = [];
        const seenMovies = new Set();
        const shuffled   = pool.sort(() => 0.5 - Math.random());

        for (const t of shuffled) {
            if (state.songs.length >= state.maxRounds) break;
            if (state.gameState.mode === 'movie') {
                const mName = getMovieName(t).toLowerCase();
                if (seenMovies.has(mName)) continue;
                seenMovies.add(mName);
            }
            state.songs.push(t);
        }

        if (state.songs.length < 3) throw new Error("Not enough tracks found! Try broadening your search.");
        if (state.songs.length < state.maxRounds) state.maxRounds = state.songs.length;

        // ── Generate double-round indices ──
        state.doubleRounds = [];
        for (let i = 0; i < state.maxRounds; i += 5) {
            const min = i === 0 ? 2 : i;
            const max = Math.min(i + 4, state.maxRounds - 1);
            if (min <= max) state.doubleRounds.push(Math.floor(Math.random() * (max - min + 1)) + min);
        }

        launchGameUI();

    } catch (error) {
        console.error(error);
        const fbSetup = document.getElementById('feedback-setup');
        if (fbSetup) {
            fbSetup.innerHTML = `<span style="color:var(--fail);">❌ ${error.message || "Network Error or iTunes timeout. Please try again."}</span>`;
        } else {
            alert("Error: " + (error.message || "Network Error"));
        }
        document.getElementById('custom-input').value = '';
        document.getElementById('start-btn-top').style.display = 'block';
        document.getElementById('daily-btn-top').style.display = 'block';
    }
}


// ==============================================================================
// SECTION 7 — GAME UI LAUNCH (launchGameUI)
// ==============================================================================

function launchGameUI() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');
    document.querySelectorAll('.header-btn').forEach(btn => btn.classList.add('hidden'));

    document.getElementById('guess-artist').classList.toggle('hidden', state.gameState.mode !== 'genre');
    document.getElementById('guess-song').classList.toggle('hidden', state.gameState.mode === 'movie');
    document.getElementById('guess-movie').classList.toggle('hidden', state.gameState.mode !== 'movie');

    updateLeaderboard(0);

    if (state.isDailyMode) document.getElementById('main-title').innerText = "🌍 TODAY THREE CHALLENGE";

    if (!state.isDailyMode) {
        const st = state.userStats.song_trivia;
        if (state.gameState.mode === 'genre')  st.modesPlayed.genre  = true;
        if (state.gameState.mode === 'artist') st.modesPlayed.artist = true;
        if (state.gameState.mode === 'movie')  st.modesPlayed.movie  = true;
        if (st.modesPlayed.genre && st.modesPlayed.artist && st.modesPlayed.movie) {
            st.trophies.expl = true;
        }
    }

    nextTrack();
}


// ==============================================================================
// SECTION 8 — ROUND LOOP (nextTrack)
// ==============================================================================

function nextTrack() {
    if (state.curIdx >= state.maxRounds) { endGameSequence(); return; }

    if (state.timerId)      clearInterval(state.timerId);
    if (state.guessTimerId) clearInterval(state.guessTimerId);

    state.isProcessing   = false;
    state.hasUsedLifeline = false;
    state.forcedEarly    = false;

    const song       = state.songs[state.curIdx];
    const pIdx       = state.curIdx % state.numPlayers;
    const isDouble   = state.doubleRounds?.includes(state.curIdx);

    // ── Build MC options from the global pool ──
    const correctStr   = getMCLabel(song);
    let wrongPool      = state.globalPool
        .map(s => getMCLabel(s))
        .filter(str => str !== correctStr && str !== "Unknown Movie" && str !== "Unknown");
    wrongPool = [...new Set(wrongPool)].sort(() => 0.5 - Math.random());

    state.currentMCOptions = [{ str: correctStr, correct: true },
        ...wrongPool.slice(0, 3).map(str => ({ str, correct: false }))
    ].sort(() => 0.5 - Math.random());

    const tag  = document.getElementById('active-player');
    const color = colors[pIdx % colors.length];
    tag.innerText     = isDouble
        ? `P${pIdx + 1}: ROUND ${state.curIdx + 1}/${state.maxRounds} — ⭐ 2X BONUS`
        : `P${pIdx + 1}: ROUND ${state.curIdx + 1}/${state.maxRounds}`;
    tag.style.color       = isDouble ? '#f39c12' : color;
    tag.style.borderColor = isDouble ? '#f39c12' : color;

    if (state.curIdx === 0) {
        state.rawScores   = new Array(state.numPlayers).fill(0);
        state.streaks     = new Array(state.numPlayers).fill(0);
        state.matchHistory= new Array(state.numPlayers).fill(null).map(() => []);
    }

    document.getElementById('feedback').innerHTML = '';
    document.getElementById('btn-container').classList.remove('hidden');
    document.getElementById('mc-fields').classList.add('hidden');
    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('reveal-art').style.display = 'none';
    document.getElementById('reveal-art').src = '';

    audio.src    = song.previewUrl;
    audio.volume = 1.0;
    audio.play().catch(console.error);
    document.getElementById('visualizer').classList.remove('hidden', 'paused');

    state.timeLeft      = state.timeLimit;
    state.isGracePeriod = false;

    _startTimer();
}

function getMCLabel(s) {
    if (state.gameState.mode === 'movie')  return getMovieName(s);
    if (state.gameState.mode === 'artist') return s.trackName;
    return `${s.artistName} - ${s.trackName}`;
}


// ==============================================================================
// SECTION 9 — ROUND TIMER (_startTimer)
// ==============================================================================

function _startTimer() {
    const timerElement = document.getElementById('timer');
    timerElement.innerHTML = `<div class="timer-bar-container"><div id="timer-bar-fill" class="timer-bar-fill"></div></div>`;
    const timerFill = document.getElementById('timer-bar-fill');

    state.timerId = setInterval(() => {
        state.timeLeft--;
        const percentage = (state.timeLeft / state.timeLimit) * 100;
        if (timerFill) timerFill.style.width = `${percentage}%`;

        if (state.isMultiplayer && state.isHost) {
            db.ref(`rooms/${state.roomCode}/timeLeft`).set(state.timeLeft);
        }

        if (state.timeLeft <= 3 && state.timeLeft > 0 && !state.hasUsedLifeline) {
            if (timerFill) timerFill.style.backgroundColor = 'var(--fail)';
            sfxTick.currentTime = 0; sfxTick.play().catch(() => {});
        }

        if (state.timeLeft === 10 && !state.isGracePeriod && state.gameState.level !== 'hard' && !state.hasUsedLifeline) {
            if (state.isMultiplayer && state.isHost) {
                db.ref(`rooms/${state.roomCode}/lifelineForced`).set(true);
                triggerLifeline();
            } else {
                triggerLifeline();
            }
        }

        if (state.timeLeft <= 0) {
            if (state.isMultiplayer && state.isHost && !state.isGracePeriod) {
                state.isGracePeriod = true;
                state.timeLeft      = 30;
                audio.pause();
                document.getElementById('visualizer').classList.add('paused');
                document.getElementById('feedback').innerHTML += `
                    <div style="color:var(--text-muted); font-size:1.1rem; margin-top:10px; font-weight:bold;">
                        Song completed! Please submit final answers in the next 30 seconds.
                    </div>`;
            } else {
                clearInterval(state.timerId);
                audio.pause();
                document.getElementById('visualizer').classList.add('paused');
                if (state.hasUsedLifeline) {
                    evaluateGuess(false);
                } else {
                    handleStop();
                }
            }
        }
    }, 1000);
}


// ==============================================================================
// SECTION 10 — LIFELINE SYSTEM (forceLifeline / triggerLifeline / handleStop)
// ==============================================================================

export function forceLifeline() {
    if (state.timeLeft > 10 && !state.hasUsedLifeline) {
        state.forcedEarly = true;
        state.timeLeft    = 10;
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
    if (state.isProcessing) return;
    state.isProcessing = true;

    clearInterval(state.timerId);
    audio.pause();
    document.getElementById('visualizer').classList.add('paused');
    document.getElementById('btn-container').classList.add('hidden');

    state.scoreLock = Math.max(0, state.timeLeft);
    if (state.gameState.level === 'hard') state.scoreLock *= 3;

    if (!state.hasUsedLifeline) {
        document.getElementById('guess-fields').classList.remove('hidden');
        document.getElementById('guess-fields').classList.add('fade-in');
        setTimeout(() => {
            state.isProcessing = false;
            if (state.gameState.mode === 'genre')  document.getElementById('guess-artist').focus();
            else if (state.gameState.mode === 'artist') document.getElementById('guess-song').focus();
            else document.getElementById('guess-movie').focus();
        }, 50);

        let guessTime = 20;
        const timerElement = document.getElementById('timer');
        timerElement.innerHTML = `<div class="timer-bar-container"><div id="timer-bar-fill" class="timer-bar-fill" style="background: #f39c12;"></div></div>`;
        const timerFill = document.getElementById('timer-bar-fill');

        state.guessTimerId = setInterval(() => {
            guessTime--;
            if (timerFill) timerFill.style.width = `${(guessTime / 20) * 100}%`;
            if (guessTime <= 3 && guessTime > 0) {
                if (timerFill) timerFill.style.backgroundColor = 'var(--fail)';
                sfxTick.currentTime = 0; sfxTick.play().catch(() => {});
            }
            if (guessTime <= 0) { clearInterval(state.guessTimerId); evaluateGuess(); }
        }, 1000);
    } else {
        evaluateGuess(false);
    }
}

function setupMC() {
    const container = document.getElementById('mc-fields');
    container.innerHTML = '';
    state.currentMCOptions.forEach(opt => {
        const btn      = document.createElement('button');
        btn.className  = 'mc-btn';
        btn.innerText  = opt.str;
        btn.onclick    = (e) => evaluateGuess(opt.correct, e.target);
        container.appendChild(btn);
    });

    if (state.isMultiplayer && state.isHost) {
        const fbOptions = state.currentMCOptions.map(opt => ({ str: opt.str, isCorrect: opt.correct }));
        db.ref(`rooms/${state.roomCode}/currentMC`).set(fbOptions);
    }
}


// ==============================================================================
// SECTION 11 — FUZZY ANSWER GRADING (levenshtein / isCloseEnough)
// ==============================================================================

function levenshtein(a, b) {
    const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
    }
    return matrix[b.length][a.length];
}

function isCloseEnough(guess, actual, isArtist = false) {
    if (!guess || !actual) return false;

    let cleanA = actual.replace(/\(.*?\)|\[.*?\]/g, '').toLowerCase().trim();
    let cleanG = guess.toLowerCase().trim();

    if (cleanA === cleanG || cleanA.includes(cleanG)) return true;

    const reduce = s => s
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/([a-z])\1+/g, '$1')
        .replace(/y/g, 'i')
        .replace(/h/g, '');

    let phonA = reduce(cleanA);
    let phonG = reduce(cleanG);

    const stopWords = ['the','a','an','and','of','to','in','on','i','dont','want',
        'my','is','it','for','with','you','me','feat','ft','version','remix',
        'mix','edit','radio','live','studio'];

    let aWords = phonA.split(' ').filter(w => w.length > 2 && !stopWords.includes(w));
    let gWords = phonG.split(' ').filter(w => w.length > 2 && !stopWords.includes(w));

    if (gWords.length === 0) return false;

    if (isArtist && gWords.length === 1) {
        const gW = gWords[0];
        const allowedTypos = gW.length >= 8 ? 2 : (gW.length > 5 ? 1 : 0);
        for (const aW of aWords) {
            if (aW === gW || aW.includes(gW) || gW.includes(aW) || levenshtein(gW, aW) <= allowedTypos) return true;
        }
    }

    if (!isArtist) {
        let matchCount = 0;
        gWords.forEach(gW => {
            const allowedTypos = gW.length >= 7 ? 2 : (gW.length >= 4 ? 1 : 0);
            for (const aW of aWords) {
                if (aW === gW || aW.includes(gW) || gW.includes(aW) || levenshtein(gW, aW) <= allowedTypos) {
                    matchCount++; break;
                }
            }
        });
        if (aWords.length <= 2 && matchCount >= 1) return true;
        if (matchCount >= 2) return true;
    }

    if (aWords.length <= 1) {
        const gW = gWords[0];
        if (aWords.length === 1) {
            const allowedTypos = gW.length >= 8 ? 3 : (gW.length > 5 ? 2 : 1);
            return levenshtein(gW, aWords[0]) <= allowedTypos || gW.includes(aWords[0]) || aWords[0].includes(gW);
        }
        return false;
    }

    let matchCount = 0;
    const matchedIdx = new Set();
    gWords.forEach(gW => {
        for (let i = 0; i < aWords.length; i++) {
            if (!matchedIdx.has(i)) {
                const aW = aWords[i];
                if (aW === gW || aW.includes(gW) || gW.includes(aW) || levenshtein(gW, aW) <= 1) {
                    matchCount++; matchedIdx.add(i); break;
                }
            }
        }
    });
    return matchCount >= 2;
}


// ==============================================================================
// SECTION 12 — SCORE HELPERS (getNormalizedScore / updateLeaderboard)
// ==============================================================================

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
        const bColor   = isActive ? colors[i % colors.length] : '#333';
        return `<div class="score-pill" style="border-color:${bColor}; opacity:${isActive ? 1 : 0.5}">
            <div class="p-name" style="color:${bColor}">P${i + 1}</div>
            <div class="p-pts" style="color:var(--dark-text)">${s}</div>
            <div class="p-streak" style="opacity:${state.streaks[i] > 0 ? 1 : 0}">🔥 ${state.streaks[i]}</div>
        </div>`;
    }).join('');
}


// ==============================================================================
// SECTION 13 — GUESS EVALUATION: SOLO (evaluateGuess)
// ==============================================================================

export function evaluateGuess(isCorrectMC = null, clickedBtn = null) {
    if (state.isProcessing && isCorrectMC === null) return;
    state.isProcessing = true;

    clearInterval(state.timerId);
    clearInterval(state.guessTimerId);
    audio.pause();
    document.getElementById('visualizer').classList.add('paused');
    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('btn-container').classList.add('hidden');

    if (state.hasUsedLifeline) {
        document.querySelectorAll('.mc-btn').forEach(b => { b.disabled = true; });
        if (clickedBtn) clickedBtn.classList.add(isCorrectMC ? 'correct' : 'wrong');
    }

    const pIdx = state.curIdx % state.numPlayers;

    let roundPts = 0;
    if (state.hasUsedLifeline) {
        roundPts = state.forcedEarly ? 5 : Math.max(0, state.timeLeft);
    } else {
        roundPts = state.scoreLock;
    }

    let correct = false, artOk = false, sonOk = false, movOk = false;
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
            artOk = isCloseEnough(artG, realA, true);
            sonOk = isCloseEnough(sonG, realS, false);
            if (artOk || sonOk) { correct = true; if (artOk && sonOk) roundPts *= 2; }
        } else if (state.gameState.mode === 'artist') {
            if (isCloseEnough(sonG, realS, false)) { correct = true; sonOk = true; roundPts *= 2; }
        } else if (state.gameState.mode === 'movie') {
            if (isCloseEnough(movG, realM, false)) { correct = true; movOk = true; roundPts *= 2; }
        }
    }

    state.matchHistory[pIdx].push(correct
        ? (state.hasUsedLifeline ? '🟨' : '🟩')
        : '🟥');

    const succColor = 'var(--success)', failColor = 'var(--fail)';
    let fbHTML = '';

    if (state.gameState.mode === 'genre' && !state.hasUsedLifeline) {
        if (correct) {
            fbHTML = `<div style="display:flex; gap:10px; justify-content:center; font-size:1.3rem; font-weight:bold; margin-bottom:5px;">
                <span style="color:${artOk ? succColor : failColor}">${artOk ? '✅' : '❌'} ARTIST</span>
                <span style="color:var(--text-muted);">|</span>
                <span style="color:${sonOk ? succColor : failColor}">${sonOk ? '✅' : '❌'} SONG</span>
            </div>`;
        } else {
            fbHTML = `<div style="color:${failColor}; font-size:1.5rem; font-weight:bold; margin-bottom:5px;">❌ INCORRECT</div>`;
        }
    } else {
        fbHTML = `<div style="color:${correct ? succColor : failColor}; font-size:1.5rem; font-weight:bold; margin-bottom:5px;">${correct ? '🔥 CORRECT!' : '❌ INCORRECT'}</div>`;
    }

    if (correct) {
        if (!state.hasUsedLifeline) {
            if (state.scoreLock >= 27) {
                state.userStats.song_trivia.sniperHits = (state.userStats.song_trivia.sniperHits || 0) + 1;
            }
            state.streaks[pIdx]++;
            if (state.streaks[pIdx] % 3 === 0) {
                roundPts += 50;
                fbHTML += `<div style="color:var(--primary); font-size:0.85rem; margin-top:5px;">+50 PURE STREAK BONUS</div>`;
            }
        } else {
            state.streaks[pIdx] = 0;
        }

        if (state.doubleRounds?.includes(state.curIdx)) {
            roundPts *= 2;
            fbHTML += `<div style="color:#f39c12; font-size:0.85rem; margin-top:2px; font-weight:bold;">⭐ 2X BONUS APPLIED!</div>`;
        }

        sfxCheer.currentTime = 0; sfxCheer.play().catch(() => {});
        fbHTML += `<div style="color:var(--success); font-size:1.1rem; margin-top:5px;">+${roundPts} POINTS</div>`;
        state.rawScores[pIdx] += roundPts;
    } else {
        sfxBuzzer.currentTime = 0; sfxBuzzer.play().catch(() => {});
        state.streaks[pIdx] = 0;
        roundPts = 0;
    }

    fbHTML += `<div style="font-size:1.05rem; color:var(--dark-text); margin-top:10px;">${realA} — ${realS}</div>`;
    if (state.gameState.mode === 'movie') {
        fbHTML += `<div style="font-size:0.9rem; color:var(--primary); margin-top:3px;">🎬 ${realM}</div>`;
    }
    document.getElementById('feedback').innerHTML = fbHTML;
    document.getElementById('feedback').classList.add('fade-in');

    const img   = document.getElementById('reveal-art');
    img.src     = state.songs[state.curIdx].artworkUrl100?.replace('100x100bb', '400x400bb');
    img.classList.add('fade-in');
    img.style.display = 'block';

    ['guess-artist', 'guess-song', 'guess-movie'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    updateLeaderboard(pIdx);
    state.curIdx++;
    setTimeout(nextTrack, 4000);
}


// ==============================================================================
// SECTION 14 — GUESS EVALUATION: MULTIPLAYER (evaluateMultiplayerRound)
// ==============================================================================

export function evaluateMultiplayerRound(players) {
    if (state.isProcessing) return;
    state.isProcessing = true;

    clearInterval(state.timerId);
    audio.pause();
    document.getElementById('visualizer').classList.add('paused');
    document.getElementById('btn-container').classList.add('hidden');

    const realA = state.songs[state.curIdx].artistName;
    const realS = state.songs[state.curIdx].trackName;
    const realM = getMovieName(state.songs[state.curIdx]);

    let fbHTML     = `<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:15px; font-weight:bold;">`;
    const playerIds = Object.keys(players);
    const results  = [];

    playerIds.forEach((pid, index) => {
        const p        = players[pid];
        let roundPts  = 0;
        let correct   = false;
        let artOk = false, sonOk = false, movOk = false;

        const basePts = (p.guess?.phase === 'grace') ? 5 : (p.guess?.time || 0);

        if (p.guess?.isMC) {
            correct = p.guess.correct;
            if (correct) roundPts = p.guess.time > 10 ? 5 : basePts;
        } else {
            const artG = p.guess?.artist || '';
            const sonG = p.guess?.song   || '';
            const movG = p.guess?.movie  || '';

            if (state.gameState.mode === 'genre') {
                artOk = isCloseEnough(artG, realA, true);
                sonOk = isCloseEnough(sonG, realS, false);
                if (artOk || sonOk) { correct = true; roundPts = basePts; if (artOk && sonOk) roundPts *= 2; }
            } else if (state.gameState.mode === 'artist') {
                if (isCloseEnough(sonG, realS, false)) { correct = true; roundPts = basePts * 2; }
            } else if (state.gameState.mode === 'movie') {
                if (isCloseEnough(movG, realM, false)) { correct = true; roundPts = basePts * 2; }
            }
            if (correct && p.guess?.phase === 'grace') roundPts = 5;
        }

        if (correct) {
            if (!p.guess?.isMC) {
                state.streaks[index]++;
                if (state.streaks[index] % 3 === 0) {
                    roundPts += 50;
                    fbHTML += `<div style="color:var(--primary); font-size:0.85rem; margin-top:5px;">+50 PURE STREAK BONUS</div>`;
                }
            } else {
                state.streaks[index] = 0;
            }
            if (state.doubleRounds?.includes(state.curIdx)) {
                roundPts *= 2;
                fbHTML += `<div style="color:#f39c12; font-size:0.85rem; margin-top:2px; font-weight:bold;">⭐ 2X BONUS APPLIED!</div>`;
            }
            state.rawScores[index] += roundPts;
            fbHTML += `<div style="color:var(--success); font-size:1.1rem;">✅ ${p.nickname || p.name || 'Player'}: +${roundPts}</div>`;
        } else {
            fbHTML += `<div style="color:var(--fail); font-size:1.1rem;">❌ ${p.nickname || p.name || 'Player'}: 0</div>`;
            state.streaks[index] = 0;
        }

        results.push({ id: pid, newScore: (p.score || 0) + roundPts });
    });

    fbHTML += `</div>`;
    fbHTML += `<div style="font-size:1.05rem; color:var(--dark-text); margin-top:10px;">${realA} — ${realS}</div>`;
    if (state.gameState.mode === 'movie') fbHTML += `<div style="font-size:0.9rem; color:var(--primary); margin-top:3px;">🎬 ${realM}</div>`;

    updateLeaderboard(-1);
    document.getElementById('feedback').innerHTML = fbHTML;
    document.getElementById('feedback').classList.add('fade-in');

    const img   = document.getElementById('reveal-art');
    img.src     = state.songs[state.curIdx].artworkUrl100?.replace('100x100bb', '400x400bb');
    img.classList.add('fade-in');
    img.style.display = 'block';

    state.curIdx++;
    window.finalizeMultiplayerRound(results);
    setTimeout(nextTrack, 5000);
}


// ==============================================================================
// SECTION 15 — PHONE CLIENT (submitClientMCGuess)
// ==============================================================================

export function submitClientMCGuess(isCorrect) {
    const currentTime  = parseInt(document.getElementById('client-timer-display')?.innerText || 0);
    const graceVisible = !document.getElementById('client-grace-msg')?.classList.contains('hidden');
    const currentPhase = graceVisible ? 'grace' : 'audio';
    const finalTime    = Math.min(10, currentTime);

    db.ref(`rooms/${state.roomCode}/players/${state.myPlayerId}`).update({
        guess:  { isMC: true, correct: isCorrect, time: finalTime, phase: currentPhase },
        status: 'locked'
    });

    document.getElementById('client-mc-inputs').classList.add('hidden');
    document.getElementById('client-locked-screen').classList.remove('hidden');
}


// ==============================================================================
// SECTION 16 — END GAME (endGameSequence / shootConfetti)
// ==============================================================================

function endGameSequence() {
    document.getElementById('play-screen').classList.add('hidden');
    document.getElementById('final-screen').classList.remove('hidden');

    if (state.isDailyMode) document.getElementById('main-title').innerText = "🌍 TODAY THREE CHALLENGE";
    document.getElementById('final-subtitle').innerText = "Scores Normalized to 1000";

    updateLeaderboard(-1);
    shootConfetti();

    const normalizedScores = state.rawScores.map(s => getNormalizedScore(s));
    const maxScore = Math.max(...normalizedScores);
    const winIdx   = normalizedScores.indexOf(maxScore);

    // ── Multiplayer finale (host only) ──
    if (state.isMultiplayer && state.isHost && state.roomCode) {
        db.ref(`rooms/${state.roomCode}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;
            const pIds = Object.keys(players);
            const finalResults = pIds.map((pid, index) => {
                const rawFirebaseScore = players[pid].score || 0;
                const normScore = Math.min(1000, Math.round((rawFirebaseScore / ((state.roundsPerPlayer * 60) + (Math.floor(state.roundsPerPlayer / 3) * 50))) * 1000));
                db.ref(`rooms/${state.roomCode}/players/${pid}`).update({ finalScore: normScore });
                return { name: players[pid].name, score: normScore, id: pid };
            });
            finalResults.sort((a, b) => b.score - a.score);
            db.ref(`rooms/${state.roomCode}/finalLeaderboard`).set(finalResults);
            db.ref(`rooms/${state.roomCode}/hostState`).set({ phase: 'gameover' });

            let podium = `<div style="text-align:left; background:var(--surface); padding:15px; border-radius:12px; border:2px solid var(--border-light);">`;
            finalResults.forEach((p, idx) => {
                const medal = ['🥇','🥈','🥉'][idx] || '👏';
                const color = ['var(--p1)','var(--p2)','var(--text-muted)'][idx] || 'var(--text-muted)';
                podium += `<div style="display:flex; justify-content:space-between; padding:10px 5px; border-bottom:1px solid var(--border-light); font-size:1.2rem; font-weight:bold; color:${color};">
                    <span>${medal} ${p.name}</span><span>${p.score}</span>
                </div>`;
            });
            podium += `</div>`;
            document.getElementById('winner-text').innerHTML = podium;
        });
        return;
    }

    // ── Solo finale ──
    const gridHTML = state.matchHistory[winIdx].reduce((acc, item, idx) => {
        acc += item;
        if ((idx + 1) % 5 === 0) acc += '<br>';
        return acc;
    }, '');
    document.getElementById('final-grid').innerHTML = `
        <div style="font-size:1.8rem; letter-spacing:4px; margin:15px 0; text-align:center; color:var(--dark-text);">${gridHTML}</div>`;

    // ── Stat updates ──
    const st = state.userStats.song_trivia;
    st.gamesPlayed++;
    state.userStats.platformGamesPlayed = (state.userStats.platformGamesPlayed || 0) + 1;
    if (maxScore > (st.hsText || 0)) st.hsText = maxScore;
    if (maxScore > 900) st.trophies.perf = true;
    if (state.roundsPerPlayer >= 20) st.trophies.mara = true;
    if ((st.sniperHits || 0) >= 10) st.trophies.snip = true;
    if (state.isDailyMode) st.playedDailyToday = true;

    // ── Day-streak tracking ──
    const todayStr = new Date().toDateString();
    if (st.lastPlayedDate !== todayStr) {
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        if (st.lastPlayedDate === yesterday.toDateString()) st.currentStreak++;
        else st.currentStreak = 1;
        st.lastPlayedDate = todayStr;
    }
    if (st.currentStreak >= 5) st.trophies.streak = true;
    saveStats();

    // ── All-time global high score ──
    const globalHS = parseInt(localStorage.getItem('yardbirdHighScore') || '0');
    if (maxScore > globalHS && maxScore > 0) {
        localStorage.setItem('yardbirdHighScore', maxScore);
        document.getElementById('new-record-msg').style.display = 'block';
    }

    document.getElementById('winner-text').innerHTML = `
        <div style="background:linear-gradient(135deg, var(--primary), var(--p2)); border-radius:16px; padding:20px; color:#fff;">
            <div style="font-size:2.2rem; font-weight:900;">${maxScore}<span style="font-size:1rem; opacity:0.7;"> / 1000</span></div>
            <div style="font-size:0.9rem; opacity:0.85; text-transform:uppercase; letter-spacing:1px; margin-top:4px;">
                ${state.gameState.mode} · ${state.gameState.level}
            </div>
        </div>`;
}

function shootConfetti() {
    for (let i = 0; i < 100; i++) {
        const conf = document.createElement('div');
        conf.style.cssText = `position:fixed; width:8px; height:8px; z-index:9999;
            background-color:${colors[Math.floor(Math.random() * colors.length)]};
            left:${Math.random() * 100}vw; top:-10px;
            border-radius:${Math.random() > 0.5 ? '50%' : '0'};`;
        document.body.appendChild(conf);
        const fallDuration = Math.random() * 2 + 2;
        conf.animate([
            { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 1 },
            { transform: `translate3d(${Math.random() * 200 - 100}px, 100vh, 0) rotate(${Math.random() * 720}deg)`, opacity: 0 }
        ], { duration: fallDuration * 1000, easing: 'cubic-bezier(.37,0,.63,1)' }).onfinish = () => conf.remove();
    }
}


// ==============================================================================
// SECTION 17 — SHARE CHALLENGE
// ==============================================================================

export function shareChallenge() {
    const normalizedScores = state.rawScores.map(s => getNormalizedScore(s));
    const maxScore = Math.max(...normalizedScores);
    const winIdx   = normalizedScores.indexOf(maxScore);

    const grid = state.matchHistory[winIdx].reduce((res, item, idx) => {
        res += item;
        if ((idx + 1) % 5 === 0) res += '\n';
        return res;
    }, '');

    const headerText = state.isDailyMode ? '🌍 Yardbird TODAY THREE' : "Yardbird's Song Trivia 🎸";
    const trackIds   = state.songs.map(s => s.trackId).join(',');
    const url        = `${window.location.origin}${window.location.pathname}?score=${maxScore}&tracks=${trackIds}`;
    const text       = `${headerText}\nScore: ${maxScore}/1000 Pts\n\n${grid}\nThink you can beat me? Play my exact songs here:`;

    if (navigator.share) {
        navigator.share({ title: "Beat My Score!", text, url }).catch(console.error);
    } else {
        navigator.clipboard.writeText(text + "\n" + url);
        alert("Challenge link & grid copied to clipboard! Paste it to your friends.");
    }
}


// ==============================================================================
// SECTION 18 — APPLE MUSIC PLAYLIST IMPORT
// ==============================================================================

async function extractPlaylistData(urlInput) {
    const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(urlInput)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Proxy blocked (HTTP ${response.status})`);
    const html = await response.text();

    const extractedTracks = [];

    if (urlInput.includes('music.apple.com')) {
        const parser  = new DOMParser();
        const doc     = parser.parseFromString(html, 'text/html');
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        let playlistData = null;

        scripts.forEach(script => {
            if (script.innerText.includes('MusicPlaylist')) {
                try { playlistData = JSON.parse(script.innerText); } catch (e) {}
            }
        });

        if (!playlistData?.track) throw new Error("Could not find public track data. Ensure playlist is public.");

        for (const track of playlistData.track.slice(0, state.maxRounds * 2)) {
            const name   = track.name || '';
            const artist = track.byArtist?.name || '';
            const query  = encodeURIComponent(`${name} ${artist}`);
            const res    = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=5`);
            const data   = await res.json();
            const match  = data.results?.find(t => t.previewUrl);
            if (match) extractedTracks.push(match);
        }
    }

    if (extractedTracks.length === 0) throw new Error("No playable tracks found in playlist.");
    return extractedTracks;
}


// ==============================================================================
// SECTION 19 — UI & PLATFORM BRIDGES
// ==============================================================================

const subOptions = {
    movie: ['Disney Classics', 'Bollywood Hits', 'Tamil Cinema', 'Hollywood Blockbusters'],
    genre: ['classic-rock', '2000s-hits', 'shwe-special', 'one-hit-wonders', 'custom'],
    artist: ['custom'] 
};

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
