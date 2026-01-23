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

  const getFilteredMatches = () => {
    const safeMatches = Array.isArray(allMatches) ? allMatches : []; 
    const kstToday = getKSTDateString();
    
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
                <span className="text-base font-black text-white italic tracking-tighter uppercase px-2">{TAB_NAMES[currentTab]}</span>
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

  const [activeGameId, setActiveGameId] = useState<string>('ALL');
  const currentStats = match.stats || {};

  const [isMyHoneyJam, setIsMyHoneyJam] = useState(false);
  const [isLoadingFun, setIsLoadingFun] = useState(false);

  const [teamLogos, setTeamLogos] = useState({ home: '', away: '' });
  const [isImagesReady, setIsImagesReady] = useState(false);

  const homeCode = (match.home.code || match.home.name).trim();
  const awayCode = (match.away.code || match.away.name).trim();

  const games = match.games || []; 
  const sortedGames = [...games].sort((a: any, b: any) => a.position - b.position);
  
  const visibleGames = sortedGames.filter((g: any, idx: number) => {
      if (g.finished) return true;
      if (idx === 0) return true;
      if (sortedGames[idx - 1]?.finished) return true;
      return false;
  });

  const currentSetNumber = (() => {
      if (match.status !== 'RUNNING') return null;
      const runningGame = sortedGames.find((g: any) => !g.finished);
      return runningGame ? runningGame.position : null;
  })();

  const getPlayerName = (teamId: number, pos: string, targetGameId: string) => {
    const teamRosterMap = rosters[teamId] || {};
    const players = teamRosterMap[pos]; 

    if (!Array.isArray(players) || players.length === 0) return 'SUB';

    if (targetGameId === 'ALL') {
        const starter = players.find((p: any) => p.isStarter);
        return starter ? starter.name : players[0].name;
    }

    const targetGameData = games.find((g: any) => String(g.id) === String(targetGameId));
    if (targetGameData && targetGameData.active_players) {
        const side = match.home.id === teamId ? 'home' : 'away';
        const pinKey = `pinned_${side}_${pos}`;
        const pinnedPlayerId = targetGameData.active_players[pinKey];

        if (pinnedPlayerId) {
            const pinnedPlayer = players.find((p: any) => String(p.id) === String(pinnedPlayerId));
            if (pinnedPlayer) return pinnedPlayer.name;
        }
    }

    const starter = players.find((p: any) => p.isStarter);
    return starter ? starter.name : players[0].name;
  };

  const boFormat = match.number_of_games ? `Bo${match.number_of_games}` : 'Bo3';
  const isTomorrow = (() => {
      const todayDate = new Date(getKSTDateString());
      const tomorrow = new Date(todayDate);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getKSTDateString(tomorrow);
      const matchDateStr = getKSTDateString(match.date);
      return matchDateStr === tomorrowStr;
  })();

  const isLive = match.status === 'RUNNING';
  const funCount = currentStats.total?.[FUN_KEY]?.sum || 0;

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

  useEffect(() => { if (!isOpen) { hasScrolledRef.current = false; setIsImagesReady(false); setActiveGameId('ALL'); } }, [isOpen]);

  useEffect(() => {
    if (isOpen || isFocused) { 
      const fetchMyRating = async () => {
        const user = auth.currentUser;
        if (!user) return;
        const docId = `${user.uid}_${match.id}`;
        try {
            const snap = await getDoc(doc(db, "matchRatings", docId));
            if (snap.exists()) {
                const data = snap.data().ratings;
                if (data && data[FUN_KEY] === 1) setIsMyHoneyJam(true);
                else setIsMyHoneyJam(false);
            }
        } catch(e) { console.error(e); }
      };
      fetchMyRating(); 
      
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

  const handleToggleHoneyJam = async () => {
      const user = auth.currentUser;
      if (!user) return alert("로그인이 필요합니다.");
      if (isLoadingFun) return;

      setIsLoadingFun(true);
      const newVal = isMyHoneyJam ? 0 : 1; 

      setIsMyHoneyJam(newVal === 1); 

      try {
          const newStats = await runTransaction(db, async (transaction) => {
              const ratingRef = doc(db, "matchRatings", `${user.uid}_${match.id}`);
              const matchRef = doc(db, "artifacts", APP_ID, 'public', 'data', 'matches', String(match.id));
              
              const ratingDoc = await transaction.get(ratingRef);
              const matchDoc = await transaction.get(matchRef);

              const currentStats = matchDoc.exists() ? matchDoc.data()?.stats || { total: {}, games: {} } : { total: {}, games: {} };
              const oldRatings = ratingDoc.exists() ? ratingDoc.data().ratings : {};
              const oldVal = oldRatings[FUN_KEY] || 0; 

              const newStats = JSON.parse(JSON.stringify(currentStats));
              if (!newStats.total) newStats.total = {};
              if (!newStats.total[FUN_KEY]) newStats.total[FUN_KEY] = { sum: 0, count: 0 };

              if (oldVal > 0) {
                  newStats.total[FUN_KEY].sum -= oldVal;
                  newStats.total[FUN_KEY].count--;
              }
              if (newVal > 0) {
                  newStats.total[FUN_KEY].sum += newVal;
                  newStats.total[FUN_KEY].count++;
              }

              const newMyRatings = { ...oldRatings, [FUN_KEY]: newVal };

              transaction.set(ratingRef, { 
                  userId: user.uid, 
                  matchId: match.id, 
                  ratings: newMyRatings, 
                  createdAt: serverTimestamp() 
              }, { merge: true });
              
              transaction.set(matchRef, { stats: newStats }, { merge: true });
              return newStats;
          });

          if (newStats) onStatsUpdate(match.id, newStats);

      } catch (e: any) {
          console.error(e);
          alert("투표 실패: " + e.message);
          setIsMyHoneyJam(!isMyHoneyJam); // 롤백
      } finally {
          setIsLoadingFun(false);
      }
  };

  const getScore = (playerName: string) => {
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

  const isStarted = new Date() >= new Date(match.date.replace(' ', 'T'));
  const isFinished = match.status === 'FINISHED';
  const isHomeWin = isFinished && (match.home.score > match.away.score);
  const isAwayWin = isFinished && (match.away.score > match.home.score);

  return (
    <div ref={cardRef} onClick={() => { if(isStarted) onToggle(isOpen); }} className={`border rounded-[2.5rem] overflow-hidden shadow-2xl relative transition-all duration-500 cursor-pointer bg-slate-900 border-slate-800`}>
      <style jsx global>{`.download-mode .hide-on-download { display: none !important; }`}</style>
      
      <div className="absolute top-0 inset-x-0 flex justify-center -mt-0.5 z-10">
        <div className={`px-4 py-1.5 rounded-b-xl border-b border-x shadow-lg flex items-center gap-2 bg-slate-800 border-slate-700 text-cyan-400`}>
          <span className="text-[10px] font-black tracking-widest uppercase">{match.league} • {match.round} • {boFormat}</span>
          {isTomorrow && <span className="text-[9px] bg-amber-500 text-black px-1.5 rounded font-bold animate-pulse">TOMORROW</span>}
          {isLive && (
              <span className="flex items-center gap-1.5 bg-red-600 text-white px-2 py-0.5 rounded animate-pulse">
                  <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                  <span className="text-[9px] font-black tracking-wider">LIVE {currentSetNumber ? `• SET ${currentSetNumber}` : ''}</span>
              </span>
          )}
        </div>
      </div>

      <div className="p-8 pt-12 pb-4 text-center">
        <div className="flex justify-between items-start">
          <div className="flex-1 flex flex-col items-center gap-1">
            <div className="h-6 mb-2 flex items-center justify-center">{isFinished && <span className={`px-2 py-0.5 rounded text-[9px] font-black ${isHomeWin ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>{isHomeWin ? 'WIN' : 'LOSE'}</span>}</div>
            <div className="w-16 h-16"><img src={isImagesReady ? teamLogos.home : `/teams/${homeCode}.png`} className={`w-full h-full object-contain drop-shadow-xl ${isImagesReady ? (isOpen || isLive ? 'opacity-100' : 'opacity-50') : 'opacity-50'}`} /></div>
            <motion.div animate={{ height: isOpen ? 0 : 'auto', opacity: isOpen ? 0 : 1 }} className="h-10 flex items-center justify-center mt-2"><span className="text-lg font-black text-white uppercase tracking-tighter">{homeCode}</span></motion.div>
          </div>
          
          <div className="px-2 pt-8 flex flex-col items-center">
            <span className="text-[10px] text-slate-500 font-bold mb-2 tracking-widest">{match.date.substring(5, 16).replace('-', '.')}</span>
            {isFinished ? (
                <div className="text-3xl font-black italic text-white tracking-tighter drop-shadow-lg px-3">{match.home.score} : {match.away.score}</div> 
            ) : (
                isLive ? (
                    <div className="text-2xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 tracking-tighter drop-shadow-[0_2px_10px_rgba(245,158,11,0.5)] scale-110 px-3">
                        {match.home.score} : {match.away.score}
                    </div>
                ) : (
                    <div className="text-xl font-black italic text-slate-600 bg-slate-800 px-3 py-1 rounded-lg">VS</div>
                )
            )}
          </div>

          <div className="flex-1 flex flex-col items-center gap-1">
            <div className="h-6 mb-2 flex items-center justify-center">{isFinished && <span className={`px-2 py-0.5 rounded text-[9px] font-black ${isAwayWin ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>{isAwayWin ? 'WIN' : 'LOSE'}</span>}</div>
            <div className="w-16 h-16"><img src={isImagesReady ? teamLogos.away : `/teams/${awayCode}.png`} className={`w-full h-full object-contain drop-shadow-xl ${isImagesReady ? (isOpen || isLive ? 'opacity-100' : 'opacity-50') : 'opacity-50'}`} /></div>
            <motion.div animate={{ height: isOpen ? 0 : 'auto', opacity: isOpen ? 0 : 1 }} className="h-10 flex items-center justify-center mt-2"><span className="text-lg font-black text-white uppercase tracking-tighter">{awayCode}</span></motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className={`overflow-hidden mx-4 mb-4 rounded-[2rem] border-y cursor-default bg-slate-950/30 border-slate-800/50`} onClick={(e) => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              
              <div className="flex flex-col gap-2 mb-2">
                  <button 
                      onClick={() => setActiveGameId('ALL')} 
                      className={`w-full py-2 rounded-xl text-xs font-black transition-all ${activeGameId === 'ALL' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                  >
                      AVERAGE
                  </button>
                  <div className="flex justify-center gap-2 overflow-x-auto no-scrollbar">
                      {visibleGames.map((g: any) => {
                          let winnerLogo = null;
                          if (g.winner_id) {
                              if (Number(g.winner_id) === Number(match.home.id)) winnerLogo = isImagesReady ? teamLogos.home : match.home.logo;
                              else if (Number(g.winner_id) === Number(match.away.id)) winnerLogo = isImagesReady ? teamLogos.away : match.away.logo;
                          }
                          return (
                              <button key={g.id} onClick={() => setActiveGameId(String(g.id))} className={`px-4 py-1.5 rounded-xl text-[10px] font-black transition-all whitespace-nowrap flex items-center gap-1 ${activeGameId === String(g.id) ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                                  <span>GAME {g.position}</span>
                                  {winnerLogo && <img src={winnerLogo} className="w-3.5 h-3.5 object-contain ml-1" alt="win" />}
                              </button>
                          );
                      })}
                  </div>
              </div>

              <div className="space-y-1">
                {POSITIONS.map((pos) => {
                    const hp = getPlayerName(match.home.id, pos, activeGameId);
                    const ap = getPlayerName(match.away.id, pos, activeGameId);
                    const hScore = getScore(hp);
                    const aScore = getScore(ap); 
                    
                    // ⭐ [수정] 컬러 코딩 로직 (데이터 O -> 상대평가, 데이터 X -> 결과따라)
                    let hColor = 'slate', aColor = 'slate';
                    
                    if (hScore > 0 && aScore > 0) {
                        // 둘 다 점수 있음 -> 상대평가
                        if (hScore >= aScore) { hColor = 'red'; aColor = 'blue'; }
                        else { hColor = 'blue'; aColor = 'red'; }
                    } else if (isFinished) {
                        // 점수 부족 & 경기 끝남 -> 승패 따라감
                        if (isHomeWin) { hColor = 'red'; aColor = 'blue'; }
                        else { hColor = 'blue'; aColor = 'red'; }
                    }
                    // 경기 중이고 점수 없으면 Slate(회색) 유지

                    return (
                        <div key={pos} className="flex flex-col gap-0 mb-1">
                            <div className="flex justify-between px-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 relative z-10 leading-none"><span className="truncate w-24">{hp}</span><span className="truncate w-24 text-right">{ap}</span></div>
                            <motion.div layout className={`flex items-center gap-2 h-8`}>
                                <ResultBar score={hScore} align="left" theme={hColor} />
                                <div className="w-6 flex justify-center opacity-40"><img src={POS_ICONS[pos]} alt={pos} className="w-4 h-4 object-contain" /></div>
                                <ResultBar score={aScore} align="right" theme={aColor} />
                            </motion.div>
                        </div>
                    );
                })}
              </div>

              <div className="pt-2 border-t border-slate-800/50">
                <HoneyJamToggle 
                    isEditing={true} 
                    isActive={isMyHoneyJam} 
                    count={funCount} 
                    onToggle={handleToggleHoneyJam}
                />
              </div>

              <div className="pt-2 flex gap-2 hide-on-download">
                 <Link 
                    href={`/match/${match.id}`} 
                    onClick={(e) => e.stopPropagation()} 
                    className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase transition-all shadow-lg flex items-center justify-center gap-2"
                 >
                    나도 평점 & 리뷰 남기기
                 </Link>
                 <button onClick={handleDownload} disabled={!isImagesReady} className="w-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl hover:bg-white/10">{isImagesReady ? '📷' : '⏳'}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!isOpen && <div className="pb-6 text-center"><span className="text-[10px] font-bold text-slate-600 animate-pulse">{isStarted ? "▼ 터치해서 평점 보기" : "⏳ 경기 시작 전"}</span></div>}
    </div>
  );
}

// ⭐ [수정] ResultBar - Slate(회색) 테마 추가
function ResultBar({ score, align, theme }: any) { 
    const hasData = score > 0; 
    // 테마별 배경색 지정
    const barColor = theme === 'red' ? 'bg-red-500' : (theme === 'blue' ? 'bg-blue-500' : 'bg-slate-600');
    
    return ( 
        <div className={`flex-1 flex items-center gap-2 ${align === 'left' ? 'flex-row' : 'flex-row-reverse'}`}> 
            <div className={`flex-1 h-2 bg-slate-800 rounded-full overflow-hidden flex ${align === 'left' ? 'justify-start' : 'justify-end'}`}> 
                <motion.div initial={{ width: 0 }} animate={{ width: `${hasData ? score * 10 : 0}%` }} className={`h-full ${hasData ? barColor : 'bg-transparent'}`} /> 
            </div> 
            <span className="text-[10px] font-black text-slate-500 w-6 text-center">{hasData ? score.toFixed(1) : '-'}</span> 
        </div> 
    ); 
}

function HoneyJamToggle({ isEditing, isActive, count, onToggle }: any) {
    if (!isEditing) {
        return (
            <div className="flex flex-col items-center justify-center py-2 gap-1">
                <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className={`w-5 h-5 ${count > 0 ? 'text-red-500' : 'text-slate-600'}`} fill="currentColor">
                        <path d="M2.3 15.8c-1.3-1.3-1.3-3.4 0-4.7l6.5-6.5c.3-.3.8-.5 1.3-.5H18c1.7 0 3 1.3 3 3v10c0 1.7-1.3 3-3 3H8.8c-.5 0-1-.2-1.3-.5l-5.2-5.2z"/>
                    </svg>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Honey Jam Score</span>
                </div>
                <div className="text-3xl font-black italic tracking-tighter text-white">
                    {count}<span className="text-sm text-slate-500 ml-1 font-bold not-italic">FISTS</span>
                </div>
                <div className="text-[10px] text-slate-500">
                    {count >= 50 ? "🔥 전설의 레전드 경기!" : count >= 10 ? "👍 꽤 재밌는 경기였어요" : "💤 아직 꿀잼 인증이 부족해요"}
                </div>
            </div>
        );
    }

    return (
        <button 
            onClick={(e) => { e.stopPropagation(); if(isEditing && onToggle) onToggle(); }}
            className={`w-full relative group overflow-hidden rounded-2xl border transition-all duration-300 ${
                isActive 
                ? 'bg-red-600 border-red-400 shadow-[0_0_20px_rgba(220,38,38,0.4)]' 
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
            }`}
        >
            <div className="relative z-10 flex items-center justify-between px-6 py-4">
                <div className="flex flex-col items-start text-left flex-1 mr-4">
                    <span className={`text-lg font-black italic tracking-tighter transition-colors ${isActive ? 'text-white' : 'text-slate-300'}`}>
                        {isActive ? "이 경기, 꿀잼 !" : "이 경기, 꿀잼 ?"}
                    </span>
                    <span className={`text-[11px] font-bold transition-colors mt-0.5 ${isActive ? 'text-red-200' : 'text-slate-500'}`}>
                        {isActive ? "명경기 나왔다! 하이라이트 다시보기 추천!" : "도파민 터지는 경기였다면 HYPE!"}
                    </span>
                </div>
                <div className="flex flex-col items-center justify-center gap-1">
                    <div className={`transform transition-all duration-300 ${isActive ? 'scale-125 rotate-[-10deg]' : 'scale-100 opacity-30 grayscale'}`}>
                        <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current text-white drop-shadow-lg">
                            <path d="M9.5 3.5a2.5 2.5 0 0 1 2.5 2.5v4h6a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 6 19.5v-13L9.5 3.5z"/> 
                            <path d="M2 9a2 2 0 0 1 2-2h1v13H4a2 2 0 0 1-2-2V9z" />
                        </svg>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full transition-colors ${isActive ? 'bg-white/20 text-white' : 'bg-black/30 text-slate-400'}`}>
                        🔥 {count}
                    </span>
                </div>
            </div>
            
            {isActive && <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-orange-500 to-red-600 opacity-50 blur-xl animate-pulse"></div>}
        </button>
    );
}