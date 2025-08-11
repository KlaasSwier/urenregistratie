// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDB6NKdlHJXytHom97eEpPE3KGdTXFFggE",
  authDomain: "urenregistratie-9c74b.firebaseapp.com",
  projectId: "urenregistratie-9c74b",
  storageBucket: "urenregistratie-9c74b.firebasestorage.app",
  messagingSenderId: "868310860901",
  appId: "1:868310860901:web:7335478befbe541348728c",
  measurementId: "G-5H8LF5F9FN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
