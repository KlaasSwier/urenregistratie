// firebase-config.js — vul je eigen config in (uit Firebase → Project settings → Web app)
const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};
firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();
window.db   = firebase.firestore();
