/**
 * ==============================================================================
 * YARDBIRD'S GAMES — CARTRIDGE: SONG TRIVIA  (gameLogic.js)
 * ==============================================================================
 *
 * WHAT THIS GAME IS:
 *   Yardbird's original and flagship cartridge. A 30-second audio trivia battle
 *   powered by the iTunes Search API. A song clip plays — players must stop it
 *   and type the artist name and/or song title from memory. A lifeline system
 *   auto-triggers multiple-choice buttons at the 10-second mark, rewarding
 *   quick ears and punishing those who wait.
 *
 * MODES:
 *   · Genre (Guess Artist + Song) — iTunes search by era, genre, or decade.
 *     Scoring: both correct = 2× points; either correct = base points.
 *   · Artist (Guess the Song)     — Deep dive into one artist's catalog.
 *     Scoring: correct = 2× points.
 *   · Movie (Guess the Film)      — Original soundtrack identification.
 *     Scoring: correct = 2× points.
 *
 * DIFFICULTY LEVELS:
 *   · Easy   — 30s timer, top-charting hits only, 1 song per artist.
 *   · Medium — 30s timer, full back-catalog including B-sides.
 *   · Hard   — 10s strict cutoff, no automatic lifeline, pure recall.
 *
 * SPECIAL FEATURES:
 *   · Today Three: a seeded daily challenge — all players globally hear the
 *     exact same 3 songs, sourced from db_daily.json + iTunes.
 *   · Lifeline: at 10s remaining, MC buttons appear. Sacrifices typing
 *     bonus but gives a safety net. forceLifeline() lets players call it
 *     early at a scoring cost.
 *   · Fuzzy Grading: Levenshtein distance + phonetic normalization means
 *     typos and minor spelling errors are accepted.
 *   · Double Rounds: randomly assigned, one per 5-round block (2× score).
 *   · Streak Bonus: +50 pts every 3rd consecutive correct answer (typing only).
 *   · Playlist reveal: finale screen shows links to Apple Music, Spotify, YouTube.
 *   · Confetti cannon on game-over.
 *   · Apple Music playlist URL import support.
 *
 * MULTIPLAYER:
 *   Host (TV) runs the full game loop. Phones submit typed or MC guesses
 *   via Firebase. Host evaluates all players simultaneously on each round.
 *   Grace period: after 30s, multiplayer hosts give 30 extra seconds for
 *   late submissions before evaluating.
 *
 * CARTRIDGE CONTRACT (required by app.js validateCartridge):
 *   ✅ manifest                   — game metadata & setup config
 *   ✅ startGame()                — entry point, triggers iTunes fetch
 *   ✅ handleStop()               — pauses audio, shows typing fields
 *   ✅ forceLifeline()            — early MC trigger (costs max score)
 *   ✅ evaluateGuess()            — solo scoring logic (typed + MC)
 *   ✅ evaluateMultiplayerRound() — multiplayer scoring (all players at once)
 *   ✅ submitClientMCGuess()      — phone MC submission to Firebase
 *   ✅ startDailyChallenge()      — loads Today Three from db_daily.json
 *   ✅ resetStats()               — clears localStorage for this cartridge
 *   ✅ shareChallenge()           — emoji grid + URL share sheet
 *   ✅ renderStatsUI()            — injects stats HTML into stats modal
 *
 * FILE STRUCTURE (section map):
 *   SECTION 1  — Imports & Module-Level State
 *   SECTION 2  — Manifest (Cartridge Contract)
 *   SECTION 3  — Stats Persistence
 *   SECTION 4  — Stats UI & Trophy System
 *   SECTION 5  — Daily Challenge (Today Three)
 *   SECTION 6  — iTunes Fetch Logic (executeFetchLogic)
 *   SECTION 7  — Game UI Launch (launchGameUI)
 *   SECTION 8  — Round Loop (nextTrack)
 *   SECTION 9  — Round Timer (_startTimer)
 *   SECTION 10 — Lifeline System (forceLifeline / triggerLifeline / handleStop)
 *   SECTION 11 — Fuzzy Answer Grading (levenshtein / isCloseEnough)
 *   SECTION 12 — Score Helpers (getNormalizedScore / updateLeaderboard)
 *   SECTION 13 — Guess Evaluation: Solo (evaluateGuess)
 *   SECTION 14 — Guess Evaluation: Multiplayer (evaluateMultiplayerRound)
 *   SECTION 15 — Phone Client (submitClientMCGuess)
 *   SECTION 16 — End Game (endGameSequence / shootConfetti)
 *   SECTION 17 — Share Challenge
 *   SECTION 18 — Apple Music Playlist Import
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

/**
 * manifest  {Object}
 * ───────────────────
 * Song Trivia is the most complex cartridge — its manifest reflects that.
 *
 * NOTABLE FIELDS:
 *   hasDaily: true        — Enables the "Today Three" daily button in the setup screen.
 *   clientUI: "typing-and-mc" — Tells the phone to render BOTH a text-input area
 *                               AND MC buttons (phones start in typing mode,
 *                               switch to MC when the lifeline fires).
 *   initialStats          — Song Trivia needs richer stat fields than the platform
 *                           default (gamesPlayed + highScore). The advanced
 *                           auto-hydrator in app.js reads this field and seeds
 *                           localStorage with this exact shape on first run.
 */
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

