// firebase-config.js — COMPAT variant
const firebaseConfig = {
  apiKey: "AIzaSyC7OtHEZBM60_HFipE4j5W6ghJuXyG3vIk",
  authDomain: "urenregistratie-b4ffd.firebaseapp.com",
  projectId: "urenregistratie-b4ffd",
  storageBucket: "urenregistratie-b4ffd.firebasestorage.app",
  messagingSenderId: "432575433985",
  appId: "1:432575433985:web:b1f52c8381fdb0475e1f00"
};

firebase.initializeApp(firebaseConfig);

window.auth = firebase.auth();
window.db = firebase.firestore();
