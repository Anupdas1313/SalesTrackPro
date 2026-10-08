import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAudnwg-PUK0iMMssYDMVtg4BEln5NoPQA",
  authDomain: "axis-login-b23a8.firebaseapp.com",
  projectId: "axis-login-b23a8",
  storageBucket: "axis-login-b23a8.firebasestorage.app",
  messagingSenderId: "537732796795",
  appId: "1:537732796795:web:c2f1a4709ae617380c2dde"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