/**
 * saveStats()
 * ────────────
 * PRIVATE — serializes state.userStats to localStorage.
 * Called at the end of every game and whenever a stat changes mid-session.
 *
 * WHY a dedicated helper?
 *   state.userStats is a shared object across ALL cartridges. Centralizing
 *   the write here ensures we always serialize the full object — not just
 *   the Song Trivia slice — so no other cartridge's data is lost.
 */
function saveStats() {
    localStorage.setItem('yardbirdPlatformStats', JSON.stringify(state.userStats));
}

/**
 * resetStats()
 * ─────────────
 * EXPORTED — wired to the "Reset Stats" button in the stats modal.
 * Nukes all Song Trivia stats and trophies after user confirmation.
 *
 * NOTE: resetStats resets the full song_trivia object back to a safe shape.
 * If any new stat fields are added to the manifest.initialStats later,
 * they must also be added here.
 */
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

/**
 * renderStatsUI()
 * ────────────────
 * EXPORTED — called by ui.js when the stats modal opens and Song Trivia is active.
 * Builds the full stats + trophy locker HTML and injects it into #stats-content.
 *
 * TROPHY CONDITIONS (checked on-write in endGameSequence):
 *   perf  — Score ≥ 900 on any single game
 *   mara  — Play a 20+ round session
 *   snip  — Accumulate 10 "sniper hits" (answered before 3s)
 *   streak— Maintain a 5-day daily login streak
 *   expl  — Play all 3 game modes at least once
 *
 * WHY populateStats?
 *   populateStats() is a ui.js helper that handles the sub-tabs inside the
 *   stats modal (game stats vs. platform stats). renderStatsUI only builds
 *   the inner HTML content.
 */
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

/**
 * startDailyChallenge()
 * ──────────────────────
 * EXPORTED — triggered by the "Play Today Three" button on the setup screen.
 * Loads the global daily challenge: 3 specific songs that every player in
 * the world hears on the same calendar day.
 *
 * DATA SOURCE: db_daily.json
 *   A curated vault of { artist, song } target pairs, indexed by day-of-year.
 *   Today's entry = vault[dayOfYear % vault.length].
 *
 * FETCH STRATEGY:
 *   For each target pair, we query iTunes for up to 15 results and apply
 *   a strict blocklist (covers, karaoke, instrumentals, remixes) before
 *   picking the first clean match. Falls back to pop/rock hits if all
 *   targets fail (guardrail only — should not happen in production).
 *
 * LOCK-OUT:
 *   Once the player completes the daily, state.userStats.song_trivia.playedDailyToday
 *   is set to true and the button is greyed out by ui.js setupDailyButton().
 */
