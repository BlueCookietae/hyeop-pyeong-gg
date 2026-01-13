'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

// ⭐ [보안 설정] 관리자 이메일
const ADMIN_EMAILS = [
  "ggt3944@gmail.com", 
];

export default function AdminPage() {
  // --- 🔐 인증 상태 관리 ---
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // 🛠️ DB에서 긁어온 데이터들을 담을 곳
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]); // 년도도 자동!
  
  const [teams, setTeams] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // 입력 State
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

  // 1. 등록된 로스터 목록 불러오기
  const fetchTeams = async () => {
    try {
      const snap = await getDocs(collection(db, 'teams'));
      const loadedTeams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      loadedTeams.sort((a, b) => a.id.localeCompare(b.id)); 
      setTeams(loadedTeams);
    } catch(e) { console.error(e); }
  };

  // ⭐ 2. [핵심] 경기 기록(matches)에서 "팀 이름"과 "년도" 싹 긁어오기
  const fetchInfoFromMatches = async () => {
    try {
      const snap = await getDocs(collection(db, 'matches'));
      const teamSet = new Set<string>(); // 팀 중복제거
      const yearSet = new Set<string>(); // 년도 중복제거

      snap.forEach(doc => {
        const data = doc.data();
        // 팀 이름 수집
        if (data.home?.name) teamSet.add(data.home.name);
        if (data.away?.name) teamSet.add(data.away.name);
        
        // 년도 수집 (date: "2025-01-15..." -> "2025")
        if (data.date) {
            const y = data.date.split('-')[0];
            if (y && y.length === 4) yearSet.add(y);
        }
      });

      // 정렬
      const sortedTeams = Array.from(teamSet).sort();
      const sortedYears = Array.from(yearSet).sort();

      setAvailableTeams(sortedTeams);
      setAvailableYears(sortedYears);
      
      // 초기값 자동 선택 (없으면 첫번째 값으로)
      if (sortedTeams.length > 0 && !selectedTeam) setSelectedTeam(sortedTeams[0]);
      if (sortedYears.length > 0 && !selectedYear) setSelectedYear(sortedYears[0]);

    } catch (e) {
      console.error("경기 정보 분석 실패:", e);
    }
  };

  useEffect(() => { 
    if (isAdmin) {
        fetchTeams();
        fetchInfoFromMatches(); // 실행!
    }
  }, [isAdmin]);

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam || !selectedYear) return alert("팀과 년도를 선택해주세요 (동기화 필요)");

    const docId = `${selectedTeam}_${selectedYear}`;

    try {
      await setDoc(doc(db, "teams", docId), {
        name: selectedTeam, 
        year: selectedYear,
        roster: roster,
        updatedAt: serverTimestamp()
      });
      alert(`✅ [${docId}] 로스터 저장 완료!`);
      fetchTeams();
    } catch (e) { alert("저장 실패"); }
  };

  const handleEditClick = (team: any) => {
    // ID 파싱 (Gen.G_2025 -> Team: Gen.G, Year: 2025)
    if (team.id.includes('_')) {
        const parts = team.id.split('_');
        const tYear = parts.pop(); // 맨 뒤가 년도
        const tName = parts.join('_'); // 나머지가 팀 이름
        setSelectedTeam(tName);
        setSelectedYear(tYear);
    } else {
        setSelectedTeam(team.name || team.id);
        setSelectedYear('2025'); // 구버전 데이터 대비 기본값
    }
    setRoster(team.roster);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`[${id}] 삭제하시겠습니까?`)) return;
    await deleteDoc(doc(db, "teams", id));
    fetchTeams();
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } 
    catch (error) { console.error(error); alert("로그인 실패"); }
  };

  const handleSyncLCK = async () => {
    if (!confirm("LCK 일정을 동기화하시겠습니까?")) return;
    setIsSyncing(true);
    try {
      const res = await fetch('/api/lck');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      for (const match of data.matches) {
        await setDoc(doc(db, "matches", match.id), { ...match, createdAt: serverTimestamp() }, { merge: true });
      }
      alert(`성공! ${data.count}개 경기 동기화 완료`);
      fetchInfoFromMatches(); // 동기화 끝나면 목록 갱신
    } catch (e: any) { alert(e.message); } finally { setIsSyncing(false); }
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400 font-black">Checking...</div>;
  if (!isAdmin) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><button onClick={handleGoogleLogin} className="bg-white p-4 rounded font-bold">Admin Login</button></div>;

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
          {/* 입력 폼 */}
          <div className="bg-slate-900/50 p-6 rounded-[2rem] border border-slate-800 h-fit sticky top-10">
            <h2 className="text-sm font-bold text-slate-500 mb-6 uppercase tracking-widest">Add / Edit Roster</h2>
            <form onSubmit={handleSaveTeam} className="space-y-4">
              
              <div className="flex gap-3">
                <div className="flex-1">
                    <label className="text-[10px] font-bold text-cyan-400 mb-1 block">
                        TEAM ({availableTeams.length})
                    </label>
                    <select 
                        value={selectedTeam} 
                        onChange={e => setSelectedTeam(e.target.value)}
                        className="w-full bg-slate-800 p-3 rounded-xl font-black text-white outline-none focus:ring-2 focus:ring-cyan-500 appearance-none text-center"
                    >
                        {availableTeams.length === 0 && <option>Sync First!</option>}
                        {availableTeams.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div className="w-1/3">
                    <label className="text-[10px] font-bold text-amber-400 mb-1 block">
                        YEAR ({availableYears.length})
                    </label>
                    <select 
                        value={selectedYear} 
                        onChange={e => setSelectedYear(e.target.value)}
                        className="w-full bg-slate-800 p-3 rounded-xl font-black text-white outline-none focus:ring-2 focus:ring-amber-500 appearance-none text-center"
                    >
                        {availableYears.length === 0 && <option>Sync First!</option>}
                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
              </div>
              
              <div className="text-center">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    ID: <span className="text-white bg-slate-800 px-1 rounded ml-1">{selectedTeam}_{selectedYear}</span>
                </span>
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-[10px] font-bold text-slate-500 mb-1 block">PLAYER NAMES</label>
                {POSITIONS.map((pos, idx) => (
                  <div key={pos} className="flex gap-2 items-center">
                    <span className="w-8 text-[10px] font-bold text-slate-600">{pos}</span>
                    <input 
                      type="text" 
                      placeholder={`Ex: Oner / Tom`} 
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
                <p className="text-[10px] text-slate-500 text-right pt-1">* 여러 명일 경우 <code>/</code> 로 구분 (예: <code>Gumayusi / Smash</code>)</p>
              </div>
              <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 py-3 rounded-xl font-black text-sm uppercase shadow-lg mt-4 transition-all">
                Save Roster
              </button>
            </form>
          </div>

          {/* 목록 */}
          <div className="space-y-3 pb-20">
            <h2 className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-widest px-2">Registered Rosters ({teams.length})</h2>
            {teams.map((team) => (
              <div key={team.id} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex justify-between items-center group hover:border-slate-600 transition-all">
                <div>
                  <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-xl font-black text-white">{team.name}</span>
                      <span className="text-xs font-bold text-amber-500 bg-amber-950/30 px-1.5 py-0.5 rounded">{team.year || team.id.split('_').pop()}</span>
                  </div>
                  <div className="flex gap-2 text-[10px] text-slate-400 font-medium flex-wrap">
                    {team.roster.map((p:string, i:number) => (
                      <span key={i} className="bg-slate-950 px-2 py-1 rounded border border-slate-800">{p || '-'}</span>
                    ))}
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