'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation'; 
import LoginButton from '@/components/LoginButton';
import { db, auth } from '@/lib/firebase';
import { collection, query, getDocs, where, doc, getDoc, setDoc, serverTimestamp, runTransaction, onSnapshot } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth'; 
import { motion, AnimatePresence } from 'framer-motion';
import Footer from '@/components/Footer';
import * as htmlToImage from 'html-to-image'; 

const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];
const FUN_KEY = 'match_fun_score'; 

const POS_ICONS: Record<string, string> = {
  'TOP': '/icons/top.png',
  'JGL': '/icons/jungle.png',
  'MID': '/icons/middle.png',
  'ADC': '/icons/bottom.png',
  'SUP': '/icons/support.png'
};

// --- 이미지 유틸리티 ---
const getDisplayImgUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http://')) return url.replace('http://', 'https://');
  return url;
};

const getProxyImgUrl = (url: string) => {
  const cleanUrl = getDisplayImgUrl(url).replace(/^https?:\/\//, '');
  return `https://wsrv.nl/?url=${cleanUrl}&output=png`;
};

const convertImgToBase64 = async (url: string) => {
  try {
    const proxyUrl = getProxyImgUrl(url);
    const response = await fetch(proxyUrl);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Image conversion failed:", error);
    return null;
  }
};

const dataURItoBlob = (dataURI: string) => {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
};

const formatPlayerName = (fullName: string, teamName: string) => {
  if (!fullName) return '';
  return fullName.split('/').map(part => {
    const name = part.trim();
    if (name.startsWith(teamName + ' ')) {
      return name.substring(teamName.length + 1);
    }
    return name;
  }).join(' / ');
};

const getRosterForMatch = (teamName: string, dateStr: string, rosters: Record<string, string[]>) => {
  if (!rosters) return POSITIONS.map(p => `${teamName} ${p}`);
  const year = dateStr && dateStr.length >= 4 ? dateStr.substring(0, 4) : '2025';
  const key = `${teamName}_${year}`;
  if (rosters[key]) return rosters[key];
  if (rosters[teamName]) return rosters[teamName];
  return POSITIONS.map(p => `${teamName} ${p}`);
};

// ⭐ 한국 시간(KST) 구하기 함수 (YYYY-MM-DD 형식)
const getKSTDate = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kstGap = 9 * 60 * 60 * 1000;
  const kstDate = new Date(utc + kstGap);
  
  const yyyy = kstDate.getFullYear();
  const mm = String(kstDate.getMonth() + 1).padStart(2, '0');
  const dd = String(kstDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// --- 메인 컴포넌트 ---
export default function HomeView({ initialMatches, initialRosters }: { initialMatches: any[], initialRosters: any }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [allMatches, setAllMatches] = useState<any[]>(initialMatches || []);
  const [teamRosters, setTeamRosters] = useState<Record<string, string[]>>(initialRosters || {});
  
  const [currentTab, setCurrentTab] = useState(1);
  const TAB_NAMES = ['지난 경기', '오늘의 경기', '다가오는 경기'];
  
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isAnyEditing, setIsAnyEditing] = useState(false);

  // ⭐ 실시간 스코어/결과 업데이트를 위한 리스너 추가
  useEffect(() => {
    // 전체 경기를 감시하면 너무 많을 수 있으니, 필요한 경우 쿼리 조건을 추가하세요.
    // 여기서는 간단히 전체 matches 컬렉션을 구독하여 실시간성을 확보합니다.
    const q = query(collection(db, "matches"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const updatedMatches = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // 기존 날짜 포맷 등의 가공이 필요하다면 여기서 처리
      // 편의상 map을 돌며 date 필드 등이 호환되도록 처리한다고 가정
      setAllMatches(updatedMatches);
    });

    return () => unsubscribe();
  }, []);

  const changeTab = (newTab: number) => {
    if (newTab < 0 || newTab > 2) return;
    setCurrentTab(newTab);
    setExpandedId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    router.replace('/', { scroll: false });
  };

  const toggleCard = (matchId: string, isOpenNow: boolean) => {
    if (isOpenNow) {
        setExpandedId(null);
        setIsScrolled(true);
        router.replace('/', { scroll: false }); 
    } else {
        setExpandedId(matchId);
        router.replace(`/?expanded=${matchId}`, { scroll: false });
    }
  };

  useEffect(() => {
    const targetId = searchParams.get('expanded');
    if (targetId) {
        // matchData가 로드될 때까지 기다릴 수도 있으나, 여기선 allMatches가 있다고 가정
        if (allMatches.length > 0) {
            const targetMatch = allMatches.find(m => m.id === targetId);
            if (targetMatch) {
                const kstToday = getKSTDate();
                const matchDate = targetMatch.date.split(' ')[0];
                if (matchDate < kstToday) setCurrentTab(0);
                else if (matchDate === kstToday) setCurrentTab(1);
                else setCurrentTab(2);
                setExpandedId(targetId);
            }
        }
    } else {
        setExpandedId(null);
    }
  }, [searchParams, allMatches]);

  useEffect(() => {
    const handleScroll = () => { setIsScrolled(window.scrollY > 0); };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0); 

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isAnyEditing) return;
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isAnyEditing) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const distanceX = touchStartX.current - touchEndX;
    const distanceY = touchStartY.current - touchEndY;
    
    if (Math.abs(distanceY) > 30) return;
    
    const minSwipeDistance = 80; 
    if (distanceX > minSwipeDistance) { if (currentTab < 2) changeTab(currentTab + 1); }
    else if (distanceX < -minSwipeDistance) { if (currentTab > 0) changeTab(currentTab - 1); }
  };

  const getFilteredMatches = () => {
    const safeMatches = Array.isArray(allMatches) ? allMatches : []; 
    const kstToday = getKSTDate(); // ⭐ KST 기준 날짜 사용
    
    if (currentTab === 0) return safeMatches.filter(m => m.date.split(' ')[0] < kstToday).sort((a, b) => b.date.localeCompare(a.date));
    else if (currentTab === 1) return safeMatches.filter(m => m.date.split(' ')[0] === kstToday).sort((a, b) => a.date.localeCompare(b.date));
    else return safeMatches.filter(m => m.date.split(' ')[0] > kstToday).sort((a, b) => a.date.localeCompare(b.date));
  };

  const displayMatches = getFilteredMatches();

  return (
    <div className="bg-slate-950 min-h-screen text-slate-50 font-sans pb-20">
      <div className={`sticky top-0 z-40 transition-all duration-300 border-b border-slate-800/50 ${isScrolled ? 'bg-slate-950/95 backdrop-blur-md shadow-lg h-[74px]' : 'bg-slate-950 h-28'}`}>
        <div className="max-w-md mx-auto h-full flex flex-col justify-between">
          <header className={`flex items-center justify-between px-5 transition-all duration-300 ${isScrolled ? 'pt-2' : 'pt-4'}`}>
            <div className={`origin-left transition-transform duration-300 ${isScrolled ? 'scale-75' : 'scale-100'}`}>
               <h1 className="font-black text-cyan-400 italic tracking-tighter uppercase text-2xl">협곡평점.GG</h1>
            </div>
            <div className={`flex-shrink-0 transition-transform duration-300 ${isScrolled ? 'scale-75 origin-right' : 'scale-90 origin-right'}`}>
              <LoginButton compact={isScrolled} />
            </div>
          </header>
          <div className={`flex items-center justify-between px-4 transition-all duration-300 ${isScrolled ? 'pb-2' : 'pb-2'}`}>
            <button onClick={() => changeTab(Math.max(0, currentTab - 1))} disabled={currentTab === 0} className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${currentTab === 0 ? 'text-slate-800' : 'text-cyan-400 hover:bg-slate-800'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <div className="flex flex-col items-center justify-center">
              <div className={`overflow-hidden transition-all duration-300 flex flex-col items-center ${isScrolled ? 'h-0 opacity-0' : 'h-7 opacity-100'}`}>
                <span className="text-base font-black text-white italic tracking-tighter uppercase whitespace-nowrap pr-2 pl-1">{TAB_NAMES[currentTab]}</span>
              </div>
              <div className={`flex gap-1.5 transition-all duration-300 ${isScrolled ? 'mt-0' : 'mt-1'}`}>
                {[0, 1, 2].map(i => (<motion.div key={i} animate={{ backgroundColor: i === currentTab ? '#22d3ee' : '#334155', scale: i === currentTab ? 1.2 : 1 }} className="w-1.5 h-1.5 rounded-full" />))}
              </div>
            </div>
            <button onClick={() => changeTab(Math.min(2, currentTab + 1))} disabled={currentTab === 2} className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${currentTab === 2 ? 'text-slate-800' : 'text-cyan-400 hover:bg-slate-800'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 min-h-[50vh]" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <AnimatePresence mode='wait'>
          <motion.div key={currentTab} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
            {displayMatches.length === 0 ? (
              <div className="text-center text-slate-600 font-bold py-20 bg-slate-900/30 rounded-3xl border border-slate-800 border-dashed">경기가 없습니다.</div>
            ) : (
              displayMatches.map((match) => (
                <MatchCard 
                  key={match.id} 
                  match={match} 
                  homeRoster={getRosterForMatch(match.home.name, match.date, teamRosters)}
                  awayRoster={getRosterForMatch(match.away.name, match.date, teamRosters)}
                  isOpen={expandedId === match.id}
                  onToggle={(isOpenNow: boolean) => toggleCard(match.id, isOpenNow)}
                  onEditingStateChange={(editing: boolean) => setIsAnyEditing(editing)}
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

function MatchCard({ match, homeRoster, awayRoster, isOpen, onToggle, onEditingStateChange }: any) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hasParticipated, setHasParticipated] = useState(false); 
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [showTooltip, setShowTooltip] = useState(false);
  const [currentStats, setCurrentStats] = useState(match.stats || {});

  useEffect(() => {
    onEditingStateChange(isEditing);
  }, [isEditing, onEditingStateChange]);

  useEffect(() => {
    // 실시간 업데이트된 match prop을 반영
    if (match.stats) setCurrentStats(match.stats);
  }, [match.stats]);

  const averages: Record<string, number> = {};
  Object.keys(currentStats).forEach(key => {
      if(currentStats[key].count > 0) {
          averages[key] = currentStats[key].sum / currentStats[key].count;
      }
  });

  const isStarted = new Date() >= new Date(match.date.replace(' ', 'T'));
  const isFinished = match.status === 'FINISHED';
  const isHomeWin = isFinished && (match.home.score > match.away.score);
  const isAwayWin = isFinished && (match.away.score > match.home.score);

  const checkIsTomorrow = () => {
    const kstTodayStr = getKSTDate();
    const matchDateStr = match.date.split(' ')[0];
    
    // 내일 날짜 계산 (KST 기준)
    const today = new Date(kstTodayStr);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    const kstTomorrowStr = `${yyyy}-${mm}-${dd}`;

    return matchDateStr === kstTomorrowStr;
  };
  const isTomorrow = checkIsTomorrow();

  useEffect(() => {
    if (isOpen) { 
      fetchMyRatings(); 
      setTimeout(() => {
        if (cardRef.current) {
          const y = cardRef.current.getBoundingClientRect().top + window.scrollY - 100;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }, 300);
    } 
    else { setIsEditing(false); setShowTooltip(false); }
  }, [isOpen]);

  const fetchMyRatings = async () => {
    const user = auth.currentUser;
    if (!user) { setHasParticipated(false); return; }
    const docId = `${user.uid}_${match.id}`;
    const snap = await getDoc(doc(db, "matchRatings", docId));
    if (snap.exists()) {
      setHasParticipated(true);
      const saved = snap.data().ratings;
      const parsed: Record<string, number> = {};
      Object.entries(saved).forEach(([name, val]: any) => parsed[name] = val.score);
      setMyRatings(parsed);
    } else {
      setHasParticipated(false);
      const initial: Record<string, number> = {};
      [...homeRoster, ...awayRoster].forEach(p => initial[p] = 0);
      initial[FUN_KEY] = 0; 
      setMyRatings(initial);
    }
  };

  const handleCardClick = () => { 
    if (!isStarted) { alert("경기가 시작되면 평점이 오픈돼요!"); return; }
    if (!isEditing) onToggle(isOpen); 
  };

  const handleStartEdit = async (e: any) => {
    e.stopPropagation();
    if (!auth.currentUser) {
        if(window.confirm("로그인이 필요한 서비스입니다.\n로그인 하시겠습니까?")) {
            try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch(e) { console.error(e); }
        }
        return;
    }
    setIsEditing(true);
  };

  const handleSubmit = async (e: any) => {
    e.stopPropagation();
    if (!window.confirm("이 점수로 제출하시겠습니까?")) return;
    const user = auth.currentUser;
    if (!user) return;

    try {
      let finalStats: any = {};
      await runTransaction(db, async (transaction) => {
        const ratingDocRef = doc(db, "matchRatings", `${user.uid}_${match.id}`);
        const matchDocRef = doc(db, "matches", match.id);
        const ratingDoc = await transaction.get(ratingDocRef);
        const matchDoc = await transaction.get(matchDocRef);
        if (!matchDoc.exists()) throw new Error("Match not found");
        const currentDbStats = matchDoc.data().stats || {};
        const newStats = JSON.parse(JSON.stringify(currentDbStats)); 
        const oldRatings = ratingDoc.exists() ? ratingDoc.data().ratings : {};
        const submitData: Record<string, any> = {};
        Object.entries(myRatings).forEach(([name, score]) => { 
            submitData[name] = { score, comment: "" }; 
            const oldScore = oldRatings[name]?.score;
            if (!newStats[name]) newStats[name] = { sum: 0, count: 0 };
            if (oldScore !== undefined) {
                newStats[name].sum = Math.max(0, newStats[name].sum - oldScore + score);
            } else {
                newStats[name].sum += score;
                newStats[name].count += 1;
            }
        });
        finalStats = newStats;
        transaction.set(ratingDocRef, { userId: user.uid, matchId: match.id, ratings: submitData, createdAt: serverTimestamp() });
        transaction.set(matchDocRef, { stats: newStats }, { merge: true });
      });
      alert("평점이 반영되었습니다!");
      setIsEditing(false); setHasParticipated(true); setCurrentStats(finalStats);
    } catch (e: any) { 
        console.error("Submit Error:", e);
        alert(`제출 실패\n에러코드: ${e.code || 'unknown'}`);
    }
  };

  const handleRatingChange = (name: string, val: number) => { setMyRatings(prev => ({ ...prev, [name]: val })); };

  const handleDownload = async (e: any) => {
    e.stopPropagation();
    if (!cardRef.current) return;
    
    cardRef.current.classList.add('download-mode'); 
    const imgs = cardRef.current.querySelectorAll('img');
    const originalSrcs: string[] = [];
    
    try {
      const tasks = Array.from(imgs).map(async (img, i) => {
        originalSrcs[i] = img.src;
        if (img.src.startsWith('data:') || img.src.includes('localhost')) return;
        
        const base64 = await convertImgToBase64(img.src);
        if (base64) {
          return new Promise((resolve) => {
            const imageElement = img as HTMLImageElement;
            imageElement.onload = () => {
                if (imageElement.decode) {
                    imageElement.decode()
                        .then(() => resolve(true))
                        .catch(() => resolve(true));
                } else {
                    resolve(true);
                }
            };
            imageElement.onerror = () => resolve(false);
            imageElement.src = base64 as string;
          });
        }
      });
      
      await Promise.all(tasks);
      await new Promise(r => setTimeout(r, 500)); 

      const dataUrl = await htmlToImage.toPng(cardRef.current, { 
        backgroundColor: '#020617', 
        pixelRatio: 2, 
        cacheBust: true,
        skipAutoScale: true
      });

      if (navigator.share) {
          const blob = dataURItoBlob(dataUrl);
          const file = new File([blob], `협곡평점.png`, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
              try { await navigator.share({ files: [file], title: '협곡평점.GG' }); } catch (e) {}
          } else {
              const link = document.createElement('a');
              link.download = `rating_${match.id}.png`;
              link.href = dataUrl;
              link.click();
          }
      } else {
          const link = document.createElement('a'); 
          link.download = `rating_${match.id}.png`; 
          link.href = dataUrl; 
          link.click();
      }
    } catch(err) { 
      console.error("Download Error:", err);
      alert("이미지 생성 오류"); 
    } finally {
      imgs.forEach((img, i) => { if (originalSrcs[i]) img.src = originalSrcs[i]; });
      setTimeout(() => {
        if(cardRef.current) cardRef.current.classList.remove('download-mode');
      }, 150);
    }
  };

  const formattedDate = match.date.substring(5, 10).replace('-', '.'); 
  const timeStr = match.date.split(' ')[1];
  const funScore = isEditing ? (myRatings[FUN_KEY] ?? 0) : (averages[FUN_KEY] ?? 0);

  return (
    <div 
        ref={cardRef}
        onClick={handleCardClick} 
        className={`border rounded-[2.5rem] overflow-hidden shadow-2xl relative transition-all duration-500 cursor-pointer ${isEditing ? 'bg-indigo-950/40 border-indigo-500/50 shadow-indigo-500/10' : 'bg-slate-900 border-slate-800 hover:bg-slate-800/80'}`}
    >
      <style jsx global>{`.download-mode .hide-on-download { display: none !important; } .download-mode .team-name-text { display: none !important; } .download-mode .team-logo-img { margin-bottom: 10px; }`}</style>
      <div className="absolute top-0 inset-x-0 flex justify-center -mt-0.5 z-10">
        <div className={`px-4 py-1.5 rounded-b-xl border-b border-x shadow-lg ${isEditing ? 'bg-indigo-900 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-cyan-400'}`}>
          <span className="text-[10px] font-black tracking-widest uppercase">{match.league} • {match.round}</span>
        </div>
      </div>
      <div className="p-8 pt-12 pb-4 text-center">
        <div className="flex justify-between items-start">
          <div className="flex-1 flex flex-col items-center gap-1">
            <div className="h-6 mb-1 flex items-end">
              {isFinished && <span className={`px-2 py-0.5 rounded text-[9px] font-black ${isHomeWin ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>{isHomeWin ? 'WIN' : 'LOSE'}</span>}
            </div>
            <div className="w-16 h-16 flex items-center justify-center team-logo-img transition-all">
              {match.home.logo ? <img src={getDisplayImgUrl(match.home.logo)} className="w-full h-full object-contain drop-shadow-xl" alt={match.home.name}/> : match.home.name}
            </div>
            <motion.div animate={{ height: isOpen ? 0 : 'auto', opacity: isOpen ? 0 : 1 }} className="overflow-hidden team-name-text h-10 flex items-center justify-center">
                <span className="text-sm font-bold text-white leading-tight uppercase px-1">{match.home.name}</span>
            </motion.div>
          </div>
          <div className="px-2 pt-8 flex flex-col items-center">
            {isTomorrow && <span className="bg-amber-400 text-black text-[9px] font-black px-1.5 py-0.5 rounded mb-1 animate-pulse">내일</span>}
            <span className="text-[10px] text-slate-500 font-bold mb-2 tracking-widest">{formattedDate} {timeStr}</span>
            {match.status === 'FINISHED' ? <div className="text-3xl font-black italic text-white tracking-tighter drop-shadow-lg">{match.home.score} : {match.away.score}</div> : <div className="text-xl font-black italic text-slate-600 bg-slate-800 px-3 py-1 rounded-lg">VS</div>}
          </div>
          <div className="flex-1 flex flex-col items-center gap-1">
             <div className="h-6 mb-1 flex items-end">
               {isFinished && <span className={`px-2 py-0.5 rounded text-[9px] font-black ${isAwayWin ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>{isAwayWin ? 'WIN' : 'LOSE'}</span>}
            </div>
            <div className="w-16 h-16 flex items-center justify-center team-logo-img transition-all">
              {match.away.logo ? <img src={getDisplayImgUrl(match.away.logo)} className="w-full h-full object-contain drop-shadow-xl" alt={match.away.name}/> : match.away.name}
            </div>
            <motion.div animate={{ height: isOpen ? 0 : 'auto', opacity: isOpen ? 0 : 1 }} className="overflow-hidden team-name-text h-10 flex items-center justify-center">
                <span className="text-sm font-bold text-white leading-tight uppercase px-1">{match.away.name}</span>
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} layout className={`overflow-hidden mx-4 mb-4 rounded-[2rem] border-y transition-colors duration-500 cursor-default ${isEditing ? 'bg-black/20 border-indigo-500/30' : 'bg-slate-950/30 border-slate-800/50'}`} onClick={(e) => e.stopPropagation()}>
            <div className="p-4 space-y-2">
              {POSITIONS.map((pos, idx) => {
                const hp = homeRoster[idx], ap = awayRoster[idx];
                const hScore = isEditing ? (myRatings[hp] ?? 0) : (averages[hp] ?? 0);
                const aScore = isEditing ? (myRatings[ap] ?? 0) : (averages[ap] ?? 0);
                const hName = formatPlayerName(hp, match.home.name);
                const aName = formatPlayerName(ap, match.away.name);

                // ⭐ 4. 컬러 로직 수정: 상대방과의 점수 비교 (높으면 레드, 낮으면 블루, 같으면 슬레이트)
                // 점수가 0이면(데이터 없음) 슬레이트 처리
                let hColor = 'slate', aColor = 'slate';
                if (hScore > 0 && aScore > 0) {
                    if (hScore > aScore) { hColor = 'red'; aColor = 'blue'; }
                    else if (aScore > hScore) { hColor = 'blue'; aColor = 'red'; }
                } else if (hScore > 0 && aScore === 0) {
                    hColor = 'red'; // 상대 점수 없으면 그냥 돋보이게? or slate? 보통 비교불가면 slate지만, 혼자 잘했으면 red 줄수도 있음. 일단 slate로 안전하게.
                    // 요청사항: "맞라인 비교했을때" 이므로, 둘 다 데이터가 있을 때만 유효하다고 가정하거나
                    // 혹은 그냥 절대값 기준이 아니므로, 상대가 0이면 내가 무조건 높음 -> Red? 
                    // 하지만 0은 "평가 안함"일 수 있으니 slate가 맞음.
                    // *수정*: 사용자가 "점수가 높은쪽이 빨간색"이라고 했으므로 단순 비교.
                    if (hScore > aScore) { hColor = 'red'; aColor = 'blue'; }
                } else if (aScore > 0 && hScore === 0) {
                    if (aScore > hScore) { aColor = 'red'; hColor = 'blue'; }
                }

                return (
                  <div key={pos} className="flex flex-col gap-0">
                    <div className="flex justify-between px-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0">
                      <span className="truncate w-24">{hName}</span>
                      <span className="truncate w-24 text-right">{aName}</span>
                    </div>
                    <motion.div layout className="flex items-center gap-3 h-10 relative">
                      {isEditing ? <InteractiveBar score={hScore} align="left" color={hColor} onChange={(v:number) => handleRatingChange(hp, v)} /> : <ResultBar score={hScore} align="left" theme={hColor} />}
                      <div className="w-6 flex justify-center opacity-40"><img src={POS_ICONS[pos]} alt={pos} className="w-4 h-4 object-contain" /></div>
                      {isEditing ? <InteractiveBar score={aScore} align="right" color={aColor} onChange={(v:number) => handleRatingChange(ap, v)} /> : <ResultBar score={aScore} align="right" theme={aColor} />}
                    </motion.div>
                  </div>
                );
              })}
              <div className="pt-2 pb-2">
                <div className="flex flex-col items-center gap-1">
                   <div className="flex items-center gap-2">
                     <span className="text-xs font-black text-amber-400 tracking-wider whitespace-nowrap">⚡ 도파민 지수</span>
                     <span className="text-sm font-black text-amber-300 italic">{(funScore/2).toFixed(1)} <span className="text-[10px] text-slate-500 not-italic">/ 5.0</span></span>
                     <button onClick={() => setShowTooltip(!showTooltip)} className="w-4 h-4 rounded-full border border-slate-700 text-slate-500 text-[9px] flex items-center justify-center hover:bg-slate-700 hover:text-white transition-colors hide-on-download">?</button>
                   </div>
                   {showTooltip && <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 mt-2 text-[10px] text-slate-300 leading-relaxed text-center mx-4 mb-2">내가 응원하는 팀의 성패나 경기력과는 관계없이,<br/><span className="text-amber-400 font-bold">오직 순수 재미</span>를 기준으로 주는 평점이에요.</div>}
                   <DopamineRating score={funScore} isEditing={isEditing} onChange={(v:number) => handleRatingChange(FUN_KEY, v)} />
                </div>
              </div>
              <motion.div layout className="pt-2 space-y-3">
                {isEditing ? (
                  <div className="flex gap-3">
                    <button onClick={(e) => { e.stopPropagation(); setIsEditing(false); }} className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl font-bold text-xs">취소</button>
                    <button onClick={handleSubmit} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-500/30 transition-all">제출 완료!</button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center hide-on-download">
                    <div className="flex-1 flex gap-2">
                        <button onClick={handleStartEdit} className="flex-1 py-3 border border-white/20 bg-white/5 backdrop-blur-md text-white rounded-xl font-black text-[10px] uppercase shadow-[0_4px_30px_rgba(0,0,0,0.1)] transition-all flex items-center justify-center gap-1"><span>{hasParticipated ? '✏️' : '🫠'}</span><span>{hasParticipated ? '평점 수정' : '내 평점 등록'}</span></button>
                        <button onClick={(e) => { e.stopPropagation(); router.push(`/match/${match.id}`); }} className="flex-1 py-3 border border-white/10 bg-white/5 backdrop-blur-sm text-cyan-300 rounded-xl font-bold text-[10px] uppercase shadow-[0_4px_30px_rgba(0,0,0,0.1)] transition-all flex items-center justify-center gap-1"><span>💬</span> 리뷰</button>
                    </div>
                    <button onClick={handleDownload} className="w-10 flex items-center justify-center opacity-70 active:scale-90 transition-all"><img src="/icons/download.png" className="w-5 h-5 object-contain" alt="download"/></button>
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!isOpen && <div className="pb-6 text-center"><span className="text-[10px] font-bold text-slate-600 animate-pulse">{isStarted ? "▼ 터치해서 평점 보기" : "⏳ 경기가 시작되면 평점이 오픈돼요!"}</span></div>}
    </div>
  );
}

// --- 하위 UI 컴포넌트 ---

function InteractiveBar({ score, align, color, onChange }: any) {
  const barRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastHapticRef = useRef(0);

  const triggerHaptic = useCallback(() => {
    const now = Date.now();
    if (now - lastHapticRef.current > 50) { 
      if (typeof navigator !== 'undefined' && navigator.vibrate) { navigator.vibrate(5); }
      lastHapticRef.current = now;
    }
  }, []);

  const update = useCallback((clientX: number) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    // ⭐ 2. 슬라이더 외부까지 X좌표 확장 인식
    let p = (clientX - rect.left) / rect.width;
    if (align === 'right') p = 1 - p;
    // 0~1 사이로 클램핑하여 슬라이더 밖으로 나가도 0 또는 10점이 되게 함
    const newS = Math.round(Math.max(0, Math.min(1, p)) * 100) / 10;
    
    if (newS !== score) { onChange(newS); triggerHaptic(); }
  }, [align, onChange, score, triggerHaptic]);

  const onStart = (e: any) => {
    e.stopPropagation();
    isDragging.current = true;
    const clientX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
    update(clientX);
    
    // ⭐ 2. 전역 이벤트 리스너 추가 (슬라이더 밖에서도 드래그 인식)
    const moveHandler = (ev: any) => {
        const cx = ev.type.includes('touch') ? ev.touches[0].clientX : ev.clientX;
        update(cx);
    };
    const endHandler = () => {
        isDragging.current = false;
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('mouseup', endHandler);
        window.removeEventListener('touchmove', moveHandler);
        window.removeEventListener('touchend', endHandler);
    };

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', endHandler);
    window.addEventListener('touchmove', moveHandler, { passive: false });
    window.addEventListener('touchend', endHandler);
  };

  return (
    <div 
      ref={barRef} 
      onMouseDown={onStart} 
      onTouchStart={onStart} 
      className={`flex-1 h-8 bg-slate-800 rounded-lg overflow-hidden relative flex items-center select-none touch-none cursor-ew-resize ${align === 'left' ? 'justify-start' : 'justify-end'}`}
    >
      <div style={{ width: `${score * 10}%`, transition: isDragging.current ? 'none' : 'width 0.1s ease-out' }} 
           className={`h-full ${color === 'red' ? 'bg-red-500' : color === 'blue' ? 'bg-blue-500' : color === 'cyan' ? 'bg-cyan-400' : 'bg-slate-600'} opacity-80 pointer-events-none`} />
      <span className="absolute inset-0 flex items-center justify-center text-white font-black text-xs pointer-events-none drop-shadow-md">{score.toFixed(1)}</span>
    </div>
  );
}

function ResultBar({ score, align, theme }: any) {
  const hasData = score > 0;
  // theme 값에 따라 색상 결정 ('red', 'blue', 'slate')
  let barColor = 'bg-slate-600';
  if (theme === 'red') barColor = 'bg-red-500';
  else if (theme === 'blue') barColor = 'bg-blue-500';

  return (
    <div className={`flex-1 flex items-center gap-2 ${align === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
      <div className={`flex-1 h-2 bg-slate-800 rounded-full overflow-hidden flex ${align === 'left' ? 'justify-start' : 'justify-end'}`}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${hasData ? score * 10 : 0}%` }} transition={{ duration: 1, ease: "easeOut" }} className={`h-full ${hasData ? barColor : 'bg-transparent'}`} />
      </div>
      <div className={`w-10 h-6 flex items-center justify-center rounded-md ${hasData ? (theme === 'red' ? 'bg-red-500' : theme === 'blue' ? 'bg-blue-600' : 'bg-slate-700') : 'bg-slate-800'} shadow-md`}>
         <span className={`text-[11px] font-bold leading-none ${hasData ? 'text-white' : 'text-slate-500'}`}>{hasData ? score.toFixed(1) : '-'}</span>
      </div>
    </div>
  );
}

function DopamineRating({ score, isEditing, onChange }: any) {
  const starScore = score / 2; 
  const lastHapticRef = useRef(0);
  const triggerHaptic = () => {
    const now = Date.now();
    if (now - lastHapticRef.current > 50) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) { navigator.vibrate(5); }
      lastHapticRef.current = now;
    }
  };
  const handleClick = (e: any, val: number) => {
    e.stopPropagation();
    if (isEditing) { onChange(val); triggerHaptic(); }
  };
  return (
    <div className="flex flex-col items-center" onTouchStart={(e) => isEditing && e.stopPropagation()} onTouchEnd={(e) => isEditing && e.stopPropagation()}>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((idx) => (
          <div key={idx} className="relative w-6 h-6 cursor-pointer group" onClick={(e) => handleClick(e, idx * 2)}>
            <svg viewBox="0 0 24 24" className="w-full h-full text-slate-800 fill-current"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
            {starScore >= idx && <svg viewBox="0 0 24 24" className="absolute top-0 left-0 w-full h-full text-amber-400 fill-current drop-shadow-sm"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>}
            {starScore >= idx - 0.5 && starScore < idx && <div className="absolute top-0 left-0 w-1/2 h-full overflow-hidden"><svg viewBox="0 0 24 24" className="w-6 h-6 text-amber-400 fill-current drop-shadow-sm"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></div>}
          </div>
        ))}
      </div>
    </div>
  );
}