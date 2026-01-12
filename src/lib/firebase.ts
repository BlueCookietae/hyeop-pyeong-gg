// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measuermentId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// 앱이 이미 초기화되었는지 확인 (Next.js 리로드 방지)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ⭐ 여기 앞에 'export'가 붙어 있는지 꼭 확인하세요!
export const auth = getAuth(app); 
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);