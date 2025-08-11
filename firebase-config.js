// firebase-config.js

// Config van Firebase project
const firebaseConfig = {
  apiKey: "JOUW_API_KEY",
  authDomain: "urenregistratie-9c74b.firebaseapp.com",
  projectId: "urenregistratie-9c74b",
  storageBucket: "urenregistratie-9c74b.appspot.com",
  messagingSenderId: "JOUW_MESSAGING_SENDER_ID",
  appId: "JOUW_APP_ID"
};

// Firebase initialiseren
firebase.initializeApp(firebaseConfig);

// Auth en Database globaal maken
window.auth = firebase.auth();
window.db = firebase.firestore();
