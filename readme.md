Here is a clean, fully detailed README for your repository. It captures the complex architecture you’ve built, explains the host/client relationship, and documents the hot-swappable cartridge system so anyone (or you, six months from now) can understand exactly how the platform works.

🎮 Yardbird's Games Platform
Live Demo: yardbirdsgames.com

Yardbird's Games is a modular, real-time multiplayer gaming console built entirely for the web. Designed with a "Jackbox-style" architecture, players use a TV, tablet, or desktop as the main game board (Host) while seamlessly using their smartphones as interactive, auto-updating controllers (Clients).

✨ Key Features
Universal Engine & Hot-Swapping: The platform acts as a blank console. Games are built as independent "cartridges" (gameLogic.js, mathLogic.js) that can be plugged into the engine on the fly without reloading the application.

Cross-Device Multiplayer: Powered by Firebase Realtime Database. Hosts generate a unique 4-letter room code, and up to 8 players can drop in instantly.

"Chameleon" Smart Remotes: The phone interface dynamically rebuilds itself based on the active cartridge and game state. It flawlessly transitions from waiting screens, to text-input fields, to multiple-choice buttons, to math-specific inputs.

Asymmetric Game States: The Host manages the heavy lifting (fetching APIs, running timers, grading answers) while the Clients act as lightweight, instantaneous input devices.

"Today Three" Global Challenge: A daily, synced global challenge mode allowing players to compete on the exact same dataset every 24 hours.

🕹️ Included Cartridges
1. Song Trivia (gameLogic.js)
The original Yardbird masterpiece. A high-stakes audio trivia game fetching real-time data from the iTunes API.

Modes: Guess the Artist/Song, Guess the Movie, or deep-dive into specific Artist catalogs.

Lifeline Mechanics: Players can instantly sacrifice maximum points to drop a "Multiple Choice" lifeline, forcing the UI to switch from text-boxes to buttons.

Dynamic Grading: Custom Levenshtein distance algorithms grade spelling variations and typos in real-time.

2. Fast Math (mathLogic.js)
An arcade-style, quick-fire arithmetic battle where speed is everything.

Modes: Addition, Subtraction, Multiplication, Division.

Scoring: Raw speed and accuracy scored directly against the clock.

🛠️ Tech Stack
Frontend: HTML5, CSS3, Vanilla JavaScript (ES6 Modules)

Backend / Sync: Firebase Realtime Database

External APIs: iTunes Search API (Audio previews and metadata)

Hosting: GitHub Pages with Custom DNS routing

📂 Architecture & File Structure
The codebase is strictly modular to separate platform state, network syncing, and individual game logic.

Plaintext
├── index.html          # The Universal Hub, lobby UI, and smart-remote containers
├── style.css           # Global variables, flexbox layouts, and responsive CSS
├── state.js            # Centralized state management (variables, audio, user stats)
├── firebase.js         # Firebase initialization and authentication
├── multiplayer.js      # The Universal Network Engine (Lobby creation, player sync)
├── ui.js               # Platform-level UI updates and local storage stat tracking
├── gameLogic.js        # CARTRIDGE: Song Trivia logic & API fetching
└── mathLogic.js        # CARTRIDGE: Fast Math logic & equation generation
🚀 Local Setup & Installation
To run this project locally or fork it for your own games:

Clone the repository:

Bash
git clone https://github.com/your-username/yardbirds-games.git
cd yardbirds-games
Configure Firebase:

Create a project in the Firebase Console.

Enable the Realtime Database.

Update the database rules to allow public read/write (for development) or secure them based on room codes.

Add your Firebase config keys into firebase.js.

Run a Local Server:
Because the project uses ES6 Modules (import/export), you cannot just double-click index.html. You must run it through a local web server.

Using Python: python3 -m http.server 8000

Using VS Code: Install the "Live Server" extension and click "Go Live".

🏗️ Building a New Cartridge
The platform is designed to be infinitely scalable. To add a new game:

Create a new file (e.g., triviaLogic.js).

Export a manifest object at the top of the file:

JavaScript
export const manifest = {
    id: "custom_trivia",
    title: "CUSTOM TRIVIA",
    clientUI: "mc-only" // Tells the phone to load specific controller layouts
};
Hook your start, stop, and grading functions into the universal hooks found in index.html and multiplayer.js.
