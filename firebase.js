// firebase.js
const firebaseConfig = {
    apiKey: "AIzaSyAK-y072g7RmxEXt438H6Votoci6T4S9uQ",
    authDomain: "yardbird-song-trivia.firebaseapp.com",
    projectId: "yardbird-song-trivia",
    storageBucket: "yardbird-song-trivia.firebasestorage.app",
    messagingSenderId: "707080141874",
    appId: "1:707080141874:web:7a48da42643bc46f69d02b",
    databaseURL: "https://yardbird-song-trivia-default-rtdb.firebaseio.com" 
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
export const db = firebase.database();