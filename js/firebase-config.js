import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAudnwg-PUK0iMMssYDMVtg4BEln5NoPQA",
  authDomain: "axis-login-b23a8.firebaseapp.com",
  projectId: "axis-login-b23a8",
  storageBucket: "axis-login-b23a8.firebasestorage.app",
  messagingSenderId: "537732796795",
  appId: "1:537732796795:web:c2f1a4709ae617380c2dde"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
