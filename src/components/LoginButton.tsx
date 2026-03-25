'use client';

import { useAuthStore } from '@/stores/authStore';

export default function LoginButton({ compact }: { compact?: boolean }) {
  const { user, login, logout } = useAuthStore();

  if (user) {
    return (
      <div className="flex items-center gap-3 transition-all duration-300">
        <div className={`flex flex-col items-end overflow-hidden transition-all duration-300 ${compact ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
          <span className="text-[10px] font-bold text-slate-300 whitespace-nowrap">{user.displayName}님</span>
          <button onClick={logout} className="text-[9px] text-slate-500 hover:text-red-400 underline whitespace-nowrap">로그아웃</button>
        </div>
        <button
          onClick={compact ? logout : undefined}
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

  return (
    <button
      onClick={login}
      className={`bg-white text-black font-bold rounded-full flex items-center justify-center gap-2 hover:bg-slate-200 transition-all shadow-lg
        ${compact ? 'w-8 h-8 p-0' : 'px-3 py-1.5 text-xs'}
      `}
    >
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={compact ? "16" : "14"} alt="G" />
      {!compact && <span>로그인</span>}
    </button>
  );
}
