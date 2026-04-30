/**
 * ==============================================================================
 * YARDBIRD'S GAMES - THE CENTRAL DATA VAULT (state.js)
 * ==============================================================================
 * Role: The Single Source of Truth for the application.
 * Responsibilities:
 * 1. Hold the mutable `state` object shared across all Cartridges and the Console.
 * 2. Pre-load Global Audio contexts.
 * 3. Store static constants (Colors, Dropdown Options, Curated Data Pools).
 * * * Developer Note: NEVER duplicate state variables inside a Cartridge. 
 * If a Cartridge needs to track the score, it writes to `state.rawScores`.
 * ==============================================================================
 */

// ==========================================
// PHASE 1: THE GLOBAL STATE OBJECT
// ==========================================
export const state = {
    // --- 1. PLATFORM & ROUTING ---
    activeCartridgeId: null, // Keeps track of which game is currently plugged in

    // --- 2. MULTIPLAYER & NETWORK ---
    isMultiplayer: false,
    isHost: false, // True if this device is the TV/Board. False if it's a Kahoot-style remote.
    roomCode: "",
    myPlayerId: "", // The Firebase ID for the current client

    // --- 3. LOBBY CONFIGURATION ---
    // Inherited and modified by the Setup Screen before a game starts
    gameState: {
        mode: 'genre',
        sub: 'shwe-special',
        players: 1,
        rounds: 10,
        level: 'easy'
    },
    isDailyMode: false, // Flag to trigger "Today Three" logic

    // --- 4. ACTIVE GAME LOOP (THE BOARD) ---
    songs: [],              // The active queue of questions/problems for the current game
    globalPool: [],         // The fallback or distractor pool of data
    curIdx: 0,              // Current Round Index
    numPlayers: 1, 
    maxRounds: 10, 
    roundsPerPlayer: 10,
    rawScores: [],          // Array mapping to players: [P1_Score, P2_Score, ...]
    streaks: [],            // Array tracking consecutive correct answers
    matchHistory: [],       // Used for end-game Emoji Grids (🟩, 🟥, 🟨)
    
    // --- 5. CARTRIDGE SPECIFIC FLAGS ---
    isProcessing: false,    // Prevents double-clicking "Submit" buttons
    hasUsedLifeline: false, // specific to Song Trivia
    scoreLock: 0,           // Snapshot of points available at the exact moment of a guess
    isGracePeriod: false,   // Used in multiplayer to give clients 30s to type answers
    currentCorrectAnswer: null, // Used by Fast Math to track the target number

    // --- 6. TIMERS ---
    timeLimit: 30, 
    timeTaken: 0,
    timerId: null,          // The main countdown interval
    guessTimerId: null,     // The secondary "typing phase" interval (Song Trivia)
    timeLeft: 0, 
    startTime: 0,

    // --- 7. PERSISTENCE (LOCAL STORAGE) ---
    userStats: JSON.parse(localStorage.getItem('yardbirdPlatformStats')) || { 
        platformGamesPlayed: 0
    },
    globalHighScore: localStorage.getItem('yardbirdHighScore') || 0
};


// ==========================================
// PHASE 2: AUDIO ENGINE
// ==========================================
// Pre-loaded so they can be fired instantly without network delay.
export const audio = new Audio(); // Main music player (Song Trivia)
export const sfxTick = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
export const sfxCheer = new Audio('https://actions.google.com/sounds/v1/crowds/crowd_cheer.ogg');
export const sfxBuzzer = new Audio('https://actions.google.com/sounds/v1/alarms/buzzer_alarm.ogg');

// NEW: Global Background Music Player (Source set dynamically by app.js)
export const bgm = new Audio('./assets/audio/quizmusic.mp3');
bgm.loop = true;

// Mixing Levels
sfxTick.volume = 0.5; 
sfxCheer.volume = 0.7; 
sfxBuzzer.volume = 0.4;
bgm.volume = 0.25;


// ==========================================
// PHASE 3: UI CONSTANTS
// ==========================================
// Used to color-code players 1-4 across the entire platform
export const colors = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)'];

// Standardized dropdown sub-options for Song Trivia setup
export const subOptions = {
    genre: ['shwe-special', 'classic-rock', '2000s', 'one-hit-wonders', 'custom'],
    artist: ['Taylor Swift', 'Led Zeppelin', 'Michael Jackson', 'A.R. Rahman', 'custom'],
    movie: ['Disney Classics', 'Hollywood Blockbusters', 'Bollywood Hits', 'Tamil Cinema', 'custom']
};


