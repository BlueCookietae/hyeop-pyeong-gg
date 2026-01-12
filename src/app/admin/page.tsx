'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

// ⭐ [보안 설정] 여기에 허용할 관리자 이메일을 적으세요.
const ADMIN_EMAILS = [
  "ggt3944@gmail.com", 
  // "sub-admin@gmail.com" // 여러 명이면 콤마로 구분해서 추가
];

export default function AdminPage() {
  // --- 🔐 인증 상태 관리 ---
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Firebase 인증 상태 감지 (로그인/로그아웃 체크)
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.email && ADMIN_EMAILS.includes(currentUser.email)) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      alert("로그인 실패");
    }
  };
  // --------------------

  const [teams, setTeams] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [roster, setRoster] = useState(['', '', '', '', '']);
  const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];

  // 데이터 로드
  const fetchTeams = async () => {
    try {
      const snap = await getDocs(collection(db, 'teams'));
      setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) { console.error(e); }
  };

  useEffect(() => { 
    if (isAdmin) fetchTeams(); 
  }, [isAdmin]);

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName) return alert("팀 이름을 입력하세요.");
    try {
      await setDoc(doc(db, "teams", teamName), {
        name: teamName,
        roster: roster,
        updatedAt: serverTimestamp()
      });
      alert(`${teamName} 로스터 저장 완료!`);
      setTeamName('');
      setRoster(['', '', '', '', '']);
      fetchTeams();
    } catch (e) { alert("저장 실패"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "teams", id));
    fetchTeams();
  };

  const handleSyncLCK = async () => {
    if (!confirm("LCK 일정을 동기화하시겠습니까?")) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/lck');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      for (const match of data.matches) {
        await setDoc(doc(db, "matches", match.id), { ...match, createdAt: serverTimestamp() });
      }
      alert(`성공! ${data.count}개 경기 동기화 완료`);
    } catch (e: any) { alert(e.message); } finally { setIsSyncing(false); }
  };

  // 1. 로딩 중
  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400 font-black">CHECKING PERMISSION...</div>;

  // 2. 로그인 안 했거나, 관리자가 아닌 경우
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl text-center">
          <div className="text-4xl mb-4">{user ? '🚫' : '🛡️'}</div>
          <h1 className="text-2xl font-black text-white italic mb-2 uppercase tracking-tighter">Admin Access</h1>
          
          {user ? (
            // 로그인은 했는데 관리자가 아님
            <div className="space-y-4">
              <p className="text-red-400 text-sm font-bold">
                Access Denied.<br/>
                <span className="text-slate-500">{user.email}</span> is not an admin.
              </p>
              <button onClick={() => signOut(auth)} className="text-slate-500 underline text-xs hover:text-white">Sign Out</button>
            </div>
          ) : (
            // 로그인 안 함
            <div className="space-y-6">
              <p className="text-slate-500 text-xs font-bold">AUTHORIZED PERSONNEL ONLY</p>
              <button 
                onClick={handleGoogleLogin} 
                className="w-full bg-white hover:bg-slate-200 text-slate-900 font-bold py-4 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3"
              >
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
                Sign in with Google
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. 관리자 대시보드 (isAdmin === true)
  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-black text-cyan-400 italic">ROSTER ADMIN</h1>
            <p className="text-[10px] text-slate-500 font-bold mt-1">Logged in as {user?.email}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSyncLCK} disabled={isSyncing} className="bg-slate-900 text-cyan-400 px-4 py-2 rounded-xl font-bold text-xs uppercase border border-cyan-500/30 hover:bg-slate-800 transition-colors">
              {isSyncing ? "Syncing..." : "🔄 Sync Schedule"}
            </button>
            <button onClick={() => signOut(auth)} className="bg-red-900/30 text-red-500 px-4 py-2 rounded-xl font-bold text-xs uppercase border border-red-500/30 hover:bg-red-900/50 transition-colors">
              Log Out
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* 팀 등록 폼 */}
          <div className="bg-slate-900/50 p-6 rounded-[2rem] border border-slate-800 h-fit">
            <h2 className="text-sm font-bold text-slate-500 mb-6 uppercase tracking-widest">Add / Edit Team</h2>
            <form onSubmit={handleSaveTeam} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-cyan-400 mb-1 block">TEAM NAME (Exact Match)</label>
                <input 
                  type="text" placeholder="e.g. T1" 
                  value={teamName} onChange={e => setTeamName(e.target.value)} 
                  className="w-full bg-slate-800 p-3 rounded-xl font-black text-white outline-none focus:ring-2 focus:ring-cyan-500" 
                />
              </div>
              <div className="space-y-2 pt-2">
                <label className="text-[10px] font-bold text-slate-500 mb-1 block">PLAYER NAMES</label>
                {POSITIONS.map((pos, idx) => (
                  <div key={pos} className="flex gap-2 items-center">
                    <span className="w-8 text-[10px] font-bold text-slate-600">{pos}</span>
                    <input 
                      type="text" placeholder={`${pos} Player`} 
                      value={roster[idx]} 
                      onChange={e => {
                        const newRoster = [...roster];
                        newRoster[idx] = e.target.value;
                        setRoster(newRoster);
                      }} 
                      className="flex-1 bg-slate-950 p-2.5 rounded-lg text-sm font-medium outline-none border border-slate-800 focus:border-cyan-500" 
                    />
                  </div>
                ))}
              </div>
              <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 py-3 rounded-xl font-black text-sm uppercase shadow-lg mt-4 transition-all">
                Save Roster
              </button>
            </form>
          </div>

          {/* 등록된 팀 목록 */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-widest px-2">Registered Teams ({teams.length})</h2>
            {teams.map((team) => (
              <div key={team.id} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex justify-between items-center group hover:border-slate-600 transition-all">
                <div>
                  <div className="text-xl font-black text-white mb-2">{team.name}</div>
                  <div className="flex gap-2 text-[10px] text-slate-400 font-medium">
                    {team.roster.map((p:string, i:number) => (
                      <span key={i} className="bg-slate-950 px-2 py-1 rounded">{p || '-'}</span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setTeamName(team.name); setRoster(team.roster); }} className="text-xl hover:scale-110 transition-transform" title="수정">✏️</button>
                  <button onClick={() => handleDelete(team.id)} className="text-xl hover:scale-110 transition-transform text-red-500" title="삭제">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}