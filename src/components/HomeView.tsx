'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation'; 
import LoginButton from '@/components/LoginButton';
import { db, auth } from '@/lib/firebase';
import { collection, query, getDocs, where, doc, getDoc, setDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
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

export default function HomeView({ initialMatches, initialRosters }: { initialMatches: any[], initialRosters: any }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [allMatches, setAllMatches] = useState<any[]>(initialMatches || []);
  const [teamRosters, setTeamRosters] = useState<Record<string, string[]>>(initialRosters || {});
  
  const [currentTab, setCurrentTab] = useState(1);
  const TAB_NAMES = ['지난 경기', '오늘의 경기', '다가오는 경기'];
  
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  // ⭐ 1. 탭 변경 통합 함수 (클릭/스와이프 공용)
  // 탭을 바꿀 때: 스크롤 위로 + 카드 닫기 + URL 초기화
  const changeTab = (newTab: number) => {
    if (newTab < 0 || newTab > 2) return;
    setCurrentTab(newTab);
    setExpandedId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' }); // 스크롤 최상단
    router.replace('/', { scroll: false }); // URL 청소 (새로고침 없음)
  };

  // ⭐ 2. 카드 토글 통합 함수
  // 카드를 열/닫을 때: URL 업데이트 (새로고침 없음)
  const toggleCard = (matchId: string, isOpenNow: boolean) => {
    // isOpenNow: 현재 열려있는지 여부 (true면 닫아야 하고, false면 열어야 함)
    if (isOpenNow) {
        // 닫기
        setExpandedId(null);
        setIsScrolled(true); // 닫아도 스크롤 유지
        router.replace('/', { scroll: false }); 
    } else {
        // 열기
        setExpandedId(matchId);
        router.replace(`/?expanded=${matchId}`, { scroll: false });
    }
  };

  // ⭐ 3. URL 파라미터 감지 (초기 진입 & 뒤로가기 대응)
  useEffect(() => {
    const targetId = searchParams.get('expanded');
    
    if (targetId) {
        // URL에 ID가 있으면 -> 해당 탭으로 이동 & 카드 열기
        if (allMatches.length > 0) {
            const targetMatch = allMatches.find(m => m.id === targetId);
            if (targetMatch) {
                const kstToday = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"})).toISOString().split('T')[0];
                const matchDate = targetMatch.date.split(' ')[0];

                // 탭 결정
                if (matchDate < kstToday) setCurrentTab(0);
                else if (matchDate === kstToday) setCurrentTab(1);
                else setCurrentTab(2);
                
                setExpandedId(targetId);
            }
        }
    } else {
        // URL에 ID가 없으면 -> 카드 닫기 (뒤로가기 눌렀을 때 닫히는 효과)
        setExpandedId(null);
    }
  }, [searchParams, allMatches]);

  // 스크롤 감지
  useEffect(() => {
    const handleScroll = () => { setIsScrolled(window.scrollY > 0); };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 스와이프 로직
  const touchStartX = useRef(0);
  const touchStartY = useRef(0); 

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const distanceX = touchStartX.current - touchEndX;
    const distanceY = touchStartY.current - touchEndY;
    
    if (Math.abs(distanceY) > 30) return; // 위아래 스크롤이면 무시
    
    const minSwipeDistance = 80; 
    if (distanceX > minSwipeDistance) { 
        // 오른쪽으로 스와이프 (다음 탭)
        if (currentTab < 2) changeTab(currentTab + 1); 
    }
    else if (distanceX < -minSwipeDistance) { 
        // 왼쪽으로 스와이프 (이전 탭)
        if (currentTab > 0) changeTab(currentTab - 1); 
    }
  };

  const getFilteredMatches = () => {
    const safeMatches = Array.isArray(allMatches) ? allMatches : []; 
    const kstToday = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"})).toISOString().split('T')[0];
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
            {/* ⭐ changeTab 함수 사용 */}
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
                  // ⭐ toggleCard 함수 연결
                  onToggle={(isOpenNow: boolean) => toggleCard(match.id, isOpenNow)}
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

// ... MatchCard 및 하위 컴포넌트는 그대로 두시면 됩니다 ...
// (기존 코드에 있던 MatchCard, DopamineRating 등은 변경사항 없습니다)
// 다만, MatchCard 코드를 포함해야 한다면 아래에 이어서 붙여넣어주세요.
// 편의상 위쪽 HomeView만 교체해도 작동합니다.

function MatchCard({ match, homeRoster, awayRoster, isOpen, onToggle }: any) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hasParticipated, setHasParticipated] = useState(false); 
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [showTooltip, setShowTooltip] = useState(false);
  
  const [currentStats, setCurrentStats] = useState(match.stats || {});

  useEffect(() => {
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
  const homeScore = match.home.score || 0;
  const awayScore = match.away.score || 0;
  const isHomeWin = isFinished && homeScore > awayScore;
  const isAwayWin = isFinished && awayScore > homeScore;

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

    const validKeys = new Set([...homeRoster, ...awayRoster, FUN_KEY]);
    const cleanMyRatings: Record<string, number> = {};
    Object.keys(myRatings).forEach(key => {
        if (validKeys.has(key)) {
            cleanMyRatings[key] = myRatings[key];
        }
    });

    try {
      let finalStats: any = {};

      await runTransaction(db, async (transaction) => {
        const ratingDocRef = doc(db, "matchRatings", `${user.uid}_${match.id}`);
        const matchDocRef = doc(db, "matches", match.id);

        const ratingDoc = await transaction.get(ratingDocRef);
        const matchDoc = await transaction.get(matchDocRef);

        if (!matchDoc.exists()) throw "Match does not exist!";

        const currentDbStats = matchDoc.data().stats || {};
        const newStats = JSON.parse(JSON.stringify(currentDbStats)); 
        
        const oldRatings = ratingDoc.exists() ? ratingDoc.data().ratings : {};

        const submitData: Record<string, any> = {};
        Object.entries(cleanMyRatings).forEach(([name, score]) => { 
            submitData[name] = { score, comment: "" }; 
        });

        Object.keys(cleanMyRatings).forEach(key => {
            const newScore = Number(cleanMyRatings[key]);
            const oldScoreData = oldRatings[key]; 
            const oldScore = oldScoreData ? Number(oldScoreData.score) : undefined;

            if (!newStats[key]) {
                newStats[key] = { sum: 0, count: 0 };
            }

            if (newStats[key].sum <= 0.1) {
                newStats[key].sum = 0;
                newStats[key].count = 0;
            }

            const isFreshStart = newStats[key].count === 0;

            if (oldScore !== undefined && !isFreshStart) {
                newStats[key].sum = newStats[key].sum - oldScore + newScore;
            } else {
                newStats[key].sum += newScore;
                newStats[key].count += 1;
            }
            
            if (newStats[key].sum < 0) newStats[key].sum = 0;
        });

        finalStats = newStats;

        transaction.set(ratingDocRef, {
            userId: user.uid, 
            matchId: match.id, 
            matchInfo: `${match.home.name} vs ${match.away.name}`, 
            ratings: submitData, 
            createdAt: serverTimestamp(),
        });

        transaction.set(matchDocRef, { stats: newStats }, { merge: true });
      });

      alert("평점이 반영되었습니다!");
      setIsEditing(false);
      setHasParticipated(true);
      
      setCurrentStats(finalStats);

    } catch (e) { 
        console.error("Transaction failed: ", e); 
        alert("제출 실패 (잠시 후 다시 시도해주세요)"); 
    }
  };

  const handleRatingChange = (name: string, val: number) => { setMyRatings(prev => ({ ...prev, [name]: val })); };

  const handleDownload = async (e: any) => {
    e.stopPropagation();
    if (!cardRef.current) return;
    cardRef.current.classList.add('download-mode'); 
    await document.fonts.ready; 
    const images = cardRef.current.getElementsByTagName('img');
    const originalSrcs: string[] = [];
    const promises: Promise<void>[] = [];
    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        originalSrcs[i] = img.src; 
        const src = img.src;
        if (src && !src.startsWith('data:') && !src.includes('localhost') && !src.includes(window.location.host)) {
             const proxyUrl = getProxyImgUrl(src);
             img.crossOrigin = "anonymous"; 
             img.src = proxyUrl; 
             promises.push(new Promise((resolve) => {
                 if (img.complete) resolve();
                 else { img.onload = () => resolve(); img.onerror = () => resolve(); }
             }));
        }
    }
    await Promise.all(promises);
    try {
        const dataUrl = await htmlToImage.toPng(cardRef.current, { backgroundColor: '#020617', pixelRatio: 2, skipAutoScale: true });
        if (navigator.share) {
            const blob = dataURItoBlob(dataUrl);
            const file = new File([blob], `rating.png`, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
                try { await navigator.share({ files: [file], title: '협곡평점.GG', text: '내 경기 평점을 확인해보세요!', }); return; } catch (shareError) { console.log('Share cancelled', shareError); }
            }
        }
        const link = document.createElement('a');
        link.download = `협곡평점_${match.home.name}_vs_${match.away.name}.png`;
        link.href = dataUrl;
        link.click();
    } catch(err) { console.error("Image generation failed:", err); alert("이미지 저장에 실패했습니다."); } finally {
        for (let i = 0; i < images.length; i++) { images[i].src = originalSrcs[i]; images[i].removeAttribute('crossOrigin'); }
        cardRef.current.classList.remove('download-mode');
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
      <style jsx global>{`
        .download-mode .hide-on-download { display: none !important; }
        .download-mode .team-name-text { display: none !important; }
        .download-mode .team-logo-img { margin-bottom: 5px; } 
      `}</style>

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
            <motion.div animate={{ height: isOpen ? 0 : 'auto', opacity: isOpen ? 0 : 1 }} className="overflow-hidden team-name-text">
                <div className="h-10 flex items-center justify-center"><span className="text-sm font-bold text-white leading-tight uppercase px-1">{match.home.name}</span></div>
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
            <motion.div animate={{ height: isOpen ? 0 : 'auto', opacity: isOpen ? 0 : 1 }} className="overflow-hidden team-name-text">
                <div className="h-10 flex items-center justify-center"><span className="text-sm font-bold text-white leading-tight uppercase px-1">{match.away.name}</span></div>
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} layout className={`overflow-hidden mx-4 mb-4 rounded-[2rem] border-y transition-colors duration-500 cursor-default ${isEditing ? 'bg-black/20 border-indigo-500/30' : 'bg-slate-950/30 border-slate-800/50'}`} onClick={(e) => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              {POSITIONS.map((pos, idx) => {
                const hp = homeRoster[idx];
                const ap = awayRoster[idx];
                const hScore = isEditing ? (myRatings[hp] ?? 0) : (averages[hp] ?? 0);
                const aScore = isEditing ? (myRatings[ap] ?? 0) : (averages[ap] ?? 0);
                
                const hName = formatPlayerName(hp, match.home.name);
                const aName = formatPlayerName(ap, match.away.name);

                return (
                  <div key={pos} className="flex flex-col gap-1">
                    <div className="flex justify-between px-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                      <span className="truncate w-20">{hName}</span>
                      <span className="truncate w-20 text-right">{aName}</span>
                    </div>
                    <motion.div layout className="flex items-center gap-3 h-10 relative">
                      {isEditing ? <InteractiveBar score={hScore} align="left" color="cyan" onChange={(v:number) => handleRatingChange(hp, v)} /> : <ResultBar score={hScore} align="left" theme={homeTheme} />}
                      <div className="w-6 flex justify-center opacity-60"><img src={POS_ICONS[pos]} alt={pos} className="w-4 h-4 object-contain" /></div>
                      {isEditing ? <InteractiveBar score={aScore} align="right" color="red" onChange={(v:number) => handleRatingChange(ap, v)} /> : <ResultBar score={aScore} align="right" theme={awayTheme} />}
                    </motion.div>
                  </div>
                );
              })}
              <div className="pt-2 pb-2">
                <div className="flex flex-col items-center gap-1">
                   <div className="flex items-center gap-2">
                     <span className="text-xs font-black text-amber-400 tracking-wider whitespace-nowrap">⚡ 도파민 지수</span>
                     <span className="text-sm font-black text-amber-300 italic">{(funScore/2).toFixed(1)} <span className="text-[10px] text-slate-500 not-italic">/ 5.0</span></span>
                     <button onClick={() => setShowTooltip(!showTooltip)} className="w-4 h-4 rounded-full border border-slate-600 text-slate-500 text-[9px] flex items-center justify-center hover:bg-slate-700 hover:text-white transition-colors hide-on-download">?</button>
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
                  <div className="flex gap-2 items-center hide-on-download">
                    <div className="flex-1 flex gap-2">
                        <button onClick={handleStartEdit} className="flex-1 py-3 border border-white/20 bg-white/5 backdrop-blur-md text-white rounded-xl font-black text-[10px] uppercase shadow-[0_4px_30px_rgba(0,0,0,0.1)] hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center gap-1"><span>{hasParticipated ? '✏️' : '🫠'}</span><span>{hasParticipated ? '평점 수정' : '내 평점 등록'}</span></button>
                        <button onClick={(e) => { e.stopPropagation(); router.push(`/match/${match.id}`); }} className="flex-1 py-3 border border-white/10 bg-white/5 backdrop-blur-sm text-cyan-300 rounded-xl font-bold text-[10px] uppercase shadow-[0_4px_30px_rgba(0,0,0,0.1)] hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center gap-1"><span>💬</span> 리뷰</button>
                    </div>
                    <button onClick={handleDownload} className="w-5 h-5 flex items-center justify-center active:scale-95 transition-all"><img src="/icons/download.png" className="w-full h-full object-contain opacity-80 hover:opacity-100" alt="download" /></button>
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
         <span className={`text-[11px] font-bold leading-none ${hasData ? 'text-white' : 'text-slate-500'}`}>{hasData ? score.toFixed(1) : '-'}</span>
      </div>
    </div>
  );
}

function InteractiveBar({ score, align, color, onChange }: any) {
  const barColor = color === 'cyan' ? 'bg-cyan-400' : 'bg-red-400';
  const rotationClass = align === 'right' ? 'rotate-180' : ''; 
  const lastHapticRef = useRef(0);
  const triggerHaptic = () => {
    const now = Date.now();
    if (now - lastHapticRef.current > 50) { 
      if (typeof navigator !== 'undefined' && navigator.vibrate) { navigator.vibrate(5); }
      lastHapticRef.current = now;
    }
  };
  const handleChange = (e: any) => {
    const newVal = parseFloat(e.target.value);
    onChange(newVal);
    triggerHaptic(); 
  };
  return (
    <div className={`flex-1 flex items-center gap-2 ${align === 'left' ? 'flex-row' : 'flex-row-reverse'} relative group`}>
      <div className={`flex-1 h-8 bg-slate-800 rounded-lg overflow-hidden relative flex items-center ${align === 'left' ? 'justify-start' : 'justify-end'}`}>
        <div style={{ width: `${score * 10}%` }} className={`h-full ${barColor} opacity-80`} />
        <div className={`absolute inset-0 flex items-center justify-center z-10 pointer-events-none`}>
          <span className="text-white font-black text-xs drop-shadow-md tracking-wider leading-none">{score.toFixed(1)}</span>
        </div>
        <input type="range" min="0" max="10" step="0.1" value={score} onChange={handleChange} className={`absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20 touch-none ${rotationClass}`} />
      </div>
    </div>
  );
}