export async function startDailyChallenge() {
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
        // ── Graceful fallback: play generic pop/rock hits ──
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

/**
 * startGame()
 * ────────────
 * EXPORTED — platform entry point. Resets state, sets time limit, and
 * triggers executeFetchLogic() to build the song pool from iTunes.
 *
 * WHY separate startGame and executeFetchLogic?
 *   startDailyChallenge() bypasses executeFetchLogic entirely — it fetches
 *   from db_daily.json instead. Keeping fetch logic separate lets both paths
 *   share launchGameUI() without code duplication.
 */

// 🎵 PRIMER: Permanently unlock audio for this session BEFORE the heavy fetching
    audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    audio.play().then(() => audio.pause()).catch(() => {});
    
export function startGame() {
    // ── Garbage collection: wipe state from other cartridges ──
    state.curIdx       = 0;
    state.songs        = [];
    state.globalPool   = [];
    state.matchHistory = [];

    state.isDailyMode     = false;
    state.numPlayers      = state.isMultiplayer ? state.numPlayers : 1;
    state.timeLimit       = state.gameState.level === 'hard' ? 10 : 30;
    state.roundsPerPlayer = state.gameState.rounds;
    state.maxRounds       = state.roundsPerPlayer;

    document.getElementById('start-btn-top').style.display = 'none';
    document.getElementById('daily-btn-top').style.display = 'none';
    document.getElementById('feedback-setup').innerText = "Connecting to iTunes Database...";

    executeFetchLogic();
}

/**
 * getMovieName(track)
 * ────────────────────
 * PRIVATE — extracts a clean movie title from an iTunes track object.
 *
 * PARSING PRIORITY:
 *   1. "From [Movie Name])" suffix in the track name (most reliable).
 *   2. collectionName with all standard soundtrack suffixes stripped.
 *   3. Fallback: "Unknown Movie".
 *
 * WHY strip suffixes?
 *   iTunes collections often include "(Original Motion Picture Soundtrack)"
 *   which would make the MC options unreadable and too obvious. We clean it
 *   so the visible string is just the film title.
 *
 * @param  {Object} track — An iTunes track result object
 * @returns {string}      — Clean movie title
 */
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

/**
 * executeFetchLogic()
 * ────────────────────
 * PRIVATE — async iTunes fetch and pool-building function.
 * Triggered by startGame(). NOT called by startDailyChallenge().
 *
 * FETCH STRATEGY:
 *   · Genre mode:   searches by era/decade keywords. Filters by release year
 *     window (±8 years). Easy mode: max 1 song per artist for variety.
 *   · Artist mode:  loops through the artist list, fetching a proportional
 *     number of tracks from each. Filters out singles and EP-only releases.
 *   · Movie mode:   searches by movie title lists (Disney, Bollywood, etc.)
 *     and deduplicates by film name so no movie appears twice in a session.
 *   · Playlist URL: if the user pastes an Apple Music URL, extractPlaylistData()
 *     scrapes track names via a CORS proxy and matches them on iTunes.
 *
 * DOUBLE ROUND GENERATION:
 *   After the pool is built, one round per 5-round block is randomly selected
 *   as a "double round" (scoring ×2). Stored in state.doubleRounds.
 *
 * ERROR HANDLING:
 *   All errors surface a friendly message in #feedback-setup and reset the
 *   start button so the player can try again without a page reload.
 */
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
            // Movie lists: each title becomes a separate search
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
            // Artist lists: search each artist name, cap per-artist track count
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
            // Playlist URL import path — extractPlaylistData handles scraping
            const url   = document.getElementById('custom-input').value.trim();
            const songs = await extractPlaylistData(url);
            pool = songs;
        } else {
            // Generic text search (artist name typed by user, or genre keyword)
            apiSearchTerm = document.getElementById('custom-input')?.value?.trim() || sub || 'pop hits';
        }

        if (apiSearchTerm) {
            // Add a random vowel wildcard to broaden iTunes results
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

        // ── Generate double-round indices (one per 5-round block) ──
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

/**
 * launchGameUI()
 * ───────────────
 * PRIVATE — called after a successful fetch to transition setup → play screen
 * and configure field visibility for the current mode.
 *
 * FIELD VISIBILITY RULES:
 *   · genre  → show artist field + song field; hide movie field
 *   · artist → hide artist field; show song field; hide movie field
 *   · movie  → hide artist field; hide song field; show movie field
 *
 * TROPHY — Explorer:
 *   Checks if the player has now played all 3 modes across their lifetime
 *   and sets the trophy flag if so. Checked here (not endGameSequence) so
 *   it triggers even mid-session when a player switches modes.
 */
function launchGameUI() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('play-screen').classList.remove('hidden');
    document.querySelectorAll('.header-btn').forEach(btn => btn.classList.add('hidden'));

    document.getElementById('guess-artist').classList.toggle('hidden', state.gameState.mode !== 'genre');
    document.getElementById('guess-song').classList.toggle('hidden', state.gameState.mode === 'movie');
    document.getElementById('guess-movie').classList.toggle('hidden', state.gameState.mode !== 'movie');

    updateLeaderboard(0);

    if (state.isDailyMode) document.getElementById('main-title').innerText = "🌍 TODAY THREE CHALLENGE";

    // ── Mode-play trophy tracking ──
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

/**
 * nextTrack()
 * ────────────
 * PRIVATE — advances the game to the next song, or ends the game when all
 * rounds are exhausted. The core game-loop entry point.
 *
 * FLOW:
 *   1. End-of-game check → endGameSequence().
 *   2. Clear both timers (song timer + guess timer).
 *   3. Pre-build the 4 MC options from the global pool for this round.
 *      Wrong options come from the same pool so they are plausible alternatives.
 *   4. Set player tag and round header.
 *   5. Play the iTunes preview clip via the shared audio element.
 *   6. Start the countdown via _startTimer().
 *
 * MC OPTION BUILDING:
 *   We pre-build MC options here (not at lifeline time) so they're ready
 *   the instant the lifeline fires at 10s. Building them lazily would
 *   introduce a visible delay at an already tense moment.
 *
 * DOUBLE ROUND:
 *   If this round is in state.doubleRounds, the round header gets a star badge.
 *   The actual ×2 multiplier is applied in evaluateGuess / evaluateMultiplayerRound.
 */
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

    // ── Round header badge ──
    const tag  = document.getElementById('active-player');
    const color = colors[pIdx % colors.length];
    tag.innerText     = isDouble
        ? `P${pIdx + 1}: ROUND ${state.curIdx + 1}/${state.maxRounds} — ⭐ 2X BONUS`
        : `P${pIdx + 1}: ROUND ${state.curIdx + 1}/${state.maxRounds}`;
    tag.style.color       = isDouble ? '#f39c12' : color;
    tag.style.borderColor = isDouble ? '#f39c12' : color;

    // ── Initialize per-player match history array on round 0 ──
    if (state.curIdx === 0) {
        state.rawScores   = new Array(state.numPlayers).fill(0);
        state.streaks     = new Array(state.numPlayers).fill(0);
        state.matchHistory= new Array(state.numPlayers).fill(null).map(() => []);
    }

    // ── Clear previous feedback and ensure action buttons are visible ──
    document.getElementById('feedback').innerHTML = '';
    document.getElementById('btn-container').classList.remove('hidden');
    document.getElementById('mc-fields').classList.add('hidden');
    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('reveal-art').style.display = 'none';
    document.getElementById('reveal-art').src = '';

    // ── Play the audio preview ──
    audio.src    = song.previewUrl;
    audio.volume = 1.0;
    audio.play().catch(console.error);
    document.getElementById('visualizer').classList.remove('hidden', 'paused');

    state.timeLeft      = state.timeLimit;
    state.isGracePeriod = false;

    _startTimer();
}

