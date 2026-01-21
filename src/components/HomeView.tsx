'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation'; 
import LoginButton from '@/components/LoginButton';
import { db, auth } from '@/lib/firebase';
import { collection, query, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import Footer from '@/components/Footer';
import * as htmlToImage from 'html-to-image'; 
import Link from 'next/link';

const APP_ID = 'lck-2026-app';
const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];
const FUN_KEY = 'match_fun_score'; 

const POS_ICONS: Record<string, string> = {
  'TOP': '/icons/top.png', 'JGL': '/icons/jungle.png', 'MID': '/icons/middle.png', 'ADC': '/icons/bottom.png', 'SUP': '/icons/support.png'
};

// ... Utility functions ...
const dataURItoBlob = (dataURI: string) => {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: mimeString });
};

const urlToBase64 = async (url: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (e) { return null; }
};

// ⭐ [핵심 수정] 무조건 한국 시간(KST) 기준 날짜 문자열(YYYY-MM-DD) 반환
const getKSTDateString = (dateInput?: string | Date) => {
  const date = dateInput ? new Date(dateInput) : new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

const animateScrollTo = (to: number, duration: number = 800) => {
  const start = window.scrollY;
  const change = to - start;
  const startTime = performance.now();
  const easeOutQuart = (t: number, b: number, c: number, d: number) => { t /= d; t--; return -c * (t * t * t * t - 1) + b; };
  const animateScroll = (currentTime: number) => {
    const timeElapsed = currentTime - startTime;
    if (timeElapsed < duration) {
      window.scrollTo(0, easeOutQuart(timeElapsed, start, change, duration));
      requestAnimationFrame(animateScroll);
    } else window.scrollTo(0, to);
  };
  requestAnimationFrame(animateScroll);
};

export default function HomeView({ initialMatches, initialRosters }: { initialMatches: any[], initialRosters: any }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [allMatches, setAllMatches] = useState<any[]>(initialMatches || []);
  const [currentTab, setCurrentTab] = useState(1);
  const TAB_NAMES = ['지난 경기', '오늘의 경기', '다가오는 경기'];
  
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  
  const targetId = searchParams.get('expanded');
  const focusId = searchParams.get('focus'); 
  
  const [isRestoring, setIsRestoring] = useState(!!targetId || !!focusId);
  const [isScrolled, setIsScrolled] = useState(false);
  const isHeaderCompact = isScrolled || expandedIds.length > 0;

  useEffect(() => {
      if (initialMatches) setAllMatches(initialMatches);
  }, [initialMatches]);

  useEffect(() => {
    const activeId = targetId || focusId;
    if (!activeId) { setIsRestoring(false); return; }
    if (allMatches.length === 0) return;

    const targetMatch = allMatches.find(m => String(m.id) === String(activeId));
    
    if (targetMatch) {
        // ⭐ KST 함수 사용하여 비교
        const kstToday = getKSTDateString();
        const matchDateKST = getKSTDateString(targetMatch.date);
        
        if (matchDateKST < kstToday) setCurrentTab(0);
        else if (matchDateKST === kstToday) setCurrentTab(1);
        else setCurrentTab(2);
        
        if (targetId) setExpandedIds(prev => prev.includes(targetId) ? prev : [...prev, targetId]);
    } else {
        setIsRestoring(false);
    }
    const safetyTimer = setTimeout(() => setIsRestoring(false), 2000);
    return () => clearTimeout(safetyTimer);
  }, [targetId, focusId, allMatches]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 0);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const changeTab = (newTab: number) => {
    if (newTab < 0 || newTab > 2) return;
    setCurrentTab(newTab);
    setExpandedIds([]); 
    window.scrollTo({ top: 0, behavior: 'auto' });
    router.replace('/', { scroll: false });
  };

  const toggleCard = (matchId: string, isOpenNow: boolean) => {
    if (isOpenNow) {
        setExpandedIds(prev => prev.filter(id => id !== matchId));
        router.replace('/', { scroll: false }); 
    } else {
        setLastClickedId(matchId);
        setExpandedIds(prev => [...prev, matchId]);
        router.replace(`/?expanded=${matchId}`, { scroll: false });
    }
  };

  const handleStatsUpdate = (matchId: string, newStats: any) => {
      setAllMatches(prev => prev.map(m => String(m.id) === String(matchId) ? { ...m, stats: newStats } : m));
  };

  // ⭐ 필터링 로직에 KST 적용
  const getFilteredMatches = () => {
    const safeMatches = Array.isArray(allMatches) ? allMatches : []; 
    const kstToday = getKSTDateString(); // "2026-01-22"
    
    const filterFn = (m: any) => {
        const mDate = getKSTDateString(m.date);
        if (currentTab === 0) return mDate < kstToday;
        if (currentTab === 1) return mDate === kstToday;
        return mDate > kstToday;
    };

    const sortFn = (a: any, b: any) => {
        return currentTab === 0 
            ? b.date.localeCompare(a.date) 
            : a.date.localeCompare(b.date);
    };

    return safeMatches.filter(filterFn).sort(sortFn);
  };
  const displayMatches = getFilteredMatches();

  return (
    <div className="bg-slate-950 min-h-screen text-slate-50 font-sans pb-20">
      {/* 헤더 */}
      <div className={`sticky top-0 z-40 transition-all duration-300 border-b border-slate-800/50 ${isHeaderCompact ? 'bg-slate-950/95 backdrop-blur-md shadow-lg h-[74px]' : 'bg-slate-950 h-28'}`}>
        <div className="max-w-md mx-auto h-full flex flex-col justify-between">
          <header className={`flex items-center justify-between px-5 transition-all duration-300 ${isHeaderCompact ? 'pt-2' : 'pt-4'}`}>
            <div className={`origin-left transition-transform duration-300 ${isHeaderCompact ? 'scale-75' : 'scale-100'}`}>
               <h1 className="font-black text-cyan-400 italic tracking-tighter uppercase text-2xl">협곡평점.GG</h1>
            </div>
            <div className={`flex-shrink-0 transition-transform duration-300 ${isHeaderCompact ? 'scale-75 origin-right' : 'scale-90 origin-right'}`}>
              <LoginButton compact={isHeaderCompact} />
            </div>
          </header>
          <div className={`flex items-center justify-between px-4 transition-all duration-300 ${isHeaderCompact ? 'pb-2' : 'pb-2'}`}>
            <button onClick={() => changeTab(currentTab - 1)} disabled={currentTab === 0} className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${currentTab === 0 ? 'text-slate-800' : 'text-cyan-400 hover:bg-slate-800'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <div className="flex flex-col items-center">
              <div className={`overflow-hidden transition-all duration-300 ${isHeaderCompact ? 'h-0 opacity-0' : 'h-7 opacity-100'}`}>
                <span className="text-base font-black text-white italic tracking-tighter uppercase">{TAB_NAMES[currentTab]}</span>
              </div>
              <div className={`flex gap-1.5 transition-all duration-300 ${isHeaderCompact ? 'mt-0' : 'mt-1'}`}>
                {[0, 1, 2].map(i => (<motion.div key={i} animate={{ backgroundColor: i === currentTab ? '#22d3ee' : '#334155', scale: i === currentTab ? 1.2 : 1 }} className="w-1.5 h-1.5 rounded-full" />))}
              </div>
            </div>
            <button onClick={() => changeTab(currentTab + 1)} disabled={currentTab === 2} className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${currentTab === 2 ? 'text-slate-800' : 'text-cyan-400 hover:bg-slate-800'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* 리스트 */}
      <div className="max-w-md mx-auto p-4 min-h-[50vh]">
        <AnimatePresence mode='wait'>
          <motion.div 
            key={currentTab} 
            initial={{ x: 20, opacity: 0 }} 
            animate={{ x: 0, opacity: isRestoring ? 0 : 1 }} 
            exit={{ x: -20, opacity: 0 }} 
            transition={{ duration: 0.3 }} 
            className="space-y-6"
          >
            {displayMatches.length === 0 ? (
              <div className="text-center text-slate-600 font-bold py-20 bg-slate-900/30 rounded-3xl border border-slate-800 border-dashed">
                {isRestoring ? '경기 정보를 불러오는 중...' : '예정된 경기가 없습니다.'}
              </div>
            ) : (
              displayMatches.map((match) => (
                <MatchCard 
                  key={match.id} 
                  match={match} 
                  rosters={initialRosters}
                  isOpen={expandedIds.includes(String(match.id))}
                  isTarget={String(targetId) === String(match.id)}
                  isFocused={String(focusId) === String(match.id)}
                  isClicked={String(lastClickedId) === String(match.id)}
                  lastClickedId={lastClickedId}
                  onToggle={(isOpenNow: boolean) => toggleCard(String(match.id), isOpenNow)}
                  onRestoreComplete={() => setIsRestoring(false)}
                  onStatsUpdate={handleStatsUpdate}
                />
              ))
            )}
          </motion.div>
        </AnimatePresence>
        <Footer />
      </div>
    </div>
  );
}

function MatchCard({ match, rosters, isOpen, isTarget, isClicked, isFocused, lastClickedId, onToggle, onRestoreComplete, onStatsUpdate }: any) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const [isEditing, setIsEditing] = useState(false);
  const [hasParticipated, setHasParticipated] = useState(false); 
  const [activeGameId, setActiveGameId] = useState<string>('ALL');
  
  const [myRatings, setMyRatings] = useState<any>({ games: {}, [FUN_KEY]: 0 });
  const currentStats = match.stats || {};

  const [teamLogos, setTeamLogos] = useState({ home: '', away: '' });
  const [isImagesReady, setIsImagesReady] = useState(false);

  const homeCode = (match.home.code || match.home.name).trim();
  const awayCode = (match.away.code || match.away.name).trim();

  const games = match.games || []; 
  const sortedGames = [...games].sort((a: any, b: any) => a.position - b.position);

  const getPlayerName = (teamId: number, pos: string) => {
    const roster = rosters[teamId] || {};
    return roster[pos] || 'SUB';
  };

  // ⭐ [추가] Bo3 / Bo5 정보 (DB 정보 사용, 없으면 Bo3 기본)
  const boFormat = match.number_of_games ? `Bo${match.number_of_games}` : 'Bo3';

  // ⭐ [추가] 내일 경기인지 확인 (뱃지용)
  const isTomorrow = (() => {
      const todayDate = new Date(getKSTDateString());
      const tomorrow = new Date(todayDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getKSTDateString(tomorrow);
      const matchDateStr = getKSTDateString(match.date);
      return matchDateStr === tomorrowStr;
  })();

  useEffect(() => {
    if (!isOpen) return;
    const preloadLogos = async () => {
        const origin = window.location.origin;
        const [h, a] = await Promise.all([urlToBase64(`${origin}/teams/${homeCode}.png`), urlToBase64(`${origin}/teams/${awayCode}.png`)]);
        setTeamLogos({ home: (h as string) || `/teams/${homeCode}.png`, away: (a as string) || `/teams/${awayCode}.png` });
        setIsImagesReady(true);
    };
    preloadLogos();
  }, [homeCode, awayCode, isOpen]);

  useEffect(() => { if (!isOpen) { hasScrolledRef.current = false; setIsImagesReady(false); setIsEditing(false); setActiveGameId('ALL'); } }, [isOpen]);

  useEffect(() => {
    if (isOpen || isFocused) { 
      const fetchMyRatings = async () => {
        const user = auth.currentUser;
        if (!user) { setHasParticipated(false); return; }
        const docId = `${user.uid}_${match.id}`;
        const snap = await getDoc(doc(db, "matchRatings", docId));
        if (snap.exists()) {
          setHasParticipated(true);
          const data = snap.data().ratings;
          setMyRatings({ games: data.games || {}, [FUN_KEY]: data[FUN_KEY] || 0 });
        } else {
          setHasParticipated(false);
          setMyRatings({ games: {}, [FUN_KEY]: 0 });
        }
      };
      fetchMyRatings(); 
      
      if (!hasScrolledRef.current) {
          setTimeout(() => {
            if (!cardRef.current) return;
            const rect = cardRef.current.getBoundingClientRect();
            if (isClicked) animateScrollTo(rect.top + window.scrollY - 79, 800);
            else if ((isTarget || isFocused) && String(lastClickedId) !== String(match.id)) {
                window.scrollTo({ top: rect.top + window.scrollY - 79, behavior: 'auto' });
                onRestoreComplete && onRestoreComplete();
            }
            hasScrolledRef.current = true;
          }, 300);
      }
    } 
  }, [isOpen, isTarget, isClicked, isFocused, lastClickedId, match.id, onRestoreComplete]);

  // 점수 계산 로직
  const getScore = (playerName: string, isMyScore: boolean) => {
    if (isMyScore) {
        if (activeGameId === 'ALL') {
             let sum = 0, count = 0;
             Object.values(myRatings.games || {}).forEach((game: any) => {
                 const score = game[playerName]; 
                 if (score && score > 0) { sum += score; count++; }
             });
             return count > 0 ? sum / count : 0;
        } else {
             return myRatings.games?.[activeGameId]?.[playerName] || 0;
        }
    } else {
        if (activeGameId === 'ALL') {
            let sumOfAverages = 0;
            let gamesPlayed = 0;
            Object.values(currentStats.games || {}).forEach((game: any) => {
                const stat = game[playerName]; 
                if (stat && stat.count > 0) {
                    const avg = stat.sum / stat.count;
                    sumOfAverages += avg;
                    gamesPlayed++;
                }
            });
            return gamesPlayed > 0 ? sumOfAverages / gamesPlayed : 0;
        } else {
            const stat = currentStats.games?.[activeGameId]?.[playerName];
            return stat && stat.count > 0 ? stat.sum / stat.count : 0;
        }
    }
  };

  const handleRatingChange = (playerName: string, val: number) => {
      if (activeGameId === 'ALL') { alert("개별 게임 탭(Game 1, 2...)을 선택해서 평점을 입력해주세요!"); return; }
      setMyRatings((prev: any) => ({
          ...prev,
          games: {
              ...prev.games,
              [activeGameId]: {
                  ...(prev.games[activeGameId] || {}),
                  [playerName]: val
              }
          }
      }));
  };

  const handleFunScoreChange = (val: number) => {
      setMyRatings((prev: any) => ({ ...prev, [FUN_KEY]: val }));
  };

  const handleSubmit = async (e: any) => {
    e.stopPropagation();
    const user = auth.currentUser;
    if (!user) return;
    if (!window.confirm("이 점수로 제출하시겠습니까?")) return;

    try {
      const newStats = await runTransaction(db, async (transaction) => {
        const ratingRef = doc(db, "matchRatings", `${user.uid}_${match.id}`);
        const matchRef = doc(db, "artifacts", APP_ID, 'public', 'data', 'matches', String(match.id));
        
        const matchDoc = await transaction.get(matchRef);
        const ratingDoc = await transaction.get(ratingRef);
        
        const currentStats = matchDoc.exists() ? matchDoc.data()?.stats || { total: {}, games: {} } : { total: {}, games: {} };
        const oldRatings = ratingDoc.exists() ? ratingDoc.data().ratings : { games: {}, [FUN_KEY]: 0 };

        const newStats = JSON.parse(JSON.stringify(currentStats));
        if (!newStats.games) newStats.games = {};
        if (!newStats.total) newStats.total = {};
        
        Object.entries(oldRatings.games || {}).forEach(([gId, players]: any) => {
            if (!newStats.games[gId]) newStats.games[gId] = {};
            Object.entries(players).forEach(([pName, score]: any) => {
                 if (score > 0) { 
                     if (!newStats.games[gId][pName]) newStats.games[gId][pName] = { sum: 0, count: 0 };
                     newStats.games[gId][pName].sum -= score;
                     newStats.games[gId][pName].count--;
                 }
            });
        });

        Object.entries(myRatings.games || {}).forEach(([gId, players]: any) => {
            if (!newStats.games[gId]) newStats.games[gId] = {};
            Object.entries(players).forEach(([pName, score]: any) => {
                 if (score > 0) { 
                     if (!newStats.games[gId][pName]) newStats.games[gId][pName] = { sum: 0, count: 0 };
                     newStats.games[gId][pName].sum += score;
                     newStats.games[gId][pName].count++;
                 }
            });
        });
        
        const oldFun = oldRatings[FUN_KEY] || 0;
        const newFun = myRatings[FUN_KEY] || 0;
        if (!newStats.total[FUN_KEY]) newStats.total[FUN_KEY] = { sum: 0, count: 0 };
        if (oldFun > 0) { newStats.total[FUN_KEY].sum -= oldFun; newStats.total[FUN_KEY].count--; }
        if (newFun > 0) { newStats.total[FUN_KEY].sum += newFun; newStats.total[FUN_KEY].count++; }

        transaction.set(ratingRef, { userId: user.uid, matchId: match.id, ratings: myRatings, createdAt: serverTimestamp() });
        transaction.set(matchRef, { stats: newStats }, { merge: true });
        
        return newStats;
      });
      
      alert("평점이 반영되었습니다!");
      setIsEditing(false); 
      setHasParticipated(true);
      setActiveGameId('ALL');
      if (newStats) onStatsUpdate(match.id, newStats);

    } catch (e: any) { console.error(e); alert(`제출 실패: ${e.message}`); }
  };

  const handleDownload = async (e: any) => {
      e.stopPropagation();
      if (!cardRef.current || !isImagesReady) return;
      cardRef.current.classList.add('download-mode');
      try {
          await new Promise(r => setTimeout(r, 10));
          const dataUrl = await htmlToImage.toPng(cardRef.current, { backgroundColor: '#020617', pixelRatio: 3, skipAutoScale: true });
          const link = document.createElement('a'); link.download = `match_${match.id}.png`; link.href = dataUrl; link.click();
      } finally { cardRef.current.classList.remove('download-mode'); }
  };

  const funScore = isEditing ? (myRatings[FUN_KEY] ?? 0) : (currentStats.total?.[FUN_KEY] ? currentStats.total[FUN_KEY].sum / currentStats.total[FUN_KEY].count : 0);
  const isStarted = new Date() >= new Date(match.date.replace(' ', 'T'));
  const isFinished = match.status === 'FINISHED';
  const isHomeWin = isFinished && (match.home.score > match.away.score);
  const isAwayWin = isFinished && (match.away.score > match.home.score);

  return (
    <div ref={cardRef} onClick={() => { if(isStarted && !isEditing) onToggle(isOpen); }} className={`border rounded-[2.5rem] overflow-hidden shadow-2xl relative transition-all duration-500 cursor-pointer ${isEditing ? 'bg-indigo-950/40 border-indigo-500/50' : 'bg-slate-900 border-slate-800'}`}>
      <style jsx global>{`.download-mode .hide-on-download { display: none !important; }`}</style>
      
      <div className="absolute top-0 inset-x-0 flex justify-center -mt-0.5 z-10">
        {/* ⭐ [수정] 리그 정보 + Bo3 + 내일 뱃지 */}
        <div className={`px-4 py-1.5 rounded-b-xl border-b border-x shadow-lg flex items-center gap-2 ${isEditing ? 'bg-indigo-900 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-cyan-400'}`}>
          <span className="text-[10px] font-black tracking-widest uppercase">{match.league} • {match.round} • {boFormat}</span>
          {isTomorrow && <span className="text-[9px] bg-amber-500 text-black px-1.5 rounded font-bold animate-pulse">TOMORROW</span>}
        </div>
      </div>

      <div className="p-8 pt-12 pb-4 text-center">
        {/* ... (기존과 동일) ... */}
        <div className="flex justify-between items-start">
          <div className="flex-1 flex flex-col items-center gap-1">
            <div className="h-6 mb-2 flex items-center justify-center">{isFinished && <span className={`px-2 py-0.5 rounded text-[9px] font-black ${isHomeWin ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>{isHomeWin ? 'WIN' : 'LOSE'}</span>}</div>
            <div className="w-16 h-16"><img src={isImagesReady ? teamLogos.home : `/teams/${homeCode}.png`} className={`w-full h-full object-contain drop-shadow-xl ${isImagesReady ? 'opacity-100' : 'opacity-50'}`} /></div>
            <motion.div animate={{ height: isOpen ? 0 : 'auto', opacity: isOpen ? 0 : 1 }} className="h-10 flex items-center justify-center mt-2"><span className="text-lg font-black text-white uppercase tracking-tighter">{homeCode}</span></motion.div>
          </div>
          <div className="px-2 pt-8 flex flex-col items-center">
            <span className="text-[10px] text-slate-500 font-bold mb-2 tracking-widest">{match.date.substring(5, 16).replace('-', '.')}</span>
            {isFinished ? <div className="text-3xl font-black italic text-white tracking-tighter drop-shadow-lg">{match.home.score} : {match.away.score}</div> : <div className="text-xl font-black italic text-slate-600 bg-slate-800 px-3 py-1 rounded-lg">VS</div>}
          </div>
          <div className="flex-1 flex flex-col items-center gap-1">
            <div className="h-6 mb-2 flex items-center justify-center">{isFinished && <span className={`px-2 py-0.5 rounded text-[9px] font-black ${isAwayWin ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>{isAwayWin ? 'WIN' : 'LOSE'}</span>}</div>
            <div className="w-16 h-16"><img src={isImagesReady ? teamLogos.away : `/teams/${awayCode}.png`} className={`w-full h-full object-contain drop-shadow-xl ${isImagesReady ? 'opacity-100' : 'opacity-50'}`} /></div>
            <motion.div animate={{ height: isOpen ? 0 : 'auto', opacity: isOpen ? 0 : 1 }} className="h-10 flex items-center justify-center mt-2"><span className="text-lg font-black text-white uppercase tracking-tighter">{awayCode}</span></motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className={`overflow-hidden mx-4 mb-4 rounded-[2rem] border-y cursor-default ${isEditing ? 'bg-black/20 border-indigo-500/30' : 'bg-slate-950/30 border-slate-800/50'}`} onClick={(e) => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              
              <div className="flex flex-col gap-2 mb-2">
                  <button 
                      onClick={() => setActiveGameId('ALL')} 
                      className={`w-full py-2 rounded-xl text-xs font-black transition-all ${activeGameId === 'ALL' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                  >
                      AVERAGE
                  </button>
                  <div className="flex justify-center gap-2 overflow-x-auto no-scrollbar">
                      {sortedGames.map((g: any) => (
                          <button key={g.id} onClick={() => setActiveGameId(String(g.id))} className={`px-4 py-1.5 rounded-xl text-[10px] font-black transition-all whitespace-nowrap flex items-center gap-1 ${activeGameId === String(g.id) ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                              <span>GAME {g.position}</span>
                              {g.winner_id && <span className={`w-1.5 h-1.5 rounded-full ${g.winner_id === match.home.id ? 'bg-red-500' : 'bg-blue-500'}`}></span>}
                          </button>
                      ))}
                  </div>
              </div>

              {/* ... (나머지 렌더링 로직 동일) ... */}
              <div className="space-y-1">
                {POSITIONS.map((pos) => {
                    const hp = getPlayerName(match.home.id, pos);
                    const ap = getPlayerName(match.away.id, pos);
                    const hScore = getScore(hp, isEditing);
                    const aScore = getScore(ap, isEditing);
                    let hColor = 'slate', aColor = 'slate';
                    if (hScore > 0 && aScore > 0) { if (hScore > aScore) { hColor = 'red'; aColor = 'blue'; } else if (aScore > hScore) { hColor = 'blue'; aColor = 'red'; } }
                    return (
                        <div key={pos} className="flex flex-col gap-0 mb-1">
                            <div className="flex justify-between px-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 relative z-10 leading-none"><span className="truncate w-24">{hp}</span><span className="truncate w-24 text-right">{ap}</span></div>
                            <motion.div layout className={`flex items-center gap-2 ${isEditing ? 'h-9' : 'h-8'}`}>
                                {isEditing ? <InteractiveBar score={hScore} align="left" color={hColor} onChange={(v:number) => handleRatingChange(hp, v)} disabled={activeGameId === 'ALL'} /> : <ResultBar score={hScore} align="left" theme={hColor} />}
                                <div className="w-6 flex justify-center opacity-40"><img src={POS_ICONS[pos]} alt={pos} className="w-4 h-4 object-contain" /></div>
                                {isEditing ? <InteractiveBar score={aScore} align="right" color={aColor} onChange={(v:number) => handleRatingChange(ap, v)} disabled={activeGameId === 'ALL'} /> : <ResultBar score={aScore} align="right" theme={aColor} />}
                            </motion.div>
                        </div>
                    );
                })}
              </div>

              <div className="pt-2 border-t border-slate-800/50">
                <div className="flex flex-col items-center gap-0">
                   <div className="flex items-center gap-2 mb-1"><span className="text-xs font-black text-amber-400 tracking-wider">⚡ 도파민 지수</span><span className="text-sm font-black text-amber-300 italic">{(funScore/2).toFixed(1)}</span></div>
                   <DopamineRating score={funScore} isEditing={isEditing} onChange={handleFunScoreChange} />
                </div>
              </div>

              <div className="pt-2 flex gap-2 hide-on-download">
                 {isEditing ? (
                    <>
                        <button onClick={(e) => { e.stopPropagation(); setIsEditing(false); }} className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl font-bold text-xs">취소</button>
                        <button onClick={handleSubmit} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs shadow-lg">제출 완료!</button>
                    </>
                 ) : (
                    <>
                        <button onClick={(e) => { 
                            e.stopPropagation(); 
                            if(!auth.currentUser) alert('로그인 필요'); 
                            else {
                                setIsEditing(true);
                                if (activeGameId === 'ALL') {
                                    const firstGameId = sortedGames[0]?.id ? String(sortedGames[0].id) : '1';
                                    setActiveGameId(firstGameId);
                                }
                            }
                        }} className="flex-1 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-black text-[10px] uppercase hover:bg-white/10">{hasParticipated ? '✏️ 수정' : '🫠 평점 등록'}</button>
                        <Link href={`/match/${match.id}`} onClick={(e) => e.stopPropagation()} className="flex-1 py-3 bg-white/5 border border-white/10 text-cyan-300 rounded-xl font-bold text-[10px] uppercase hover:bg-white/10 flex items-center justify-center gap-1">💬 리뷰</Link>
                        <button onClick={handleDownload} disabled={!isImagesReady} className="w-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl">{isImagesReady ? '📷' : '⏳'}</button>
                    </>
                 )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!isOpen && <div className="pb-6 text-center"><span className="text-[10px] font-bold text-slate-600 animate-pulse">{isStarted ? "▼ 터치해서 평점 보기" : "⏳ 경기 시작 전"}</span></div>}
    </div>
  );
}

// ... (하위 컴포넌트들은 기존과 동일) ...
function InteractiveBar({ score, align, color, onChange, disabled }: any) {
  const barRef = useRef<HTMLDivElement>(null);
  const update = useCallback((cx: number) => { if(!barRef.current || disabled) return; const rect = barRef.current.getBoundingClientRect(); let p = (cx - rect.left)/rect.width; if(align==='right') p=1-p; onChange(Math.round(Math.max(0,Math.min(1,p))*100)/10); }, [align, onChange, disabled]);
  const handleStart = (e: any) => { if(disabled) { alert("상단의 Game 탭을 선택한 후 점수를 입력해주세요! (종합 탭에서는 입력 불가)"); return; } e.stopPropagation(); update(e.type.includes('touch')?e.touches[0].clientX:e.clientX); };
  return ( <div ref={barRef} onMouseDown={handleStart} onTouchStart={handleStart} className={`flex-1 h-8 bg-slate-800 rounded-lg overflow-hidden relative flex items-center cursor-pointer ${align === 'left' ? 'justify-start' : 'justify-end'} ${disabled ? 'opacity-50 grayscale' : ''}`}> <div style={{ width: `${score * 10}%` }} className={`h-full ${color === 'red' ? 'bg-red-500' : 'bg-blue-500'} opacity-80 pointer-events-none`} /> <span className="absolute inset-0 flex items-center justify-center text-white font-black text-xs pointer-events-none">{score.toFixed(1)}</span> </div> );
}
function ResultBar({ score, align, theme }: any) { const hasData = score > 0; return ( <div className={`flex-1 flex items-center gap-2 ${align === 'left' ? 'flex-row' : 'flex-row-reverse'}`}> <div className={`flex-1 h-2 bg-slate-800 rounded-full overflow-hidden flex ${align === 'left' ? 'justify-start' : 'justify-end'}`}> <motion.div initial={{ width: 0 }} animate={{ width: `${hasData ? score * 10 : 0}%` }} className={`h-full ${hasData ? (theme === 'red' ? 'bg-red-500' : 'bg-blue-500') : 'bg-transparent'}`} /> </div> <span className="text-[10px] font-black text-slate-500 w-6 text-center">{hasData ? score.toFixed(1) : '-'}</span> </div> ); }
function DopamineRating({ score, isEditing, onChange }: any) { const starScore = score / 2; return ( <div className="flex gap-1.5 mt-2"> {[1, 2, 3, 4, 5].map((idx) => ( <div key={idx} className="relative w-6 h-6 cursor-pointer" onClick={(e) => { e.stopPropagation(); if(isEditing) onChange(idx * 2); }}> <svg viewBox="0 0 24 24" className="w-full h-full text-slate-800 fill-current"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg> {starScore >= idx && <svg viewBox="0 0 24 24" className="absolute top-0 left-0 w-full h-full text-amber-400 fill-current"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>} </div> ))} </div> ); }