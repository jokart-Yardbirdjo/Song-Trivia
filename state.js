// state.js
export const state = {
    isMultiplayer: false,
    isHost: false,
    roomCode: "",
    myPlayerId: "",
    isGracePeriod: false,

    gameState: {
        mode: 'genre',
        sub: 'shwe-special',
        players: 1,
        rounds: 10,
        level: 'easy'
    },

    songs: [],
    globalPool: [], 
    curIdx: 0, 
    numPlayers: 1, 
    maxRounds: 10, 
    roundsPerPlayer: 10,
    rawScores: [], 
    streaks: [], 
    matchHistory: [],
    timeLimit: 30, 
    timeTaken: 0,
    timerId: null, 
    guessTimerId: null, 
    timeLeft: 0, 
    startTime: 0,
    isDailyMode: false, 
    isProcessing: false, 
    hasUsedLifeline: false, 
    scoreLock: 0,

    // Replaces the old userStats object in state.js
    activeCartridgeId: null, // Keeps track of what game is currently plugged in
    
    userStats: JSON.parse(localStorage.getItem('yardbirdPlatformStats')) || { 
        platformGamesPlayed: 0,
        song_trivia: JSON.parse(localStorage.getItem('yardbirdStatsV6')) || {
            gamesPlayed: 0, totalGuesses: 0, correctGuesses: 0, hsText: 0, hsMC: 0, sniperHits: 0, 
            lastPlayedDate: null, currentStreak: 0, playedDailyToday: false, 
            modesPlayed: { genre: false, artist: false, movie: false }, 
            trophies: { perf: false, mara: false, snip: false, streak: false, expl: false } 
        },
        fast_math: {
            gamesPlayed: 0, hsText: 0, correctGuesses: 0, totalGuesses: 0
        }, // <--- ADD THIS COMMA
        consensus: { gamesPlayed: 0, highScore: 0 } // <--- ADD THIS LINE
    },
    globalHighScore: localStorage.getItem('yardbirdHighScore') || 0
};

export const audio = new Audio();
export const sfxTick = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
export const sfxCheer = new Audio('https://actions.google.com/sounds/v1/crowds/crowd_cheer.ogg');
export const sfxBuzzer = new Audio('https://actions.google.com/sounds/v1/alarms/buzzer_alarm.ogg');
sfxTick.volume = 0.5; sfxCheer.volume = 0.7; sfxBuzzer.volume = 0.4;

export const colors = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)'];

export const subOptions = {
    genre: ['shwe-special', 'classic-rock', '2000s', 'one-hit-wonders', 'custom'],
    artist: ['Taylor Swift', 'Led Zeppelin', 'Michael Jackson', 'A.R. Rahman', 'custom'],
    movie: ['Disney Classics', 'Hollywood Blockbusters', 'Bollywood Hits', 'Tamil Cinema', 'custom']
};

export const top20DisneyMovies = ["The Lion King", "Beauty and the Beast", "Aladdin", "Toy Story", "Snow White and the Seven Dwarfs", "The Little Mermaid", "Finding Nemo", "Up", "Monsters, Inc.", "Cinderella", "Mulan", "Tangled", "The Princess and the Frog", "The Incredibles", "Ratatouille", "WALL-E", "Frozen", "Lilo & Stitch", "The Jungle Book", "Peter Pan"];
export const top20BollywoodMovies = ["Lagaan", "Sholay", "Mughal-e-Azam", "Mother India", "Pakeezah", "Deewaar", "Anand", "Guide", "Dilwale Dulhania Le Jayenge", "Kabhi Khushi Kabhie Gham", "3 Idiots", "Taare Zameen Par", "Rang De Basanti", "Gangs of Wasseypur", "Black", "Swades", "Chak De! India", "Dangal", "Bajrangi Bhaijaan", "PK"];
export const top20TamilMovies = ["Nayakan", "Thalapathi", "Indian", "Baasha", "Anbe Sivam", "Mouna Ragam", "Roja", "Moondram Pirai", "Mullum Malarum", "Nizhalgal", "Thiruda Thiruda", "Gentleman", "Thevar Magan", "Paruthiveeran", "Karnan", "Kannathil Muthamittal", "Alaipayuthey", "Bombay", "Sethu", "Kaadhal"];
export const top20HollywoodMovies = ["The Godfather", "Saturday Night Fever", "Pulp Fiction", "The Graduate", "The Bodyguard", "Purple Rain", "Moulin Rouge!", "Almost Famous", "The Lion King", "Guardians of the Galaxy", "Top Gun", "Trainspotting", "The Wizard of Oz", "West Side Story", "The Sound of Music", "Dirty Dancing", "Once", "The Big Chill", "O Brother, Where Art Thou?", "The Last of the Mohicans"];

export const shweArtistsFull = ["Nirvana", "Mariah Carey", "Oasis", "Britney Spears", "Red Hot Chili Peppers", "No Doubt", "Pearl Jam", "Alanis Morissette", "Green Day", "Madonna", "Bryan Adams", "Backstreet Boys", "Bon Jovi", "Spice Girls", "Guns N' Roses", "Celine Dion", "Roxette", "TLC", "Aerosmith", "Sheryl Crow", "U2", "The Cranberries", "R.E.M.", "Janet Jackson", "Dire Straits", "Whitney Houston", "Christina Aguilera", "Hanson", "Matchbox Twenty", "Ace of Base", "Goo Goo Dolls", "Aqua", "Natalie Imbruglia", "Black Eyed Peas", "Meat Loaf", "Mr. Big", "Michael Jackson", "The Cardigans", "NSYNC", "Destiny's Child", "Ricky Martin", "Jennifer Lopez", "Cher", "Savage Garden", "Boyzone", "En Vogue", "Boyz II Men", "All Saints", "Shania Twain", "Sarah McLachlan", "Jewel", "Faith Hill", "Fiona Apple", "Melissa Etheridge", "Tracy Chapman", "Sophie B. Hawkins", "The Corrs", "Paula Cole", "Weezer", "Third Eye Blind", "Counting Crows", "Smash Mouth", "Spin Doctors", "Smashing Pumpkins", "Foo Fighters", "Blink-182", "Garbage", "The Wallflowers", "Sugar Ray", "Hootie & the Blowfish", "Gin Blossoms", "Barenaked Ladies", "Collective Soul", "Dave Matthews Band", "Fugees", "Lauryn Hill", "Salt-N-Pepa", "Coolio", "Toni Braxton", "Seal"];
export const oneHitWondersFull = ["Chumbawamba", "Lou Bega", "Los Del Rio", "Baha Men", "Dexys Midnight Runners", "Gotye", "Vanilla Ice", "A-ha", "Soft Cell", "Sir Mix-A-Lot", "Right Said Fred", "Tommy Tutone", "Survivor", "Carl Douglas", "Los Lobos", "Blind Melon", "Men At Work", "Haddaway", "Eiffel 65", "The Knack", "Deep Blue Something", "Fountains of Wayne", "Wheatus", "Semisonic", "Nena"];
