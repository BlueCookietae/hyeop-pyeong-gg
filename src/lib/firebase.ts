// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC7VDidXaYqcY5RH0UshgBMG_f9LhTAOg0",
  authDomain: "hyeop-pyeong.firebaseapp.com",
  projectId: "hyeop-pyeong",
  storageBucket: "hyeop-pyeong.firebasestorage.app",
  messagingSenderId: "331149292052",
  appId: "1:331149292052:web:4ffb775e984fda2b76ad01",
  measurementId: "G-8WPC71G39X"
};

// 앱 초기화
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ⭐ 여기 앞에 'export'가 붙어 있는지 꼭 확인하세요!
export const auth = getAuth(app); 
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);