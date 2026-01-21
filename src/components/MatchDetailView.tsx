'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from "@/lib/firebase"; 
import { doc, getDoc, collection, query, where, getDocs, setDoc, addDoc, deleteDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp, orderBy, limit, startAfter, runTransaction, onSnapshot, increment } from "firebase/firestore";
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import Footer from '@/components/Footer';
import * as htmlToImage from 'html-to-image'; 

const APP_ID = 'lck-2026-app';
const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];
const ADMIN_EMAILS = ['ggt3944@gmail.com', 'hyeoppyeong.official@gmail.com']; 

const POS_ICONS: Record<string, string> = {
  'TOP': '/icons/top.png', 'JGL': '/icons/jungle.png', 'MID': '/icons/middle.png', 'ADC': '/icons/bottom.png', 'SUP': '/icons/support.png'
};

// Icons
const ShareIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>);
const TrashIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>);
const EditIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>);
const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={filled ? "text-red-500" : "text-slate-500"}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
  </svg>
);

const dataURItoBlob = (dataURI: string) => {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: mimeString });
};

const getProxiedImageUrl = (url: string) => {
  if (!url) return "";
  if (url.includes('wsrv.nl') || url.startsWith('data:') || url.startsWith('/')) return url;
  const cleanUrl = url.replace(/^https?:\/\//, '');
  return `https://wsrv.nl/?url=${cleanUrl}&output=png`;
};

interface Props {
  matchData: any;
  initialRosters: { home: Record<string, any[]>, away: Record<string, any[]> };
  initialAvgRatings: any; 
  initialComments: any[];
}

export default function MatchDetailView({ matchData, initialRosters }: Props) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  const router = useRouter();
  const matchId = String(matchData.id);

  const [liveMatchData, setLiveMatchData] = useState(matchData);
  const games = Array.isArray(liveMatchData.games) ? liveMatchData.games : [];
  const displayGames = games.length > 0 ? games : [{ id: 1, position: 1 }]; 
  const [activeGameIndex, setActiveGameIndex] = useState(1); 
  const activeGameId = displayGames[activeGameIndex - 1]?.id || activeGameIndex;

  const [activePosIndex, setActivePosIndex] = useState(0); 
  const [selectedTeamSide, setSelectedTeamSide] = useState<'home' | 'away'>('home'); 
  const [userSelection, setUserSelection] = useState<Record<string, number>>({});

  const [stats, setStats] = useState(matchData.stats || { games: {}, total: {} });
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
      const unsub = onSnapshot(doc(db, 'artifacts', APP_ID, 'public', 'data', 'matches', matchId), (doc) => {
          if (doc.exists()) {
              const data = doc.data();
              setStats(data.stats || { games: {}, total: {} });
              setLiveMatchData({ ...data, id: doc.id });
          }
      });
      return () => unsub();
  }, [matchId]);

  useEffect(() => {
     if (!isMounted) return;
     const fetchMyData = async () => {
        const user = auth.currentUser;
        if (user) {
          try {
            const snap = await getDoc(doc(db, "matchRatings", `${user.uid}_${matchId}`));
            if (snap.exists()) {
                const data = snap.data();
                const gameKey = String(activeGameId);
                const loadedRatings = data.ratings?.games?.[gameKey] || {};
                setMyRatings(loadedRatings);
            } else {
                setMyRatings({});
            }
          } catch(e) { console.error(e); }
        } else {
            setMyRatings({});
        }
     };
     fetchMyData();
  }, [matchId, activeGameId, isMounted]);

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -50) { 
        if (activePosIndex < 4) setActivePosIndex(prev => prev + 1);
    } else if (info.offset.x > 50) { 
        if (activePosIndex > 0) setActivePosIndex(prev => prev - 1);
    }
  };

  const currentGame = displayGames[activeGameIndex - 1];
  const checkIsWinnerGame = (teamId: number) => currentGame?.finished && Number(currentGame.winner_id) === Number(teamId);
  const isHomeWinGame = checkIsWinnerGame(liveMatchData.home.id);
  const isAwayWinGame = checkIsWinnerGame(liveMatchData.away.id);

  const getTeamTheme = (side: 'home' | 'away') => {
    if (!currentGame?.finished) return 'slate';
    if (side === 'home') return isHomeWinGame ? 'red' : 'blue';
    return isAwayWinGame ? 'red' : 'blue';
  };

  const currentTheme = getTeamTheme(selectedTeamSide);
  const currentPos = POSITIONS[activePosIndex];

  // ⭐ 뒤로가기 로직 수정: 'expanded'를 제거하고 'focus' 파라미터 사용
  // 이렇게 해야 홈 화면이 Detail View를 다시 렌더링하지 않고 List View를 보여줍니다.
  const handleGoBack = () => {
      router.push(`/?expanded=${matchId}`);
  };

  const handleRatingUpdate = (playerName: string, newScore: number) => {
      setMyRatings(prev => ({ ...prev, [playerName]: newScore }));
      setRefreshTrigger(prev => prev + 1);
  };

  if (!isMounted) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading...</div>;

  return (
    <div className="bg-[#0a0a0c] min-h-screen text-slate-50 font-sans pb-32">
      <div className="fixed top-0 left-0 w-full h-full bg-gradient-to-b from-[#111113] to-[#050505] pointer-events-none" />

      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0a0a0c]/90 backdrop-blur-md border-b border-white/5 shadow-xl">
        <div className="max-w-md mx-auto">
            <div className="relative flex items-center justify-center py-1.5 border-b border-white/5 min-h-[44px]">
                <button onClick={handleGoBack} className="absolute left-3 w-7 h-7 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors text-slate-400 z-10">←</button>
                <div className="flex gap-1 overflow-x-auto no-scrollbar mask-gradient-r px-10">
                    {displayGames.map((g: any, idx: number) => {
                        const isActive = activeGameIndex === idx + 1;
                        return (
                            <button key={g.id} onClick={() => setActiveGameIndex(idx + 1)} className="relative px-3 py-1 rounded-lg transition-all group shrink-0">
                                <span className={`text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-400'}`}>Game {idx + 1}</span>
                                {isActive && <motion.div layoutId="activeTab" className="absolute bottom-0 inset-x-3 h-0.5 bg-cyan-400 rounded-full" />}
                            </button>
                        )
                    })}
                </div>
            </div>
            <div className="flex items-center justify-between px-4 py-1.5">
                <button onClick={() => setSelectedTeamSide('home')} className={`flex items-center gap-2 transition-all duration-300 ${selectedTeamSide === 'home' ? 'opacity-100' : 'opacity-40 grayscale'}`}>
                    <img src={getProxiedImageUrl(liveMatchData.home.logo)} className="w-8 h-8 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
                    <span className={`text-xl font-black italic tracking-tighter ${selectedTeamSide === 'home' ? 'text-white' : 'text-slate-600'}`}>{liveMatchData.home.score}</span>
                </button>
                <div className="flex gap-1">
                    {POSITIONS.map((pos, idx) => {
                        const isActive = activePosIndex === idx;
                        return (
                            <button key={pos} onClick={() => setActivePosIndex(idx)} className="relative w-8 h-8 flex items-center justify-center transition-all">
                                <img src={POS_ICONS[pos]} alt={pos} className={`w-4 h-4 object-contain transition-all duration-300 ${isActive ? 'opacity-100 scale-125 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]' : 'opacity-20 grayscale'}`} />
                                {isActive && <div className="absolute inset-0 bg-white/5 rounded-lg -z-10 shadow-inner" />}
                            </button>
                        );
                    })}
                </div>
                <button onClick={() => setSelectedTeamSide('away')} className={`flex items-center gap-2 transition-all duration-300 ${selectedTeamSide === 'away' ? 'opacity-100' : 'opacity-40 grayscale'}`}>
                    <span className={`text-xl font-black italic tracking-tighter ${selectedTeamSide === 'away' ? 'text-white' : 'text-slate-600'}`}>{liveMatchData.away.score}</span>
                    <img src={getProxiedImageUrl(liveMatchData.away.logo)} className="w-8 h-8 object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
                </button>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-md mx-auto px-4 pt-4 relative z-10">
        <AnimatePresence mode="wait">
            <motion.div
                key={`${activeGameIndex}-${selectedTeamSide}-${activePosIndex}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.1} onDragEnd={handleDragEnd} className="touch-pan-y"
            >
                <PositionSection 
                    pos={currentPos}
                    matchId={matchId}
                    gameId={activeGameId}
                    gameIndex={activeGameIndex}
                    matchData={liveMatchData}
                    homePlayers={initialRosters.home[currentPos] || []}
                    awayPlayers={initialRosters.away[currentPos] || []}
                    selectedSide={selectedTeamSide}
                    cardTheme={currentTheme}
                    gameStats={stats.games?.[String(activeGameId)] || {}}
                    myRatings={myRatings} 
                    onRatingUpdate={handleRatingUpdate} 
                    userSelection={userSelection}
                    setUserSelection={setUserSelection}
                    refreshTrigger={refreshTrigger} 
                />
            </motion.div>
        </AnimatePresence>
        <Footer />
      </div>
    </div>
  );
}

function PositionSection({ pos, matchId, gameId, gameIndex, matchData, homePlayers, awayPlayers, selectedSide, cardTheme, gameStats, myRatings, onRatingUpdate, userSelection, setUserSelection, refreshTrigger }: any) {
    const players = selectedSide === 'home' ? homePlayers : awayPlayers;
    const opponentPlayers = selectedSide === 'home' ? awayPlayers : homePlayers;
    const teamData = selectedSide === 'home' ? matchData.home : matchData.away;
    const opponentTeamData = selectedSide === 'home' ? matchData.away : matchData.home;

    const isMulti = players.length > 1;
    const selectionKey = `${gameId}-${pos}-${selectedSide}`; 
    const pinnedKey = `pinned_${selectedSide}_${pos}`; 

    const currentGameData = matchData.games?.find((g: any) => String(g.id) === String(gameId));
    const serverPinnedId = currentGameData?.active_players?.[pinnedKey];

    let activeIdx = 0;
    if (userSelection[selectionKey] !== undefined) activeIdx = userSelection[selectionKey];
    else if (serverPinnedId) {
        const pinnedIdx = players.findIndex((p: any) => String(p.id) === String(serverPinnedId));
        if (pinnedIdx !== -1) activeIdx = pinnedIdx;
    }

    const [isExpanded, setIsExpanded] = useState(!isMulti || userSelection[selectionKey] !== undefined || serverPinnedId); 
    const activePlayer = players[activeIdx] || { name: 'Unknown', id: 0 };
    
    const oppPinnedKey = `pinned_${selectedSide === 'home' ? 'away' : 'home'}_${pos}`;
    const oppPinnedId = currentGameData?.active_players?.[oppPinnedKey];
    const oppIdx = oppPinnedId ? opponentPlayers.findIndex((p: any) => String(p.id) === String(oppPinnedId)) : 0;
    const opponentPlayer = opponentPlayers[oppIdx !== -1 ? oppIdx : 0] || { name: 'Unknown', id: 0 };

    const getAvg = (pName: string) => {
        const stat = gameStats[pName];
        return stat && stat.count > 0 ? stat.sum / stat.count : 0;
    };

    const handleSelectPlayer = (idx: number) => {
        setUserSelection((prev: any) => ({ ...prev, [selectionKey]: idx }));
        setIsExpanded(true);
    };

    const user = auth.currentUser;
    const isAdmin = user && user.email && ADMIN_EMAILS.includes(user.email);

    const handleAdminPin = async () => {
        if (!confirm(`'${activePlayer.name}' 선수를 고정하시겠습니까?`)) return;
        try {
            await runTransaction(db, async (transaction) => {
                const matchRef = doc(db, "artifacts", APP_ID, 'public', 'data', 'matches', String(matchId));
                const mDoc = await transaction.get(matchRef);
                if (!mDoc.exists()) return;
                const data = mDoc.data();
                const games = data.games || [];
                const targetGameIdx = games.findIndex((g: any) => String(g.id) === String(gameId));
                if (targetGameIdx === -1) return;
                const targetGame = games[targetGameIdx];
                const newActivePlayers = { ...(targetGame.active_players || {}), [pinnedKey]: activePlayer.id };
                games[targetGameIdx] = { ...targetGame, active_players: newActivePlayers };
                transaction.update(matchRef, { games: games });
            });
            alert("고정 완료!");
        } catch(e) { console.error(e); alert("고정 실패"); }
    };

    useEffect(() => { 
        if (isMulti && userSelection[selectionKey] === undefined && !serverPinnedId) setIsExpanded(false); 
        else setIsExpanded(true);
    }, [selectedSide, isMulti, gameId]);

    const currentMyScore = myRatings[activePlayer.name] || 0;
    const opponentAvg = getAvg(opponentPlayer.name);

    return (
        <div className="space-y-4">
            {isMulti && !isExpanded && (
                <div className="grid grid-cols-2 gap-3">
                    {players.map((p: any, idx: number) => (
                        <div key={p.id} onClick={() => handleSelectPlayer(idx)} className="bg-white/10 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex items-center gap-3 cursor-pointer hover:border-cyan-500/50 hover:bg-white/20 transition-all">
                            <img src={getProxiedImageUrl(p.image)} className="w-10 h-10 rounded-full bg-black/50 object-cover" />
                            <div><div className="text-sm font-bold text-white">{p.name}</div></div>
                        </div>
                    ))}
                </div>
            )}

            {isExpanded && (
                <div className="relative">
                    <div className="flex justify-end items-center gap-2 mb-2 mr-2">
                        {isAdmin && isMulti && <button onClick={handleAdminPin} className="text-[10px] text-amber-400 font-bold bg-amber-950/40 px-2 py-1 rounded-full border border-amber-500/30">📌 고정</button>}
                        {isMulti && <button onClick={() => setIsExpanded(false)} className="text-[10px] text-cyan-400 font-bold hover:underline flex items-center gap-1 bg-cyan-950/40 px-3 py-1 rounded-full border border-cyan-500/30 shadow-lg"><span>Change Player</span> ↺</button>}
                    </div>
                    
                    <ExpandedCard 
                        matchId={matchId} gameId={gameId} gameIndex={gameIndex} pos={pos}
                        mainPlayer={activePlayer} subPlayer={opponentPlayer} mainTeam={teamData} subTeam={opponentTeamData}
                        theme={cardTheme} avgRating={getAvg(activePlayer.name)} opponentAvg={opponentAvg} 
                        myScore={currentMyScore}
                        onUpdateMyRating={onRatingUpdate}
                        refreshTrigger={refreshTrigger}
                    />
                </div>
            )}
        </div>
    );
}

function ExpandedCard({ matchId, gameId, gameIndex, pos, mainPlayer, subPlayer, mainTeam, subTeam, theme, avgRating, opponentAvg, myScore, onUpdateMyRating, refreshTrigger }: any) {
    const cardRef = useRef<HTMLDivElement>(null);

    let comparisonColor = 'blue'; 
    if (avgRating > 0 && opponentAvg > 0) comparisonColor = avgRating >= opponentAvg ? 'red' : 'blue';
    else comparisonColor = theme === 'red' ? 'red' : 'blue';

    const badgeStyle = comparisonColor === 'red' ? 'bg-red-500 text-white shadow-red-500/40' : (comparisonColor === 'blue' ? 'bg-blue-500 text-white shadow-blue-500/40' : 'bg-slate-700 text-slate-300');
    
    let oppCompColor = 'slate';
    if (avgRating > 0 && opponentAvg > 0) oppCompColor = opponentAvg > avgRating ? 'red' : 'blue';
    const oppBadgeStyle = oppCompColor === 'red' ? 'bg-red-500 text-white' : (oppCompColor === 'blue' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300');

    let resultText = "";
    let resultColor = "text-slate-500";
    if (theme === 'red') { resultText = "승"; resultColor = "text-red-500"; }
    else if (theme === 'blue') { resultText = "패"; resultColor = "text-blue-500"; }
    
    const infoText = `Game ${gameIndex} · ${mainTeam.code}`;

    const handleShare = async () => {
        if (!cardRef.current) return;
        try {
            const dataUrl = await htmlToImage.toPng(cardRef.current, { backgroundColor: '#0a0a0c', pixelRatio: 2, cacheBust: true });
            const blob = dataURItoBlob(dataUrl);
            const file = new File([blob], 'card.png', { type: 'image/png' });
            if (navigator.share) await navigator.share({ files: [file] });
        } catch (e) { alert("Share failed"); }
    };

    return (
        <div className="space-y-6">
            <div ref={cardRef} className="relative p-2 pb-6">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-5 flex-1">
                        <div className="relative group">
                            <img src={getProxiedImageUrl(mainPlayer.image)} className="relative w-20 h-20 rounded-2xl bg-[#1a1a1d] object-cover shadow-2xl" />
                            <div className={`absolute -bottom-3 left-1/2 -translate-x-1/2 ${badgeStyle} font-black text-xs px-2.5 py-0.5 rounded-lg border border-white/10 shadow-lg z-10 whitespace-nowrap`}>
                                {avgRating.toFixed(1)}
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <div className="text-[10px] font-bold uppercase tracking-widest mb-1 text-slate-500">
                                {infoText} <span className={resultColor}>{resultText}</span>
                            </div>
                            <div className="text-2xl font-black text-white italic uppercase tracking-tighter leading-none drop-shadow-md mb-0.5">{mainPlayer.name}</div>
                            <div className={`text-[10px] font-bold uppercase tracking-widest text-slate-500`}>{pos}</div>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-3 pl-2">
                        <button onClick={handleShare} className="text-slate-600 hover:text-white transition-colors"><ShareIcon /></button>
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-bold text-slate-600 mb-0.5">MATCHUP</span>
                            <div className="flex items-center gap-2 relative">
                                <span className="text-[9px] font-bold text-slate-500">{subPlayer.name}</span>
                                <div className="relative">
                                    <img src={getProxiedImageUrl(subPlayer.image)} className="w-8 h-8 rounded-full bg-[#1a1a1d] object-cover border border-white/5 opacity-70 grayscale" />
                                    <div className={`absolute -bottom-1 -right-1 ${oppBadgeStyle} text-[8px] font-black px-1 rounded border border-white/10 scale-90`}>
                                        {opponentAvg.toFixed(1)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">평점 등록하기</div>
                <SimpleRatingBar 
                    matchId={matchId} gameId={gameId} gameIndex={gameIndex} 
                    playerName={mainPlayer.name} initialScore={myScore} onUpdate={onUpdateMyRating} 
                    theme={comparisonColor} 
                />
            </div>

            <CommentSection 
                matchId={matchId} gameId={gameId} gameIndex={gameIndex} 
                playerName={mainPlayer.name} userRating={myScore} refreshTrigger={refreshTrigger}
                opponentAvg={opponentAvg} teamTheme={theme}
            />
        </div>
    );
}

function SimpleRatingBar({ matchId, gameId, gameIndex, playerName, initialScore, onUpdate, theme }: any) {
    const [score, setScore] = useState(0.0);
    const [status, setStatus] = useState<'IDLE' | 'SAVING' | 'DONE'>('IDLE');
    useEffect(() => { 
        if (initialScore > 0) { setScore(initialScore); setStatus('DONE'); } 
        else { setScore(0.0); setStatus('IDLE'); }
    }, [initialScore, playerName, gameId]);

    const handleSave = async () => {
        const user = auth.currentUser;
        if (!user) return alert("로그인이 필요합니다.");
        setStatus('SAVING');
        try {
            await runTransaction(db, async (transaction) => {
                const ratingRef = doc(db, "matchRatings", `${user.uid}_${matchId}`);
                const matchRef = doc(db, "artifacts", APP_ID, 'public', 'data', 'matches', String(matchId));
                const commentId = `${matchId}_${gameId}_${playerName}_${user.uid}`;
                const commentRef = doc(db, "matchComments", commentId);

                const matchDoc = await transaction.get(matchRef);
                const ratingDoc = await transaction.get(ratingRef);
                const commentDoc = await transaction.get(commentRef);

                const currentStats = matchDoc.data()?.stats || { games: {}, total: {} };
                const oldRatings = ratingDoc.exists() ? ratingDoc.data().ratings : { games: {} };
                const gameKey = String(gameId);
                const newStats = JSON.parse(JSON.stringify(currentStats));
                if (!newStats.games) newStats.games = {}; if (!newStats.games[gameKey]) newStats.games[gameKey] = {};
                const oldScore = oldRatings.games?.[gameKey]?.[playerName];
                if (oldScore !== undefined && newStats.games[gameKey][playerName]) {
                    newStats.games[gameKey][playerName].sum -= oldScore;
                    newStats.games[gameKey][playerName].count--;
                }
                if (!newStats.games[gameKey][playerName]) newStats.games[gameKey][playerName] = { sum: 0, count: 0 };
                newStats.games[gameKey][playerName].sum += score;
                newStats.games[gameKey][playerName].count++;
                
                const newMyRatings = { ...oldRatings };
                if (!newMyRatings.games) newMyRatings.games = {}; if (!newMyRatings.games[gameKey]) newMyRatings.games[gameKey] = {};
                newMyRatings.games[gameKey][playerName] = score;

                transaction.set(ratingRef, { userId: user.uid, matchId, ratings: newMyRatings, createdAt: serverTimestamp() }, { merge: true });
                transaction.update(matchRef, { stats: newStats });

                if (commentDoc.exists()) transaction.update(commentRef, { rating: score });
            });
            onUpdate(playerName, score);
            setStatus('DONE');
        } catch (e) { console.error(e); setStatus('IDLE'); }
    };

    const barColor = theme === 'red' ? 'bg-red-500 shadow-red-500/50' : theme === 'blue' ? 'bg-blue-500 shadow-blue-500/50' : 'bg-slate-500 shadow-slate-500/50';

    return (
        <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex-1 relative h-10 bg-black/40 rounded-xl overflow-hidden touch-none shadow-inner border border-white/5">
                <input type="range" min="0" max="10" step="0.5" value={score} onChange={(e) => { setScore(parseFloat(e.target.value)); if (status === 'DONE') setStatus('IDLE'); }} className="w-full h-full opacity-0 absolute z-20 cursor-pointer" />
                <div className="absolute inset-0 pointer-events-none"><div className={`h-full transition-all duration-100 ${barColor}`} style={{ width: `${score * 10}%` }} /></div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-white font-black text-lg italic drop-shadow-md">{score.toFixed(1)}</span></div>
            </div>
            {/* ⭐ Updated Button Style: Gray Background */}
            <button onClick={handleSave} disabled={status === 'SAVING' || status === 'DONE'} className={`w-16 h-10 rounded-xl font-bold text-xs transition-all flex items-center justify-center ${status === 'DONE' ? 'bg-white/10 text-green-400' : 'bg-white/10 text-white hover:bg-white/20 active:scale-95 disabled:opacity-50'}`}>
                {status === 'SAVING' ? '...' : (status === 'DONE' ? '완료' : '등록')}
            </button>
        </div>
    );
}

// ----------------------------------------------------------------------
// Comment Section
// ----------------------------------------------------------------------
function CommentSection({ matchId, gameId, gameIndex, playerName, userRating, refreshTrigger, opponentAvg, teamTheme }: any) {
  const [recentComments, setRecentComments] = useState<any[]>([]);
  const [bestComments, setBestComments] = useState<any[]>([]);
  const [limitCount, setLimitCount] = useState(5); 
  const [inputVal, setInputVal] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null); 
  const user = auth.currentUser;

  useEffect(() => {
      const q = query(collection(db, "matchComments"), where("matchId", "==", matchId), where("gameId", "==", String(gameId)), where("playerName", "==", playerName), orderBy("likes", "desc"), limit(3));
      getDocs(q).then(snap => setBestComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(c => c.likes > 0))).catch(e => console.log("Index needed?", e));
  }, [matchId, gameId, playerName, refreshTrigger]);

  useEffect(() => {
      const q = query(collection(db, "matchComments"), where("matchId", "==", matchId), where("gameId", "==", String(gameId)), where("playerName", "==", playerName), orderBy("createdAt", "desc"), limit(limitCount));
      getDocs(q).then(snap => setRecentComments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [matchId, gameId, playerName, refreshTrigger, limitCount]);

  const hasRated = userRating > 0;
  const myComment = recentComments.find(c => c.userId === user?.uid) || bestComments.find(c => c.userId === user?.uid);
  const hasWritten = !!myComment;
  const isInputDisabled = !hasRated || isSubmitting || (hasWritten && !isEditing);

  const handleSubmit = async () => {
      if (!user) return alert("로그인이 필요합니다.");
      if (!hasRated) return alert("평점을 먼저 매겨주세요!");
      if (!inputVal.trim()) return;
      setIsSubmitting(true);
      try {
          const docId = `${matchId}_${gameId}_${playerName}_${user.uid}`;
          await setDoc(doc(db, "matchComments", docId), {
              userId: user.uid, userName: user.email?.split('@')[0], matchId, gameId: String(gameId), gameIndex, playerName, content: inputVal, rating: userRating || 0, parentId: null, createdAt: serverTimestamp()
          }, { merge: true });
          
          setInputVal("");
          setIsEditing(false); 
          setLimitCount(5); 
          const q = query(collection(db, "matchComments"), where("matchId", "==", matchId), where("gameId", "==", String(gameId)), where("playerName", "==", playerName), orderBy("createdAt", "desc"), limit(limitCount));
          getDocs(q).then(snap => setRecentComments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      } catch (e) { console.error(e); alert("등록 실패"); } finally { setIsSubmitting(false); }
  };

  const handleEditClick = (content: string) => {
      setInputVal(content);
      setIsEditing(true);
      setTimeout(() => inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  };

  const handleLike = async (comment: any) => {
      if (!user) return alert("로그인이 필요합니다.");
      const isLiked = comment.likedBy?.includes(user.uid);
      try {
          await updateDoc(doc(db, "matchComments", comment.id), { likes: isLiked ? increment(-1) : increment(1), likedBy: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
      } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
      if (!confirm("삭제하시겠습니까?")) return;
      try { await deleteDoc(doc(db, "matchComments", id)); setLimitCount(prev => prev); setIsEditing(false); setInputVal(""); } catch(e) { alert("삭제 실패"); }
  };

  const bestIds = new Set(bestComments.map(c => c.id));
  const filteredRecent = recentComments.filter(c => !bestIds.has(c.id));

  return (
      <div className="space-y-6 pt-2">
          {bestComments.length > 0 && (
              <div className="space-y-2">
                  <div className="text-[10px] font-bold text-amber-400 uppercase tracking-widest px-2 flex items-center gap-1"><span>🏆 BEST REVIEWS</span></div>
                  <div className="grid gap-2">{bestComments.map(c => <CommentItem key={`best-${c.id}`} comment={c} user={user} isBest={true} onLike={() => handleLike(c)} opponentAvg={opponentAvg} teamTheme={teamTheme} onEdit={() => handleEditClick(c.content)} />)}</div>
              </div>
          )}

          <div className={`bg-white/5 rounded-2xl p-3 backdrop-blur-md transition-opacity ${isInputDisabled ? 'opacity-50' : 'opacity-100'}`}>
              <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2 px-1">
                  <span>{isEditing ? '리뷰 수정하기' : '리뷰하기'}</span>
                  <span className={inputVal.length > 100 ? 'text-red-500' : 'text-slate-500'}>{inputVal.length}/100</span>
              </div>
              <div className="flex gap-2 items-end">
                  <textarea 
                    ref={inputRef}
                    value={inputVal} 
                    onChange={(e) => setInputVal(e.target.value.slice(0, 100))} 
                    placeholder={!hasRated ? "먼저 평점을 매겨주세요!" : (hasWritten && !isEditing ? "Game 의 코멘트는 선수 당 한 개 씩만 남길 수 있어요!" : "선수의 플레이에 대한 코멘트를 남겨주세요.")}
                    className={`flex-1 bg-black/20 border border-white/5 rounded-xl p-3 text-sm text-white outline-none focus:border-white/20 transition-colors resize-none h-[3.5rem] ${isInputDisabled ? 'cursor-not-allowed' : ''}`}
                    disabled={isInputDisabled} 
                  />
                  <button onClick={handleSubmit} disabled={isInputDisabled || !inputVal.trim()} className="bg-white/10 text-white h-[3.5rem] px-4 rounded-xl text-xs font-bold hover:bg-white/20 transition-all disabled:opacity-50 whitespace-nowrap">
                      {isEditing ? '수정' : '등록'}
                  </button>
              </div>
          </div>

          <div className="space-y-3 pb-4">
              {filteredRecent.map((c) => (
                  <CommentItem key={c.id} comment={c} user={user} onDelete={handleDelete} onLike={() => handleLike(c)} opponentAvg={opponentAvg} teamTheme={teamTheme} onEdit={() => handleEditClick(c.content)} />
              ))}
              {recentComments.length === 0 && <div className="text-center text-xs text-slate-600 py-6 italic opacity-50">첫 번째 리뷰를 남겨보세요!</div>}
              {recentComments.length >= limitCount && (
                  <button onClick={() => setLimitCount(prev => prev + 5)} className="w-full py-3 text-xs font-bold text-slate-500 hover:text-white bg-white/5 rounded-xl transition-colors">더보기 +</button>
              )}
          </div>
      </div>
  );
}

function CommentItem({ comment, user, onDelete, onLike, isBest, opponentAvg, teamTheme, onEdit }: any) {
    const isMine = user?.uid === comment.userId;
    const isLiked = comment.likedBy?.includes(user?.uid);

    let commentColor = 'bg-slate-500'; 
    if (opponentAvg > 0) {
        commentColor = comment.rating >= opponentAvg ? 'bg-red-500' : 'bg-blue-500';
    } else {
        commentColor = teamTheme === 'red' ? 'bg-red-500' : 'bg-blue-500';
    }

    return (
        <div className={`bg-white/[0.03] border ${isBest ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/5'} p-3 rounded-2xl flex gap-3 hover:bg-white/[0.06] transition-colors`}>
            {/* ⭐ Badge with Background Color */}
            <div className={`${commentColor} h-6 px-1.5 rounded-lg flex items-center justify-center min-w-[32px]`}>
                <span className="text-white font-bold text-xs italic">{comment.rating?.toFixed(1) || '-'}</span>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-300 break-words leading-relaxed">{comment.content}</p>
                <div className="flex justify-between items-center mt-2">
                    <span className="text-[9px] font-bold text-slate-500">{comment.userName?.substring(0,3)}***</span>
                    <div className="flex items-center gap-3">
                        {!isBest && <span className="text-[9px] text-slate-600">{comment.createdAt?.seconds ? new Date(comment.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</span>}
                        <button onClick={onLike} className="flex items-center gap-1 text-slate-500 hover:text-red-400 transition-colors"><HeartIcon filled={isLiked} /><span className="text-[9px] font-bold">{comment.likes || 0}</span></button>
                        {isMine && (
                            <button onClick={onEdit} className="text-slate-500 hover:text-white transition-colors flex items-center gap-1"><EditIcon /><span className="text-[9px]">수정</span></button>
                        )}
                        {isMine && !isBest && <button onClick={() => onDelete(comment.id)} className="text-slate-500 hover:text-red-400 transition-colors"><TrashIcon /></button>}
                    </div>
                </div>
            </div>
        </div>
    )
}