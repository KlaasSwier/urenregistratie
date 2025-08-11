// firebase-config.js
const firebaseConfig = {
  apiKey: "JOUW_API_KEY",
  authDomain: "JOUW_PROJECT_ID.firebaseapp.com",
  projectId: "JOUW_PROJECT_ID",
  storageBucket: "JOUW_PROJECT_ID.appspot.com",
  messagingSenderId: "JOUW_MESSAGING_SENDER_ID",
  appId: "JOUW_APP_ID",
  // measurementId mag ook erbij als Firebase het toont
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