/**
 * getMCLabel(s)
 * ──────────────
 * PRIVATE — returns the display string for an MC button based on current mode.
 * Used by nextTrack() to build MC options and by evaluateGuess() to find the answer.
 *
 * @param  {Object} s  — iTunes track result object
 * @returns {string}   — "Artist - Song Title" | "Song Title" | "Movie Name"
 */
function getMCLabel(s) {
    if (state.gameState.mode === 'movie')  return getMovieName(s);
    if (state.gameState.mode === 'artist') return s.trackName;
    return `${s.artistName} - ${s.trackName}`;
}


// ==============================================================================
// SECTION 9 — ROUND TIMER (_startTimer)
// ==============================================================================

/**
 * _startTimer()
 * ──────────────
 * PRIVATE — runs the round countdown. Manages three distinct timer phases:
 *
 * PHASE A — Listening phase (state.timeLeft counting down):
 *   · Updates the visual timer bar (orange fill, shrinks left).
 *   · Syncs state.timeLeft to Firebase so phone clients see the live timer.
 *   · Plays sfxTick in the final 3 seconds.
 *   · At 10s: triggers the lifeline if not already used (non-hard modes).
 *   · At 0s in multiplayer: enters grace period instead of evaluating immediately.
 *   · At 0s in solo/hard: calls handleStop() or evaluateGuess(false).
 *
 * PHASE B — Grace period (multiplayer only):
 *   After the song finishes, the host gives players 30 extra seconds to type.
 *   A "Song completed!" message appears. After grace period ends, the host
 *   reads all submitted guesses from Firebase and evaluates.
 *
 * TIMER STORAGE:
 *   state.timerId holds the setInterval ID so it can be cancelled by
 *   handleStop(), forceLifeline(), evaluateGuess(), or evaluateMultiplayerRound().
 */