// ==========================================
// PHASE 4: DATA VAULTS (OFFLINE / CURATED POOLS)
// ==========================================
// While most data is fetched dynamically via APIs (iTunes, OpenAI), 
// these curated lists guarantee high-quality searches for specific modes.

export const top20DisneyMovies = ["The Lion King", "Beauty and the Beast", "Aladdin", "Toy Story", "Snow White and the Seven Dwarfs", "The Little Mermaid", "Finding Nemo", "Up", "Monsters, Inc.", "Cinderella", "Mulan", "Tangled", "The Princess and the Frog", "The Incredibles", "Ratatouille", "WALL-E", "Frozen", "Lilo & Stitch", "The Jungle Book", "Peter Pan"];

export const top20BollywoodMovies = ["Lagaan", "Sholay", "Mughal-e-Azam", "Mother India", "Pakeezah", "Deewaar", "Anand", "Guide", "Dilwale Dulhania Le Jayenge", "Kabhi Khushi Kabhie Gham", "3 Idiots", "Taare Zameen Par", "Rang De Basanti", "Gangs of Wasseypur", "Black", "Swades", "Chak De! India", "Dangal", "Bajrangi Bhaijaan", "PK"];

export const top20TamilMovies = ["Nayakan", "Thalapathi", "Indian", "Baasha", "Anbe Sivam", "Mouna Ragam", "Roja", "Moondram Pirai", "Mullum Malarum", "Nizhalgal", "Thiruda Thiruda", "Gentleman", "Thevar Magan", "Paruthiveeran", "Karnan", "Kannathil Muthamittal", "Alaipayuthey", "Bombay", "Sethu", "Kaadhal"];

export const top20HollywoodMovies = ["The Godfather", "Saturday Night Fever", "Pulp Fiction", "The Graduate", "The Bodyguard", "Purple Rain", "Moulin Rouge!", "Almost Famous", "The Lion King", "Guardians of the Galaxy", "Top Gun", "Trainspotting", "The Wizard of Oz", "West Side Story", "The Sound of Music", "Dirty Dancing", "Once", "The Big Chill", "O Brother, Where Art Thou?", "The Last of the Mohicans"];

// The "Shwe Special" specifically isolates peak 90s nostalgia
export const shweArtistsFull = ["Nirvana", "Mariah Carey", "Oasis", "Britney Spears", "Red Hot Chili Peppers", "No Doubt", "Pearl Jam", "Alanis Morissette", "Green Day", "Madonna", "Bryan Adams", "Backstreet Boys", "Bon Jovi", "Spice Girls", "Guns N' Roses", "Celine Dion", "Roxette", "TLC", "Aerosmith", "Sheryl Crow", "U2", "The Cranberries", "R.E.M.", "Janet Jackson", "Dire Straits", "Whitney Houston", "Christina Aguilera", "Hanson", "Matchbox Twenty", "Ace of Base", "Goo Goo Dolls", "Aqua", "Natalie Imbruglia", "Black Eyed Peas", "Meat Loaf", "Mr. Big", "Michael Jackson", "The Cardigans", "NSYNC", "Destiny's Child", "Ricky Martin", "Jennifer Lopez", "Cher", "Savage Garden", "Boyzone", "En Vogue", "Boyz II Men", "All Saints", "Shania Twain", "Sarah McLachlan", "Jewel", "Faith Hill", "Fiona Apple", "Melissa Etheridge", "Tracy Chapman", "Sophie B. Hawkins", "The Corrs", "Paula Cole", "Weezer", "Third Eye Blind", "Counting Crows", "Smash Mouth", "Spin Doctors", "Smashing Pumpkins", "Foo Fighters", "Blink-182", "Garbage", "The Wallflowers", "Sugar Ray", "Hootie & the Blowfish", "Gin Blossoms", "Barenaked Ladies", "Collective Soul", "Dave Matthews Band", "Fugees", "Lauryn Hill", "Salt-N-Pepa", "Coolio", "Toni Braxton", "Seal"];

export const oneHitWondersFull = ["Chumbawamba", "Lou Bega", "Los Del Rio", "Baha Men", "Dexys Midnight Runners", "Gotye", "Vanilla Ice", "A-ha", "Soft Cell", "Sir Mix-A-Lot", "Right Said Fred", "Tommy Tutone", "Survivor", "Carl Douglas", "Los Lobos", "Blind Melon", "Men At Work", "Haddaway", "Eiffel 65", "The Knack", "Deep Blue Something", "Fountains of Wayne", "Wheatus", "Semisonic", "Nena"];
