// firebase-config.js — COMPAT
const firebaseConfig = {
  apiKey: "AIzaSyBE9_oNBQdjcNVqJgeEa_uOgm_zPvl2Z8o",
  authDomain: "urenregistratie-9c74b.firebaseapp.com",
  projectId: "urenregistratie-9c74b",
  storageBucket: "urenregistratie-9c74b.appspot.com",
  messagingSenderId: "868310860901",
  appId: "1:868310860901:web:a72e3afd0ef7e2c48728c"
};

firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();
window.db   = firebase.firestore();
