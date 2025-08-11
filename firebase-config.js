// firebase-config.js  (VUL HIERONDER JE EIGEN WAARDES IN)
const firebaseConfig = {
  apiKey: "JOUW_API_KEY",
  authDomain: "JOUW_PROJECT_ID.firebaseapp.com",
  projectId: "JOUW_PROJECT_ID",
  storageBucket: "JOUW_PROJECT_ID.appspot.com",
  messagingSenderId: "JOUW_MESSAGING_SENDER_ID",
  appId: "JOUW_APP_ID"
};

// Init Firebase + maak globale refs aan
firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();        // <— belangrijk: zet op window
window.db   = firebase.firestore();   // <— belangrijk: zet op window
