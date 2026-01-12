'use client';

import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup, signOut } from "firebase/auth";
import { useState, useEffect } from "react";

export default function LoginButton() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // 로그인 상태 감시
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("로그인 실패:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <img src={user.photoURL} alt="profile" className="w-8 h-8 rounded-full border border-cyan-500" />
        <span className="text-xs font-bold text-slate-300">{user.displayName}님</span>
        <button onClick={handleLogout} className="text-[10px] text-slate-500 underline">로그아웃</button>
      </div>
    );
  }

  return (
    <button 
      onClick={handleLogin}
      className="bg-white text-black px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-slate-200 transition-colors"
    >
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="G" />
      Google로 로그인
    </button>
  );
}