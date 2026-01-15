'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, doc, setDoc, getDocs, getDoc, deleteDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

// ⭐ [보안 설정] 관리자 이메일
const ADMIN_EMAILS = [
  "ggt3944@gmail.com", 
];

export default function AdminPage() {
  // --- 🔐 인증 상태 ---
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // --- 🐼 PandaScore 상태 ---
  const [pandaStatus, setPandaStatus] = useState<any>(null);
  const [isPandaSyncing, setIsPandaSyncing] = useState(false);

  // --- 🛠️ 로스터 관리 상태 ---
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [isLckSyncing, setIsLckSyncing] = useState(false); // 기존 LCK 일정 동기화용
  
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [roster, setRoster] = useState(['', '', '', '', '']);
  const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];

  useEffect(() => {
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

  // --- 데이터 불러오기 ---
  useEffect(() => { 
    if (isAdmin) {
        fetchTeams();
        fetchInfoFromMatches();
        
        // ⭐ 실시간 모니터링: PandaScore 시스템 로그 구독
        const unsubPanda = onSnapshot(doc(db, 'system', 'pandascore'), (doc) => {
            if (doc.exists()) setPandaStatus(doc.data());
        });
        return () => unsubPanda();
    }
  }, [isAdmin]);

  const fetchTeams = async () => {
    try {
      const snap = await getDocs(collection(db, 'teams'));
      const loadedTeams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      loadedTeams.sort((a, b) => a.id.localeCompare(b.id)); 
      setTeams(loadedTeams);
    } catch(e) { console.error(e); }
  };

  const fetchInfoFromMatches = async () => {
    try {
      const snap = await getDocs(collection(db, 'matches'));
      const teamSet = new Set<string>();
      const yearSet = new Set<string>();

      snap.forEach(doc => {
        const data = doc.data();
        if (data.home?.name) teamSet.add(data.home.name);
        if (data.away?.name) teamSet.add(data.away.name);
        if (data.date) {
            const y = data.date.split('-')[0];
            if (y && y.length === 4) yearSet.add(y);
        }
      });

      const sortedTeams = Array.from(teamSet).sort();
      const sortedYears = Array.from(yearSet).sort();
      setAvailableTeams(sortedTeams);
      setAvailableYears(sortedYears);
      
      if (sortedTeams.length > 0 && !selectedTeam) setSelectedTeam(sortedTeams[0]);
      if (sortedYears.length > 0 && !selectedYear) setSelectedYear(sortedYears[0]);
    } catch (e) { console.error(e); }
  };

  // --- 핸들러 ---
  const handlePandaSync = async () => {
    if (!confirm("🐼 PandaScore 실시간 점수를 동기화하시겠습니까?")) return;
    setIsPandaSyncing(true);
    try {
        const res = await fetch('/api/cron/update-match'); // 우리가 만든 로봇 호출
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        alert(json.message || `동기화 완료! (API 호출: ${json.apiCalled ? 'O' : 'X'}, 업데이트: ${json.updated}건)`);
    } catch (e: any) {
        alert(`실패: ${e.message}`);
    } finally {
        setIsPandaSyncing(false);
    }
  };

const handleSyncLCK = async () => {
    if (!confirm("LCK 전체 일정을 다시 불러오시겠습니까? (Riot API)")) return;
    setIsLckSyncing(true);
    try {
      const res = await fetch('/api/lck');
      const data = await res.json();

      // ⭐ [수정] 에러 체크 강화
      if (!res.ok || data.error) {
        throw new Error(data.error || `서버 에러 (${res.status})`);
      }
      
      // ⭐ [수정] matches가 진짜 배열인지 확인
      if (!Array.isArray(data.matches)) {
        throw new Error("데이터 형식이 올바르지 않습니다. (matches is not array)");
      }

      for (const match of data.matches) {
        await setDoc(doc(db, "matches", match.id), { ...match, createdAt: serverTimestamp() }, { merge: true });
      }
      
      alert(`성공! ${data.count}개 경기 일정 로드 완료`);
      fetchInfoFromMatches();
    } catch (e: any) { 
      console.error(e); // 콘솔에 자세한 에러 출력
      alert(`실패: ${e.message}`); 
    } finally { 
      setIsLckSyncing(false); 
    }
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam || !selectedYear) return alert("팀과 년도를 선택해주세요");
    const docId = `${selectedTeam}_${selectedYear}`;
    try {
      await setDoc(doc(db, "teams", docId), {
        name: selectedTeam, year: selectedYear, roster: roster, updatedAt: serverTimestamp()
      });
      alert(`✅ 저장 완료`); fetchTeams();
    } catch (e) { alert("저장 실패"); }
  };

  const handleEditClick = (team: any) => {
    if (team.id.includes('_')) {
        const parts = team.id.split('_');
        const tYear = parts.pop();
        const tName = parts.join('_');
        setSelectedTeam(tName);
        setSelectedYear(tYear);
    } else {
        setSelectedTeam(team.name || team.id);
        setSelectedYear('2025');
    }
    setRoster(team.roster);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`삭제하시겠습니까?`)) return;
    await deleteDoc(doc(db, "teams", id));
    fetchTeams();
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (error) { console.error(error); alert("로그인 실패"); }
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400 font-black">Checking...</div>;
  if (!isAdmin) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><button onClick={handleGoogleLogin} className="bg-white p-4 rounded font-bold">Admin Login</button></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* 헤더 */}
        <div className="flex justify-between items-end mb-8 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-black text-cyan-400 italic tracking-tighter">ADMIN DASHBOARD</h1>
            <p className="text-xs text-slate-500 font-bold mt-1">Master: {user?.email}</p>
          </div>
          <button onClick={() => signOut(auth)} className="text-red-500 text-xs font-bold hover:text-red-400">LOGOUT</button>
        </div>

        {/* ⭐ PandaScore 모니터링 카드 */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
            <div className="md:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl">🐼</div>
                <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest flex items-center gap-2">
                    <span>Live Score Status</span>
                    {pandaStatus?.status === 'OK' ? <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> : <span className="w-2 h-2 rounded-full bg-red-500"></span>}
                </h2>
                
                <div className="flex gap-8 items-end">
                    <div>
                        <div className="text-4xl font-black text-white">{pandaStatus?.todayCalls || 0} <span className="text-base text-slate-500 font-bold">Calls Today</span></div>
                        <div className="text-xs text-slate-500 mt-1 font-medium">Monthly Total: <span className="text-cyan-400">{pandaStatus?.monthlyCalls || 0}</span> / 1,000 (Free Limit)</div>
                    </div>
                    <div className="h-10 w-px bg-slate-800"></div>
                    <div>
                        <div className="text-xs text-slate-500 font-bold mb-1">LAST SYNC</div>
                        <div className="text-sm text-white font-mono">{pandaStatus?.lastRun ? new Date(pandaStatus.lastRun).toLocaleString() : 'Never'}</div>
                        <div className="text-[10px] text-slate-400 mt-1">{pandaStatus?.lastResult || '-'}</div>
                    </div>
                </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl flex flex-col justify-center gap-3">
                <button onClick={handlePandaSync} disabled={isPandaSyncing} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2">
                    {isPandaSyncing ? <span className="animate-spin">⏳</span> : <span>🐼</span>}
                    {isPandaSyncing ? "Syncing..." : "Sync Live Scores"}
                </button>
                <button onClick={handleSyncLCK} disabled={isLckSyncing} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl font-bold text-xs border border-slate-700 transition-all">
                    {isLckSyncing ? "Loading..." : "📅 Reload Full Schedule (Riot)"}
                </button>
            </div>
        </div>

        {/* 로스터 관리 섹션 */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* 입력 폼 */}
          <div className="bg-slate-900/50 p-6 rounded-[2rem] border border-slate-800 h-fit sticky top-10">
            <h2 className="text-sm font-bold text-slate-500 mb-6 uppercase tracking-widest">Roster Editor</h2>
            <form onSubmit={handleSaveTeam} className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                    <label className="text-[10px] font-bold text-cyan-400 mb-1 block">TEAM</label>
                    <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} className="w-full bg-slate-800 p-3 rounded-xl font-black text-white outline-none focus:ring-2 focus:ring-cyan-500 appearance-none text-center">
                        {availableTeams.length === 0 && <option>No Data</option>}
                        {availableTeams.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div className="w-1/3">
                    <label className="text-[10px] font-bold text-amber-400 mb-1 block">YEAR</label>
                    <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="w-full bg-slate-800 p-3 rounded-xl font-black text-white outline-none focus:ring-2 focus:ring-amber-500 appearance-none text-center">
                        {availableYears.length === 0 && <option>2025</option>}
                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
              </div>
              
              <div className="space-y-2 pt-2">
                {POSITIONS.map((pos, idx) => (
                  <div key={pos} className="flex gap-2 items-center">
                    <span className="w-8 text-[10px] font-bold text-slate-600">{pos}</span>
                    <input type="text" value={roster[idx]} onChange={e => { const n = [...roster]; n[idx] = e.target.value; setRoster(n); }} className="flex-1 bg-slate-950 p-2.5 rounded-lg text-sm font-medium outline-none border border-slate-800 focus:border-cyan-500" />
                  </div>
                ))}
              </div>
              <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 py-3 rounded-xl font-black text-sm uppercase shadow-lg mt-4 transition-all">Save Roster</button>
            </form>
          </div>

          {/* 목록 */}
          <div className="space-y-3 pb-20">
            <h2 className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-widest px-2">Registered ({teams.length})</h2>
            {teams.map((team) => (
              <div key={team.id} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex justify-between items-center group hover:border-slate-600 transition-all">
                <div>
                  <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-xl font-black text-white">{team.name}</span>
                      <span className="text-xs font-bold text-amber-500 bg-amber-950/30 px-1.5 py-0.5 rounded">{team.year || '2025'}</span>
                  </div>
                  <div className="flex gap-2 text-[10px] text-slate-400 font-medium flex-wrap">
                    {team.roster.map((p:string, i:number) => <span key={i} className="bg-slate-950 px-2 py-1 rounded border border-slate-800">{p || '-'}</span>)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEditClick(team)} className="w-10 h-10 rounded-full bg-slate-800 hover:bg-cyan-900/50 hover:text-cyan-400 flex items-center justify-center transition-all">✏️</button>
                  <button onClick={() => handleDelete(team.id)} className="w-10 h-10 rounded-full bg-slate-800 hover:bg-red-900/50 hover:text-red-400 flex items-center justify-center transition-all">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}