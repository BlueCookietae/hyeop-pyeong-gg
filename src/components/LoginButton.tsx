'use client';

import { auth } from "@/lib/firebase";
import { signInWithPopup, signOut, GoogleAuthProvider } from "firebase/auth";
import { useState, useEffect } from "react";

// ⭐ compact(작아짐) 옵션을 받을 수 있게 수정
export default function LoginButton({ compact }: { compact?: boolean }) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("로그인 실패:", error);
    }
  };

  const handleLogout = () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      signOut(auth);
    }
  };

  // ✅ 로그인 상태일 때
  if (user) {
    return (
      <div className="flex items-center gap-3 transition-all duration-300">
        
        {/* ⭐ 이름 & 로그아웃 버튼: compact 모드일 때는 너비가 0이 되어 사라짐 */}
        <div className={`flex flex-col items-end overflow-hidden transition-all duration-300 ${compact ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
          <span className="text-[10px] font-bold text-slate-300 whitespace-nowrap">{user.displayName}님</span>
          <button onClick={handleLogout} className="text-[9px] text-slate-500 hover:text-red-400 underline whitespace-nowrap">로그아웃</button>
        </div>

        {/* ⭐ 프로필 사진: compact 모드일 때는 조금 작아짐 */}
        <button 
          onClick={compact ? handleLogout : undefined} // 작아졌을 땐 프사 누르면 로그아웃
          className={`rounded-full border border-slate-600 overflow-hidden transition-all duration-300 ${compact ? 'w-8 h-8' : 'w-9 h-9'}`}
        >
          {user.photoURL ? (
            <img src={user.photoURL} alt="profile" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-slate-700 flex items-center justify-center text-[10px]">?</div>
          )}
        </button>
      </div>
    );
  }

  // ✅ 비로그인 상태일 때
  return (
    <button 
      onClick={handleLogin}
      className={`bg-white text-black font-bold rounded-full flex items-center justify-center gap-2 hover:bg-slate-200 transition-all shadow-lg
        ${compact ? 'w-8 h-8 p-0' : 'px-3 py-1.5 text-xs'}
      `}
    >
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={compact ? "16" : "14"} alt="G" />
      {/* compact 아닐 때만 글자 표시 */}
      {!compact && <span>로그인</span>}
    </button>
  );
}