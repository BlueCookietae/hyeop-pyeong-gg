'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoginButton from '@/components/LoginButton';
import { db, auth } from '@/lib/firebase';
import { collection, query, getDocs, where, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import Footer from '@/components/Footer';

const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];
const FUN_KEY = 'match_fun_score'; 

const POS_ICONS: Record<string, string> = {
  'TOP': '/icons/top.png',
  'JGL': '/icons/jungle.png',
  'MID': '/icons/middle.png',
  'ADC': '/icons/bottom.png',
  'SUP': '/icons/support.png'
};

// ⭐ props로 서버에서 가져온 초기 데이터를 받습니다.
export default function HomeView({ initialMatches, initialRosters }: { initialMatches: any[], initialRosters: any }) {
  // 이미 데이터가 있으므로 초기값으로 설정
  const [allMatches, setAllMatches] = useState<any[]>(initialMatches);
  const [teamRosters, setTeamRosters] = useState<Record<string, string[]>>(initialRosters);
  
  const [currentTab, setCurrentTab] = useState(1);
  const TAB_NAMES = ['지난 경기', '오늘의 경기', '다가오는 경기'];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ⭐ 데이터 Fetching useEffect 삭제됨 (서버에서 해줌)

  const getFilteredMatches = () => {
    const kstToday = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"})).toISOString().split('T')[0];
    if (currentTab === 0) return allMatches.filter(m => m.date.split(' ')[0] < kstToday).sort((a, b) => b.date.localeCompare(a.date));
    else if (currentTab === 1) return allMatches.filter(m => m.date.split(' ')[0] === kstToday).sort((a, b) => a.date.localeCompare(b.date));
    else return allMatches.filter(m => m.date.split(' ')[0] > kstToday).sort((a, b) => a.date.localeCompare(b.date));
  };

  const displayMatches = getFilteredMatches();
  useEffect(() => { setExpandedId(null); }, [currentTab]);

  return (
    <div className="bg-slate-950 min-h-screen text-slate-50 font-sans p-4 overflow-x-hidden">
      <div className="max-w-md mx-auto pb-20">
        <header className="py-8 flex flex-col items-center gap-2">
          <LoginButton />
          <h1 className="text-3xl font-black text-cyan-400 italic tracking-tighter uppercase">협곡평점.GG</h1>
        </header>

        <div className="flex items-center justify-between mb-8 px-2">
          <button onClick={() => setCurrentTab(p => Math.max(0, p - 1))} disabled={currentTab === 0} className={`text-2xl font-black ${currentTab===0?'text-slate-800':'text-cyan-400'}`}>←</button>
          <div className="flex flex-col items-center">
            <span className="text-xl font-black text-white italic tracking-tighter uppercase">{TAB_NAMES[currentTab]}</span>
            <div className="flex gap-1 mt-1">{[0, 1, 2].map(i => <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === currentTab ? 'bg-cyan-400' : 'bg-slate-800'}`} />)}</div>
          </div>
          <button onClick={() => setCurrentTab(p => Math.min(2, p + 1))} disabled={currentTab === 2} className={`text-2xl font-black ${currentTab===2?'text-slate-800':'text-cyan-400'}`}>→</button>
        </div>

        <div className="min-h-[50vh]">
          <AnimatePresence mode='wait'>
            <motion.div key={currentTab} initial={{ x: 10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -10, opacity: 0 }} className="space-y-6">
              {displayMatches.length === 0 ? (
                <div className="text-center text-slate-600 font-bold py-20 bg-slate-900/30 rounded-3xl border border-slate-800 border-dashed">경기가 없습니다.</div>
              ) : (
                displayMatches.map((match) => (
                  <MatchCard 
                    key={match.id} 
                    match={match} 
                    homeRoster={teamRosters[match.home.name] || POSITIONS.map(p => `${match.home.name} ${p}`)}
                    awayRoster={teamRosters[match.away.name] || POSITIONS.map(p => `${match.away.name} ${p}`)}
                    isOpen={expandedId === match.id}
                    onToggle={() => setExpandedId(expandedId === match.id ? null : match.id)}
                  />
                ))
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <Footer />
      </div>
    </div>
  );
}

function MatchCard({ match, homeRoster, awayRoster, isOpen, onToggle }: any) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [averages, setAverages] = useState<Record<string, number>>({});
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [showTooltip, setShowTooltip] = useState(false);
  
  const isStarted = new Date() >= new Date(match.date.replace(' ', 'T'));
  const isFinished = match.status === 'FINISHED';
  const homeScore = match.home.score || 0;
  const awayScore = match.away.score || 0;
  const isHomeWin = isFinished && homeScore > awayScore;
  const isAwayWin = isFinished && awayScore > homeScore;

  // ⭐ 팀별 테마 결정 (승리:red, 패배:blue, 미정:slate)
  const homeTheme = !isFinished ? 'slate' : (isHomeWin ? 'red' : 'blue');
  const awayTheme = !isFinished ? 'slate' : (isAwayWin ? 'red' : 'blue');

  const checkIsTomorrow = () => {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const KST_OFFSET = 9 * 60 * 60 * 1000;
    const kstNow = new Date(utc + KST_OFFSET);
    const kstTomorrow = new Date(kstNow);
    kstTomorrow.setDate(kstNow.getDate() + 1);
    const year = kstTomorrow.getFullYear();
    const month = String(kstTomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(kstTomorrow.getDate()).padStart(2, '0');
    const tomorrowStr = `${year}-${month}-${day}`;
    return match.date.startsWith(tomorrowStr);
  };
  const isTomorrow = checkIsTomorrow();

  useEffect(() => {
    if (isOpen) { fetchAverages(); } 
    else { setIsEditing(false); setShowTooltip(false); }
  }, [isOpen]);

  const fetchAverages = async (forceReload = false) => {
    if (!forceReload && Object.keys(averages).length > 0) return;
    const q = query(collection(db, "matchRatings"), where("matchId", "==", match.id));
    const snapshot = await getDocs(q);
    const stats: Record<string, { sum: number; count: number }> = {};
    snapshot.forEach((doc) => {
      const r = doc.data().ratings;
      if (!r) return;
      Object.entries(r).forEach(([name, data]: any) => {
        if (!stats[name]) stats[name] = { sum: 0, count: 0 };
        stats[name].sum += data.score;
        stats[name].count += 1;
      });
    });
    const calculated: Record<string, number> = {};
    for (const [name, stat] of Object.entries(stats)) calculated[name] = stat.sum / stat.count;
    setAverages(calculated);
  };

  const fetchMyRatings = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const docId = `${user.uid}_${match.id}`;
    const snap = await getDoc(doc(db, "matchRatings", docId));
    if (snap.exists()) {
      const saved = snap.data().ratings;
      const parsed: Record<string, number> = {};
      Object.entries(saved).forEach(([name, val]: any) => parsed[name] = val.score);
      setMyRatings(parsed);
    } else {
      const initial: Record<string, number> = {};
      [...homeRoster, ...awayRoster].forEach(p => initial[p] = 0);
      initial[FUN_KEY] = 0; 
      setMyRatings(initial);
    }
  };

  const handleCardClick = () => {
    if (!isEditing) onToggle();
  };

  const handleStartEdit = async (e: any) => {
    e.stopPropagation();
    if (!auth.currentUser) return alert("로그인이 필요한 서비스입니다.");
    await fetchMyRatings();
    setIsEditing(true);
  };

  const handleSubmit = async (e: any) => {
    e.stopPropagation();
    if (!window.confirm("이 점수로 제출하시겠습니까?")) return;
    const user = auth.currentUser;
    if (!user) return;
    const submitData: Record<string, any> = {};
    Object.entries(myRatings).forEach(([name, score]) => { submitData[name] = { score, comment: "" }; });
    try {
      const docId = `${user.uid}_${match.id}`;
      await setDoc(doc(db, "matchRatings", docId), {
        userId: user.uid, matchId: match.id, matchInfo: `${match.home.name} vs ${match.away.name}`, ratings: submitData, createdAt: serverTimestamp(),
      });
      alert("평점이 반영되었습니다!");
      setIsEditing(false);
      await fetchAverages(true); 
    } catch (e) { alert("제출 실패"); }
  };

  const handleRatingChange = (name: string, val: number) => {
    setMyRatings(prev => ({ ...prev, [name]: val }));
  };

  const formattedDate = match.date.substring(5, 10).replace('-', '.'); 
  const timeStr = match.date.split(' ')[1];
  const funScore = isEditing ? (myRatings[FUN_KEY] ?? 0) : (averages[FUN_KEY] ?? 0);

  return (
    <div onClick={handleCardClick} className={`border rounded-[2.5rem] overflow-hidden shadow-2xl relative transition-all duration-500 cursor-pointer ${isEditing ? 'bg-indigo-950/40 border-indigo-500/50 shadow-indigo-500/10' : 'bg-slate-900 border-slate-800 hover:bg-slate-800/80'}`}>
      <div className="absolute top-0 inset-x-0 flex justify-center -mt-0.5 z-10">
        <div className={`px-4 py-1.5 rounded-b-xl border-b border-x shadow-lg ${isEditing ? 'bg-indigo-900 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-cyan-400'}`}>
          <span className="text-[10px] font-black tracking-widest uppercase">{match.league} • {match.round}</span>
        </div>
      </div>

      <div className="p-8 pt-12 pb-4 text-center">
        <div className="flex justify-between items-start">
          
          {/* HOME TEAM */}
          <div className="flex-1 flex flex-col items-center gap-1">
            <div className="h-6 mb-1 flex items-end">
              {isFinished && (
                <span className={`px-2 py-0.5 rounded text-[9px] font-black ${isHomeWin ? 'bg-red-500 text-white shadow-red-500/50' : 'bg-blue-500 text-white shadow-blue-500/50'}`}>
                  {isHomeWin ? 'WIN' : 'LOSE'}
                </span>
              )}
            </div>
            <div className="w-16 h-16 flex items-center justify-center">
              {match.home.logo ? (
                <img src={match.home.logo} className="w-full h-full object-contain drop-shadow-xl" />
              ) : (
                <span className="text-2xl font-black text-slate-500">{match.home.name.substring(0, 2)}</span>
              )}
            </div>
            <div className="h-10 flex items-center justify-center">
              <span className="text-sm font-bold text-white leading-tight uppercase px-1">{match.home.name}</span>
            </div>
          </div>

          {/* CENTER INFO */}
          <div className="px-2 pt-8 flex flex-col items-center">
            {isTomorrow && <span className="bg-amber-400 text-black text-[9px] font-black px-1.5 py-0.5 rounded mb-1 animate-pulse">내일</span>}
            <span className="text-[10px] text-slate-500 font-bold mb-2 tracking-widest">{formattedDate} {timeStr}</span>
            {match.status === 'FINISHED' ? (
              <div className="text-3xl font-black italic text-white tracking-tighter drop-shadow-lg">{match.home.score} : {match.away.score}</div>
            ) : (
              <div className="text-xl font-black italic text-slate-600 bg-slate-800 px-3 py-1 rounded-lg">VS</div>
            )}
          </div>

          {/* AWAY TEAM */}
          <div className="flex-1 flex flex-col items-center gap-1">
             <div className="h-6 mb-1 flex items-end">
               {isFinished && (
                 <span className={`px-2 py-0.5 rounded text-[9px] font-black ${isAwayWin ? 'bg-red-500 text-white shadow-red-500/50' : 'bg-blue-500 text-white shadow-blue-500/50'}`}>
                   {isAwayWin ? 'WIN' : 'LOSE'}
                 </span>
              )}
            </div>
            <div className="w-16 h-16 flex items-center justify-center">
              {match.away.logo ? (
                <img src={match.away.logo} className="w-full h-full object-contain drop-shadow-xl" />
              ) : (
                <span className="text-2xl font-black text-slate-500">{match.away.name.substring(0, 2)}</span>
              )}
            </div>
            <div className="h-10 flex items-center justify-center">
              <span className="text-sm font-bold text-white leading-tight uppercase px-1">{match.away.name}</span>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} layout className={`overflow-hidden mx-4 mb-4 rounded-xl border-y transition-colors duration-500 cursor-default ${isEditing ? 'bg-black/20 border-indigo-500/30' : 'bg-slate-950/30 border-slate-800/50'}`} onClick={(e) => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              
              {/* 선수 평점 리스트 */}
              {POSITIONS.map((pos, idx) => {
                const hp = homeRoster[idx];
                const ap = awayRoster[idx];
                const hScore = isEditing ? (myRatings[hp] ?? 0) : (averages[hp] ?? 0);
                const aScore = isEditing ? (myRatings[ap] ?? 0) : (averages[ap] ?? 0);
                return (
                  <div key={pos} className="flex flex-col gap-1">
                    <div className="flex justify-between px-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                      <span className="truncate w-20">{hp.split(' ').slice(1).join(' ')}</span>
                      <span className="truncate w-20 text-right">{ap.split(' ').slice(1).join(' ')}</span>
                    </div>
                    <motion.div layout className="flex items-center gap-3 h-8 relative">
                      {isEditing ? <InteractiveBar score={hScore} align="left" color="cyan" onChange={(v:number) => handleRatingChange(hp, v)} /> : <ResultBar score={hScore} align="left" theme={homeTheme} />}
                      <div className="w-6 flex justify-center opacity-60">
                         <img src={POS_ICONS[pos]} alt={pos} className="w-4 h-4 object-contain" />
                      </div>
                      {isEditing ? <InteractiveBar score={aScore} align="right" color="red" onChange={(v:number) => handleRatingChange(ap, v)} /> : <ResultBar score={aScore} align="right" theme={awayTheme} />}
                    </motion.div>
                  </div>
                );
              })}

              {/* 도파민 지수 */}
              <div className="pt-2 pb-2">
                <div className="flex flex-col items-center gap-1">
                   <div className="flex items-center gap-2">
                     <span className="text-xs font-black text-amber-400 tracking-wider">⚡ 도파민 지수</span>
                     <span className="text-sm font-black text-amber-300 italic">{(funScore/2).toFixed(1)} <span className="text-[10px] text-slate-500 not-italic">/ 5.0</span></span>
                     <button onClick={() => setShowTooltip(!showTooltip)} className="w-4 h-4 rounded-full border border-slate-600 text-slate-500 text-[9px] flex items-center justify-center hover:bg-slate-700 hover:text-white transition-colors">?</button>
                   </div>
                   <AnimatePresence>
                    {showTooltip && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                         <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 mt-2 text-[10px] text-slate-300 leading-relaxed text-center mx-4 mb-2">
                            내가 응원하는 팀의 성패나 경기력과는 관계없이,<br/><span className="text-amber-400 font-bold">오직 순수 재미</span>를 기준으로 주는 평점이에요.
                         </div>
                      </motion.div>
                    )}
                   </AnimatePresence>
                   <DopamineRating score={funScore} isEditing={isEditing} onChange={(v:number) => handleRatingChange(FUN_KEY, v)} />
                </div>
              </div>
              
              <motion.div layout className="pt-2 space-y-3">
                {isEditing ? (
                  <div className="flex gap-3">
                    <button onClick={(e) => { e.stopPropagation(); setIsEditing(false); }} className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl font-bold text-xs hover:bg-slate-700 transition-colors">취소</button>
                    <button onClick={handleSubmit} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-500 shadow-lg shadow-indigo-500/30 transition-all">제출 완료!</button>
                  </div>
                ) : (
                  !isStarted ? (
                    <button disabled className="w-full py-4 bg-slate-900/50 border border-slate-800 text-slate-600 rounded-xl font-bold text-[10px] cursor-not-allowed flex items-center justify-center gap-2">
                       <span className="text-base">🔒</span><span>아직 경기가 시작되지 않았어요</span>
                    </button>
                  ) : (
                    <div className="flex gap-3">
                      <button onClick={handleStartEdit} className="flex-1 py-3 bg-gradient-to-r from-slate-800 to-slate-800 hover:from-cyan-900 hover:to-blue-900 border border-slate-700 text-white rounded-xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all tracking-tight flex items-center justify-center gap-1">
                         <span>🫠​</span> 내 평점 등록하기
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); router.push(`/match/${match.id}`); }} className="flex-1 py-3 bg-slate-800 text-slate-400 hover:text-white border border-slate-700/50 rounded-xl font-bold text-[10px] uppercase transition-all flex items-center justify-center gap-1">
                        <span>💬</span> 한줄평 보기
                      </button>
                    </div>
                  )
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!isOpen && (
        <div className="pb-6 text-center">
           <span className="text-[10px] font-bold text-slate-600 animate-pulse">▼ 터치해서 평점 보기</span>
        </div>
      )}
    </div>
  );
}

function DopamineRating({ score, isEditing, onChange }: any) {
  const starScore = score / 2; 
  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((idx) => (
          <div key={idx} className="relative w-6 h-6 cursor-pointer group">
            <svg viewBox="0 0 24 24" className="w-full h-full text-slate-800 fill-current"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
            {starScore >= idx && <svg viewBox="0 0 24 24" className="absolute top-0 left-0 w-full h-full text-amber-400 fill-current drop-shadow-sm"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>}
            {starScore >= idx - 0.5 && starScore < idx && <div className="absolute top-0 left-0 w-1/2 h-full overflow-hidden"><svg viewBox="0 0 24 24" className="w-6 h-6 text-amber-400 fill-current drop-shadow-sm"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div>}
            {isEditing && <div className="absolute inset-0 flex"><div className="w-1/2 h-full z-10" onClick={() => onChange((idx - 1) * 2 + 1)}></div><div className="w-1/2 h-full z-10" onClick={() => onChange(idx * 2)}></div></div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultBar({ score, align, theme }: any) {
  const hasData = score > 0;
  let bgClass = 'bg-slate-600';
  let textBgClass = 'bg-slate-700';
  if (theme === 'red') { bgClass = 'bg-red-500'; textBgClass = 'bg-red-500'; } 
  else if (theme === 'blue') { bgClass = 'bg-blue-500'; textBgClass = 'bg-blue-600'; }

  return (
    <div className={`flex-1 flex items-center gap-2 ${align === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
      <div className={`flex-1 h-2 bg-slate-800 rounded-full overflow-hidden flex ${align === 'left' ? 'justify-start' : 'justify-end'}`}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${hasData ? score * 10 : 0}%` }} transition={{ duration: 1, ease: "easeOut" }} className={`h-full ${hasData ? bgClass : 'bg-transparent'}`} />
      </div>
      <div className={`w-10 h-6 flex items-center justify-center rounded-md ${hasData ? textBgClass : 'bg-slate-800'} shadow-md`}>
         <span className={`text-[11px] font-bold ${hasData ? 'text-white' : 'text-slate-500'}`}>{hasData ? score.toFixed(1) : '-'}</span>
      </div>
    </div>
  );
}

function InteractiveBar({ score, align, color, onChange }: any) {
  const barColor = color === 'cyan' ? 'bg-cyan-400' : 'bg-red-400';
  const textColor = color === 'cyan' ? 'text-cyan-300' : 'text-red-300';
  const rotationClass = align === 'right' ? 'rotate-180' : ''; 
  return (
    <div className={`flex-1 flex items-center gap-2 ${align === 'left' ? 'flex-row' : 'flex-row-reverse'} relative group`}>
      <div className={`flex-1 h-4 bg-slate-800 rounded-full overflow-hidden relative flex ${align === 'left' ? 'justify-start' : 'justify-end'}`}>
        <div style={{ width: `${score * 10}%` }} className={`h-full ${barColor} transition-all duration-75`} />
        <input type="range" min="0" max="10" step="0.1" value={score} onChange={(e) => onChange(parseFloat(e.target.value))} className={`absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10 ${rotationClass}`} />
      </div>
      <div className={`w-8 text-right font-black italic ${textColor} text-xs group-hover:scale-110 transition-transform`}>{score.toFixed(1)}</div>
    </div>
  );
}