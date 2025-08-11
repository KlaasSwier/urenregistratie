// firebase-config.js — COMPAT variant (past bij jouw index.html)
const firebaseConfig = {
  apiKey: "AIzaSyDB6NKdIHJXytHom97eEpPE3KGdTXFFggE",
  authDomain: "urenregistratie-9c74b.firebaseapp.com",
  projectId: "urenregistratie-9c74b",
  storageBucket: "urenregistratie-9c74b.appspot.com", // dit domein gebruiken
  messagingSenderId: "868310860901",
  appId: "1:868310860901:web:a72e3afd0ef7e2c48728c",
  // measurementId is optioneel
};

// Init met compat SDK
firebase.initializeApp(firebaseConfig);

// Maak ze globaal zodat app.js ze kan gebruiken
window.auth = firebase.auth();
window.db   = firebase.firestore();