function _startTimer() {
    const timerElement = document.getElementById('timer');
    timerElement.innerHTML = `<div class="timer-bar-container"><div id="timer-bar-fill" class="timer-bar-fill"></div></div>`;
    const timerFill = document.getElementById('timer-bar-fill');

    state.timerId = setInterval(() => {
        state.timeLeft--;
        const percentage = (state.timeLeft / state.timeLimit) * 100;
        if (timerFill) timerFill.style.width = `${percentage}%`;

        // Sync to Firebase for multiplayer phone displays
        if (state.isMultiplayer && state.isHost) {
            db.ref(`rooms/${state.roomCode}/timeLeft`).set(state.timeLeft);
        }

        // Auditory urgency cue
        if (state.timeLeft <= 3 && state.timeLeft > 0 && !state.hasUsedLifeline) {
            if (timerFill) timerFill.style.backgroundColor = 'var(--fail)';
            sfxTick.currentTime = 0; sfxTick.play().catch(() => {});
        }

        // Lifeline auto-trigger at 10s (non-hard, non-lifeline-used)
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
                // ── Multiplayer: enter grace period instead of snapping to evaluation ──
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

/**
 * forceLifeline()
 * ────────────────
 * EXPORTED — called when the player taps "Multiple Choice" before 10s.
 * Jumps the timer to 10s and immediately triggers the MC lifeline.
 *
 * COST:
 *   state.forcedEarly = true tells evaluateGuess() to cap the score at
 *   5 points regardless of MC correctness. The player trades max score
 *   for a guaranteed safety net.
 *
 * GUARD:
 *   Only fires if timeLeft > 10 (can't use lifeline once it's already out)
 *   and !hasUsedLifeline (idempotent).
 */
export function forceLifeline() {
    if (state.timeLeft > 10 && !state.hasUsedLifeline) {
        state.forcedEarly = true;
        state.timeLeft    = 10;
        triggerLifeline();
    }
}

/**
 * triggerLifeline()
 * ──────────────────
 * PRIVATE — shows the MC buttons and hides the Stop/Type buttons.
 * Called by the auto-trigger at 10s OR by forceLifeline() early.
 *
 * setupMC() injects the button HTML and syncs options to Firebase for phones.
 */
function triggerLifeline() {
    state.hasUsedLifeline = true;
    document.getElementById('btn-container').classList.add('hidden');
    document.getElementById('mc-fields').classList.remove('hidden');
    document.getElementById('mc-fields').classList.add('fade-in');
    setupMC();
}

/**
 * handleStop()
 * ─────────────
 * EXPORTED — called when the player taps "Stop & Guess".
 * Pauses the audio and shows the typing input fields.
 *
 * SCORE LOCK:
 *   state.scoreLock = state.timeLeft at the moment of stopping.
 *   This is the maximum possible score for the round — it cannot increase
 *   by waiting to type. Hard mode triples this to reward brave early stops.
 *
 * TYPING TIMER:
 *   A separate 20s guess timer (state.guessTimerId) begins. An orange
 *   progress bar counts down. At 0, evaluateGuess() fires automatically.
 *
 * FOCUS:
 *   The correct input field gets auto-focus so players can immediately type.
 */
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

        // ── 20-second typing countdown ──
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

/**
 * setupMC()
 * ──────────
 * PRIVATE — injects MC buttons into #mc-fields using pre-built state.currentMCOptions.
 * Also syncs to Firebase so phone clients render the same options.
 *
 * Each button's onclick passes the clicked element so evaluateGuess can
 * highlight it red/green immediately without a querySelector call.
 */
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

/**
 * levenshtein(a, b)
 * ──────────────────
 * PRIVATE — standard dynamic-programming Levenshtein edit-distance algorithm.
 * Returns the minimum number of single-character edits (insert/delete/replace)
 * needed to transform string a into string b.
 *
 * Used by isCloseEnough() to allow minor typos without rejecting a correct guess.
 *
 * @param  {string} a — First string
 * @param  {string} b — Second string
 * @returns {number}  — Edit distance (0 = identical)
 */
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

/**
 * isCloseEnough(guess, actual, isArtist)
 * ───────────────────────────────────────
 * PRIVATE — the core answer-matching engine. Returns true if the player's
 * guess is "close enough" to the actual answer using a multi-pass strategy.
 *
 * PASS 1 — Exact clean match:
 *   Strips parenthetical content and special characters, lowercases both.
 *   "Taylor Swift" matches "Taylor Swift (feat. Ed Sheeran)".
 *
 * PASS 2 — Phonetic normalization:
 *   Reduces doubled consonants, replaces 'y' with 'i', drops 'h'.
 *   Helps with phonetic spelling variations ("Rhianna" → "Riana").
 *
 * PASS 3 — Stop-word filtering + word matching:
 *   Removes common filler words, then checks if key words from the guess
 *   appear in the actual answer. Allows partial song-title matches.
 *
 * PASS 4 — Levenshtein fuzzy match:
 *   Per-word edit-distance check. Allowed typos scale with word length:
 *   short words (≤5 chars) → 0 typos; medium (5–8) → 1; long (8+) → 2–3.
 *
 * Artist-specific logic:
 *   For artists, a single-word match against any word in the artist name
 *   is enough (e.g. "Sheeran" matches "Ed Sheeran"). Songs require ≥2
 *   matching content words OR a single match on a ≤2-word title.
 *
 * @param  {string}  guess    — Player's raw text input
 * @param  {string}  actual   — The correct answer from iTunes data
 * @param  {boolean} isArtist — Whether this is an artist field check
 * @returns {boolean}         — true if the guess is accepted as correct
 */
function isCloseEnough(guess, actual, isArtist = false) {
    if (!guess || !actual) return false;

    let cleanA = actual.replace(/\(.*?\)|\[.*?\]/g, '').toLowerCase().trim();
    let cleanG = guess.toLowerCase().trim();

    if (cleanA === cleanG || cleanA.includes(cleanG)) return true;

    // Phonetic normalization
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

    // Artist: single-word match is sufficient
    if (isArtist && gWords.length === 1) {
        const gW = gWords[0];
        const allowedTypos = gW.length >= 8 ? 2 : (gW.length > 5 ? 1 : 0);
        for (const aW of aWords) {
            if (aW === gW || aW.includes(gW) || gW.includes(aW) || levenshtein(gW, aW) <= allowedTypos) return true;
        }
    }

    // Song/movie: require ≥2 content word matches
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

    // Short artist name: single Levenshtein check against the full name
    if (aWords.length <= 1) {
        const gW = gWords[0];
        if (aWords.length === 1) {
            const allowedTypos = gW.length >= 8 ? 3 : (gW.length > 5 ? 2 : 1);
            return levenshtein(gW, aWords[0]) <= allowedTypos || gW.includes(aWords[0]) || aWords[0].includes(gW);
        }
        return false;
    }

    // Multi-word: count cross-word matches
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

/**
 * getNormalizedScore(rawScore)
 * ─────────────────────────────
 * PRIVATE — converts a raw point accumulation to a normalized 0–1000 scale.
 *
 * WHY normalize?
 *   Raw scores depend on number of rounds played, which varies per session.
 *   Normalizing gives a universal performance metric for the finale screen,
 *   leaderboard, and shareChallenge() emoji grid.
 *
 * FORMULA:
 *   maxRawPossible = rounds × 60 + (rounds ÷ 3) × 50  (streaks included)
 *   normalized     = min(1000, round(raw / maxRaw × 1000))
 *
 * @param  {number} rawScore — Accumulated raw points for one player
 * @returns {number}         — Score on 0–1000 scale
 */
function getNormalizedScore(rawScore) {
    const maxRawPossible = (state.roundsPerPlayer * 60) + (Math.floor(state.roundsPerPlayer / 3) * 50);
    return Math.min(1000, Math.round((rawScore / maxRawPossible) * 1000));
}

/**
 * updateLeaderboard(activeIdx)
 * ─────────────────────────────
 * PRIVATE — re-renders the score pill strip in #score-board.
 *
 * · activeIdx = the player whose turn it currently is (highlighted).
 * · activeIdx = -1 means the round just ended — all pills shown at equal weight.
 * · In multiplayer host mode, the score board is always cleared (scores shown
 *   on individual phone screens instead to prevent TV spoilers).
 *
 * @param {number} activeIdx — Index into state.rawScores / state.streaks
 */
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

/**
 * evaluateGuess(isCorrectMC, clickedBtn)
 * ────────────────────────────────────────
 * EXPORTED — handles solo scoring for both typed and MC guesses.
 * Called by: Submit button, typing timer expiry, MC button clicks,
 *            handleStop() fallback, or timer expiry in solo/hard.
 *
 * MODES:
 *   Typed (isCorrectMC === null):
 *     · Reads guess-artist, guess-song, guess-movie fields.
 *     · Runs isCloseEnough() for each relevant field.
 *     · Genre: either correct = points; both correct = 2× points.
 *     · Artist/Movie: correct = 2× points.
 *     · Score = state.scoreLock (time remaining when Stop was pressed).
 *
 *   MC (isCorrectMC = true/false):
 *     · Score = state.timeLeft (remaining seconds at click time).
 *     · forcedEarly = true → caps MC score at 5 regardless of time.
 *     · MC correct = streak reset to 0 (no streak bonus via MC).
 *
 * SNIPER TROPHY:
 *   If a typed correct answer came in with > 27s remaining (stopped ≤ 3s
 *   in), state.userStats.song_trivia.sniperHits is incremented.
 *
 * MATCH HISTORY:
 *   Result is pushed to state.matchHistory[pIdx] as:
 *   🟩 typed-correct | 🟨 MC-correct | 🟥 wrong
 *   Used by shareChallenge() to build the emoji grid.
 *
 * @param {boolean|null}     isCorrectMC — null = typed submit; true/false = MC click
 * @param {HTMLElement|null} clickedBtn  — The MC button tapped (for colour feedback)
 */
export function evaluateGuess(isCorrectMC = null, clickedBtn = null) {
    if (state.isProcessing && isCorrectMC === null) return;
    state.isProcessing = true;

    clearInterval(state.timerId);
    clearInterval(state.guessTimerId);
    audio.pause();
    document.getElementById('visualizer').classList.add('paused');
    document.getElementById('guess-fields').classList.add('hidden');
    document.getElementById('btn-container').classList.add('hidden');

    // ── MC button visual feedback ──
    if (state.hasUsedLifeline) {
        document.querySelectorAll('.mc-btn').forEach(b => { b.disabled = true; });
        if (clickedBtn) clickedBtn.classList.add(isCorrectMC ? 'correct' : 'wrong');
    }

    const pIdx = state.curIdx % state.numPlayers;

    // ── Determine points base ──
    let roundPts = 0;
    if (state.hasUsedLifeline) {
        roundPts = state.forcedEarly ? 5 : Math.max(0, state.timeLeft);
    } else {
        roundPts = state.scoreLock;
    }

    // ── Grade the answer ──
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

    // ── Record match history emoji ──
    state.matchHistory[pIdx].push(correct
        ? (state.hasUsedLifeline ? '🟨' : '🟩')
        : '🟥');

    // ── Build feedback HTML ──
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
            // Sniper trophy: stopped in first 3 seconds
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

    // ── Reveal correct answer and album art ──
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

    // ── Clear input fields ──
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

/**
 * evaluateMultiplayerRound(players)
 * ───────────────────────────────────
 * EXPORTED — scores ALL connected players simultaneously from their Firebase guesses.
 * Called by multiplayer.js when all players have locked in, OR when the grace period ends.
 *
 * FLOW:
 *   1. Guard against double-evaluation.
 *   2. Stop timer and audio.
 *   3. For each player: determine if their guess is correct (typed or MC).
 *   4. Apply streak bonus and double-round multiplier.
 *   5. Build per-player feedback HTML.
 *   6. Reveal album art.
 *   7. Call finalizeMultiplayerRound() to write updated scores to Firebase.
 *   8. Advance to next track after 5s.
 *
 * GRACE PERIOD GUESSES:
 *   If a guess arrived during the grace period (p.guess.phase === 'grace'),
 *   it's worth only 5 points regardless of MC timing.
 *
 * SCORING:
 *   Typed correct (genre, both fields):  basePts × 2
 *   Typed correct (artist/movie):        basePts × 2
 *   MC correct (audio phase):            p.guess.time points
 *   MC correct (grace phase):            5 points
 *   Streak bonus:                        +50 every 3rd correct (typed only)
 *   Double round:                        × 2 (applied last)
 *
 * @param {Object} players — Firebase snapshot value: { playerId: { name, guess, score } }
 */
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
        const p       = players[pid];
        let roundPts  = 0;
        let correct   = false;
        let artOk = false, sonOk = false, movOk = false;

        // basePts: grace period caps at 5, otherwise use the time value
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

/**
 * submitClientMCGuess(isCorrect)
 * ───────────────────────────────
 * EXPORTED — called on the phone when a player taps an MC button.
 * Reads the current timer from the phone's display and writes the
 * guess object to Firebase under the player's node.
 *
 * PHASE DETECTION:
 *   If the grace-period message is visible on the phone (#client-grace-msg
 *   not hidden), the guess is tagged phase: 'grace' — worth only 5 points.
 *   Otherwise phase: 'audio' — full time-based scoring.
 *
 * TIME CAP:
 *   finalTime = min(10, currentTime) prevents inflated scores if the phone
 *   timer drifts slightly above 10 due to network latency.
 *
 * @param {boolean} isCorrect — Whether the tapped button was the correct answer
 */
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

/**
 * endGameSequence()
 * ──────────────────
 * PRIVATE — transitions play-screen → final-screen and writes stat updates.
 *
 * TROPHY CHECKS (written here to ensure they run at the end of every game):
 *   perf   — normalized score ≥ 900
 *   mara   — roundsPerPlayer ≥ 20
 *   snip   — sniperHits ≥ 10 (cumulative across games)
 *   streak — currentStreak ≥ 5 (consecutive days)
 *
 * DAY STREAK LOGIC:
 *   Reads lastPlayedDate. If yesterday, increment currentStreak.
 *   If any other day, reset to 1. Prevents same-day double-counting.
 *
 * MULTIPLAYER FINALE:
 *   Reads the final Firebase player scores, normalizes them, sorts into a
 *   podium and writes to /rooms/{code}/finalLeaderboard.
 *
 * SOLO FINALE:
 *   Renders a gradient score card with the normalized score and an emoji grid
 *   showing the full round-by-round match history.
 */
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

/**
 * shootConfetti()
 * ────────────────
 * PRIVATE — fires 100 colourful confetti squares from the top of the screen.
 * Uses the Web Animations API for GPU-accelerated CSS transforms.
 * Each piece uses a random color from the platform palette (state.js colors[]).
 * Cleans itself up via onfinish callback — no DOM leaks.
 */
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

/**
 * shareChallenge()
 * ─────────────────
 * EXPORTED — wired to the "Share" button on the finale screen.
 * Builds an emoji result grid and a replay URL, then shares via Web Share API
 * or falls back to clipboard.
 *
 * REPLAY URL:
 *   Encodes the exact track IDs played so the recipient can challenge with
 *   the identical song set: ?score=X&tracks=id1,id2,id3
 *
 * EMOJI GRID:
 *   🟩 = typed correct | 🟨 = MC correct | 🟥 = wrong
 *   5 results per row, newline between rows.
 */
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

/**
 * extractPlaylistData(urlInput)
 * ──────────────────────────────
 * PRIVATE — parses an Apple Music playlist URL, extracts track names via a
 * CORS proxy, then fetches matching previews from iTunes for each track.
 *
 * WHY a proxy?
 *   Apple Music pages are served with CORS headers that block direct XHR.
 *   api.codetabs.com is a public CORS proxy that forwards the raw HTML.
 *
 * PARSING STRATEGY:
 *   Reads application/ld+json script tags from the Apple Music page, finds
 *   the MusicPlaylist structured data block, and extracts track titles.
 *   Each track is then searched on iTunes for a matching preview URL.
 *
 * LIMITATIONS:
 *   · Only works with public Apple Music playlists (private playlists
 *     return no structured data).
 *   · Rate-limited by the CORS proxy — large playlists may be slow.
 *
 * @param  {string} urlInput — An Apple Music playlist URL
 * @returns {Array}          — Array of iTunes track objects with previewUrl
 */
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
