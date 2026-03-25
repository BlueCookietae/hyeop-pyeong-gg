'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { 
  collection, doc, updateDoc, query, onSnapshot, serverTimestamp, deleteDoc 
} from 'firebase/firestore'; 
import { 
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut 
} from 'firebase/auth';

const ADMIN_EMAILS = [
  "ggt3944@gmail.com", 
];

const APP_ID = 'lck-2026-app';

export default function AdminPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<any>(null);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [inspectId, setInspectId] = useState('');
  const [inspectType, setInspectType] = useState('team');
  const [inspectResult, setInspectResult] = useState<string>('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [syncInput, setSyncInput] = useState('');
  const [tournamentLeagueId, setTournamentLeagueId] = useState('');
  const [isSyncingTournament, setIsSyncingTournament] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAdmin(u?.email ? ADMIN_EMAILS.includes(u.email) : false);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => { 
    if (!isAdmin) return;
    const teamsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'teams');
    const unsubTeams = onSnapshot(query(teamsRef), (snap) => {
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        list.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
        setTeams(list);
    });
    return () => unsubTeams();
  }, [isAdmin]);

  // --- 핸들러 ---

  const handleSyncTeam = async (val: string) => {
    if (!val) return alert("Team ID를 입력하세요.");
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/cron/update-match?mode=sync_team&id=${encodeURIComponent(val)}`);
      const data = await res.json();
      if (data.success) {
          alert(`✅ ${data.team} (${data.year || '2026'}) 업데이트 완료!`);
          setSyncInput(''); 
      } else alert(`실패: ${data.error}`);
    } catch(e: any) { alert(e.message); }
    finally { setIsSyncing(false); }
  };

  const handleDeleteTeam = async (e: React.MouseEvent, teamId: string, teamName: string) => {
      e.stopPropagation(); 
      if (!confirm(`정말 '${teamName}' 팀을 삭제하시겠습니까?\n(ID: ${teamId})`)) return;
      try {
          await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'teams', String(teamId)));
          if (selectedTeam?.id === teamId) setSelectedTeam(null); 
          alert("삭제되었습니다.");
      } catch (e: any) { alert("삭제 실패: " + e.message); }
  };

  // ⭐ [변경] 스케줄 로드 대신 '매치 데이터 동기화' (Games 포함)
  const handleSyncMatches = async () => {
    if (!confirm("🎮 LCK 경기 데이터(승패/세트 정보 포함)를 동기화하시겠습니까?")) return;
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/cron/update-match?mode=sync_matches`); // 모드 변경됨
      const data = await res.json();
      if (data.success) {
          alert(`✅ 성공! 총 ${data.count}개의 경기 데이터가 갱신되었습니다.`);
      } else alert(`에러: ${data.error}`);
    } catch(e: any) { alert(e.message); }
    finally { setIsSyncing(false); }
  };

  const handleSyncTournament = async () => {
    if (!tournamentLeagueId) return alert("League ID를 입력하세요.");
    if (!confirm(`리그 ID ${tournamentLeagueId}의 국제전 경기를 동기화합니다.`)) return;
    setIsSyncingTournament(true);
    try {
      const res = await fetch(`/api/cron/update-match?mode=sync_tournament&id=${encodeURIComponent(tournamentLeagueId)}`);
      const data = await res.json();
      if (data.success) alert(`✅ ${data.count}개 경기 동기화 완료! (league: ${data.leagueId})`);
      else alert(`실패: ${data.error}`);
    } catch (e: any) { alert(e.message); }
    finally { setIsSyncingTournament(false); }
  };

  const handleInspect = async () => {
    if (!inspectId) return alert("ID 입력");
    setIsInspecting(true);
    setInspectResult("Fetching...");
    try {
        const res = await fetch(`/api/cron/update-match?mode=inspect&inspectId=${inspectId}&inspectType=${inspectType}`);
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const data = await res.json();
        setInspectResult(JSON.stringify(data, null, 2));
    } catch (e: any) { setInspectResult(`Error: ${e.message}`); } 
    finally { setIsInspecting(false); }
  };

  const handleToggleStarter = async (playerId: number) => {
    if (!selectedTeam) return;
    const current = selectedTeam.starters || [];
    let next = [];
    if (current.includes(playerId)) next = current.filter((id: number) => id !== playerId);
    else {
        if (current.length >= 5) return alert("5명까지만 선택 가능합니다.");
        next = [...current, playerId];
    }
    const updatedTeam = { ...selectedTeam, starters: next };
    setSelectedTeam(updatedTeam);
    try {
        const starterNames = (selectedTeam.playerDetails || []).filter((p: any) => next.includes(p.id)).map((p: any) => `${selectedTeam.name} ${p.name}`);
        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'teams', String(selectedTeam.id)), { starters: next, roster: starterNames, updatedAt: serverTimestamp() });
    } catch(e) { alert("저장 실패"); }
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (error) { alert("로그인 실패"); }
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400 font-bold">Checking...</div>;
  if (!isAdmin) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><button onClick={handleGoogleLogin} className="bg-white p-4 rounded font-bold text-black hover:bg-slate-200">관리자 로그인</button></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 font-sans pb-40">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-end mb-10 border-b border-slate-800 pb-6">
          <div><h1 className="text-3xl font-black text-cyan-400 italic tracking-tighter">ADMIN DASHBOARD</h1><p className="text-xs text-slate-500 font-bold mt-1">Operator: {user?.email}</p></div>
          <button onClick={() => signOut(auth)} className="text-red-400 font-bold text-xs border border-red-900/50 bg-red-950/20 px-4 py-2 rounded-lg hover:bg-red-900/40 transition-colors">LOGOUT</button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-12">
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col">
                <div className="flex-1 bg-black/30 rounded-xl p-4 border border-slate-800/50">
                    <h3 className="text-[10px] font-bold text-amber-500 mb-3 uppercase flex items-center gap-2"><span>🔍 PandaScore Inspector</span>{isInspecting && <span className="animate-spin">⏳</span>}</h3>
                    <div className="flex gap-2 mb-3">
                        <select value={inspectType} onChange={e => setInspectType(e.target.value)} className="bg-slate-800 text-xs px-3 py-2 rounded-lg border border-slate-700 outline-none focus:border-cyan-500"><option value="team">Team ID</option><option value="match">Match ID</option><option value="league">League Name</option></select>
                        <input value={inspectId} onChange={e => setInspectId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInspect()} placeholder="Search ID..." className="flex-1 bg-slate-950 px-3 py-2 text-xs rounded-lg border border-slate-700 outline-none focus:border-cyan-500" />
                        <button onClick={handleInspect} disabled={isInspecting} className="bg-slate-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-600 hover:text-white transition-colors">GO</button>
                    </div>
                    <pre className="bg-slate-950 p-3 rounded-lg text-[10px] text-green-400 h-40 overflow-auto font-mono border border-slate-800/50 no-scrollbar">{inspectResult || '// Result will appear here...'}</pre>
                </div>
                <div className="mt-3 bg-black/30 rounded-xl p-4 border border-slate-800/50">
                    <h3 className="text-[10px] font-bold text-purple-400 mb-3 uppercase">🌏 Sync Tournament (국제전 과거 경기)</h3>
                    <div className="flex gap-2">
                        <input value={tournamentLeagueId} onChange={e => setTournamentLeagueId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSyncTournament()} placeholder="League ID (e.g. 5 for Worlds)" className="flex-1 bg-slate-950 px-3 py-2 text-xs rounded-lg border border-slate-700 outline-none focus:border-purple-500" />
                        <button onClick={handleSyncTournament} disabled={isSyncingTournament} className="bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors">{isSyncingTournament ? '...' : 'SYNC'}</button>
                    </div>
                    <p className="text-[9px] text-slate-600 mt-2">Inspector에서 League Name 검색 후 league_id 확인 → 여기서 동기화</p>
                </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl flex flex-col gap-3 justify-center">
                {/* ⭐ 버튼 변경됨 */}
                <button onClick={handleSyncMatches} disabled={isSyncing} className="bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-black text-xs uppercase transition-all shadow-lg flex items-center justify-center gap-2">
                    {isSyncing ? 'Syncing...' : '🎮 Sync Match Data (Results & Games)'}
                </button>
                <div className="text-[10px] text-slate-500 text-center px-4">
                    PandaScore에서 경기 결과와 세트(Game) 정보를 동기화합니다.<br/>(Home: 도파민 지수 / Detail: 세트별 평점용)
                </div>
            </div>
        </div>

        <div className="grid md:grid-cols-12 gap-8 h-[650px]">
            <div className="md:col-span-4 bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col h-full">
                <h3 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest">Team Management</h3>
                <div className="flex gap-2 mb-4">
                    <input value={syncInput} onChange={e => setSyncInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSyncTeam(syncInput)} placeholder="Team ID (from Inspector)" className="flex-1 bg-slate-950 px-3 py-2 rounded-lg border border-slate-700 text-xs outline-none focus:border-cyan-500" />
                    <button onClick={() => handleSyncTeam(syncInput)} disabled={isSyncing} className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 rounded-lg font-bold text-xs transition-colors">{isSyncing ? '...' : 'Add'}</button>
                </div>
                <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                    {teams.map(t => (
                        <div key={t.id} onClick={() => setSelectedTeam(t)} className={`p-3 rounded-xl border cursor-pointer flex items-center gap-3 transition-all group relative ${selectedTeam?.id === t.id ? 'bg-cyan-950/40 border-cyan-500/50' : 'bg-slate-950/50 border-slate-800 hover:border-slate-600'}`}>
                            <div className="w-8 h-8 rounded-lg bg-black/20 p-1 flex items-center justify-center">{t.logo ? <img src={t.logo} className="w-full h-full object-contain" /> : <span className="text-[8px] text-slate-600">NO</span>}</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2"><div className={`font-bold text-sm ${selectedTeam?.id === t.id ? 'text-cyan-400' : 'text-slate-300'}`}>{t.name}</div><span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">{t.year || '2026'}</span></div>
                                <div className="text-[10px] text-slate-500">{t.acronym} • {t.playerDetails?.length || 0} Players</div>
                            </div>
                            {t.starters?.length === 5 && <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>}
                            <button onClick={(e) => handleDeleteTeam(e, t.id, t.name)} className="absolute right-2 top-2 p-1.5 text-slate-600 hover:text-red-500 hover:bg-red-950/30 rounded-lg transition-all" title="Delete Team"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
                        </div>
                    ))}
                    {teams.length === 0 && <div className="text-center text-slate-600 text-xs py-10">No teams found. Use Inspector & Add by ID.</div>}
                </div>
            </div>
            <div className="md:col-span-8 h-full">
                {selectedTeam ? (
                    <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl h-full flex flex-col relative overflow-hidden">
                        <img src={selectedTeam.logo} className="absolute -bottom-10 -right-10 w-96 h-96 opacity-[0.03] grayscale pointer-events-none" />
                        <div className="flex justify-between items-start mb-8 z-10">
                            <div className="flex items-center gap-5"><div className="w-20 h-20 bg-slate-950 rounded-2xl p-4 border border-slate-800 shadow-xl"><img src={selectedTeam.logo} className="w-full h-full object-contain" /></div><div><h2 className="text-4xl font-black italic uppercase leading-none tracking-tighter text-white">{selectedTeam.name}</h2><div className="flex items-center gap-2 mt-2"><span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase">{selectedTeam.acronym}</span><span className="text-slate-600 text-[10px] font-bold">•</span><span className="text-cyan-500 text-[10px] font-bold uppercase">{selectedTeam.year || '2026'} Season</span></div></div></div>
                            <div className="text-right"><div className="text-3xl font-black text-cyan-400">{selectedTeam.starters?.length || 0}<span className="text-slate-600 text-lg">/5</span></div><div className="text-[9px] font-bold text-slate-500 uppercase">Starters Selected</div></div>
                        </div>
                        <div className="flex-1 overflow-y-auto z-10 pr-2 custom-scrollbar">
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                {selectedTeam.playerDetails?.map((p: any) => {
                                    const isStarter = selectedTeam.starters?.includes(p.id);
                                    return (
                                        <div key={p.id} onClick={() => handleToggleStarter(p.id)} className={`group relative flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${isStarter ? 'bg-cyan-950/30 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]' : 'bg-slate-950/50 border-slate-800 hover:border-slate-600 hover:bg-slate-800/50'}`}>
                                            <div className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 border ${isStarter ? 'border-cyan-500/30' : 'border-slate-800 group-hover:border-slate-600'}`}>{p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-slate-900 text-[8px] text-slate-600 font-bold">NO IMG</div>}</div>
                                            <div className="min-w-0 flex-1"><div className={`text-[9px] font-bold uppercase mb-0.5 ${isStarter ? 'text-cyan-400' : 'text-slate-500'}`}>{p.role || 'Player'}</div><div className={`font-bold text-sm truncate ${isStarter ? 'text-white' : 'text-slate-400'}`}>{p.name}</div></div>
                                            {isStarter && <div className="absolute top-3 right-3 w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_cyan]"></div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : <div className="h-full border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-600 gap-4 bg-slate-900/20"><div className="text-6xl opacity-20 grayscale">🛡️</div><div className="font-bold uppercase tracking-widest text-xs">Select a team from the list</div></div>}
            </div>
        </div>
      </div>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}