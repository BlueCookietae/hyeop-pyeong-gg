'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { auth, db } from "@/lib/firebase"; 
import { doc, getDoc, collection, query, where, getDocs, setDoc, deleteDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp, orderBy, limit, startAfter } from "firebase/firestore";
import { motion } from 'framer-motion';
import Footer from '@/components/Footer';

const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;

  const [matchData, setMatchData] = useState<any>(null);
  const [homeRoster, setHomeRoster] = useState<string[]>([]);
  const [awayRoster, setAwayRoster] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [activePosIndex, setActivePosIndex] = useState(0); 
  const [selectedTeamSide, setSelectedTeamSide] = useState<'home' | 'away'>('home'); 

  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [avgRatings, setAvgRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    const init = async () => {
      try {
        const mSnap = await getDoc(doc(db, "matches", matchId));
        if (!mSnap.exists()) { alert("경기 없음"); return router.push('/'); }
        const mData = { id: mSnap.id, ...mSnap.data() } as any;
        setMatchData(mData);

        const hSnap = await getDoc(doc(db, "teams", mData.home.name));
        const aSnap = await getDoc(doc(db, "teams", mData.away.name));
        setHomeRoster(hSnap.exists() ? hSnap.data().roster : POSITIONS.map(p => `${mData.home.name} ${p}`));
        setAwayRoster(aSnap.exists() ? aSnap.data().roster : POSITIONS.map(p => `${mData.away.name} ${p}`));

        const user = auth.currentUser;
        if (user) {
          const mySnap = await getDoc(doc(db, "matchRatings", `${user.uid}_${matchId}`));
          if (mySnap.exists()) {
            const ratings = mySnap.data().ratings;
            const parsed: any = {};
            Object.entries(ratings).forEach(([name, val]: any) => parsed[name] = val.score);
            setMyRatings(parsed);
          }
        }

        const q = query(collection(db, "matchRatings"), where("matchId", "==", matchId));
        const qSnap = await getDocs(q);
        const stats: any = {};
        qSnap.forEach(d => {
          const r = d.data().ratings;
          if(!r) return;
          Object.entries(r).forEach(([name, val]: any) => {
            if(!stats[name]) stats[name] = { sum:0, count:0 };
            stats[name].sum += val.score;
            stats[name].count++;
          });
        });
        const avgs: any = {};
        for(const k in stats) avgs[k] = stats[k].sum / stats[k].count;
        setAvgRatings(avgs);

      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    init();
  }, [matchId, router]);

  // --- ⭐ 컬러 및 승패 로직 ---
  const isFinished = matchData?.status === 'FINISHED';
  const homeScore = matchData?.home?.score || 0;
  const awayScore = matchData?.away?.score || 0;
  const isHomeWin = isFinished && homeScore > awayScore;
  const isAwayWin = isFinished && awayScore > homeScore;

  // 팀별 테마 색상 결정 함수 (승리:Red, 패배:Blue, 진행전:Slate)
  const getTeamTheme = (side: 'home' | 'away') => {
    if (!isFinished) return 'slate'; // 경기 전
    if (side === 'home') return isHomeWin ? 'red' : 'blue';
    return isAwayWin ? 'red' : 'blue';
  };

  const currentTheme = getTeamTheme(selectedTeamSide);
  
  // 테마별 스타일 클래스
  const themeStyles = {
    slate: {
      bg: 'bg-slate-900',
      border: 'border-slate-700',
      text: 'text-slate-400',
      shadow: '',
      cardBg: 'bg-slate-900 border-slate-800',
      avgText: 'text-slate-400'
    },
    red: {
      bg: 'bg-red-950/60',
      border: 'border-red-500',
      text: 'text-red-500',
      shadow: 'shadow-[0_0_15px_rgba(239,68,68,0.4)]',
      cardBg: 'bg-gradient-to-br from-red-950 to-slate-900 border-red-500/30',
      avgText: 'text-red-400'
    },
    blue: {
      bg: 'bg-blue-950/60',
      border: 'border-blue-500',
      text: 'text-blue-400',
      shadow: 'shadow-[0_0_15px_rgba(59,130,246,0.4)]',
      cardBg: 'bg-gradient-to-br from-blue-950 to-slate-900 border-blue-500/30',
      avgText: 'text-blue-400'
    }
  };

  const currentPlayerName = selectedTeamSide === 'home' 
    ? homeRoster[activePosIndex] 
    : awayRoster[activePosIndex];

  if (loading || !matchData) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400 font-black animate-pulse">LOADING...</div>;

  return (
    <div className="bg-slate-950 min-h-screen text-slate-50 font-sans pb-20">
      
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 shadow-2xl transition-all max-w-md mx-auto">
        
        {/* ⭐ 상단: 심플하게 로고만 배치 */}
        <div className="flex justify-between items-center px-4 py-3">
          <button onClick={() => router.push('/')} className="text-2xl font-black text-slate-500 hover:text-white">
            ←
          </button>
          <h1 className="text-xl font-black text-cyan-400 italic tracking-tighter uppercase">협곡평점.GG</h1>
          <div className="w-6"></div> {/* 밸런스용 공백 */}
        </div>

        {/* 중단: 포지션 탭 */}
        <div className="flex justify-between px-2 pb-2">
          {POSITIONS.map((pos, idx) => (
            <button
              key={pos}
              onClick={() => setActivePosIndex(idx)}
              className={`flex-1 py-2 text-[10px] font-black tracking-widest transition-all rounded-lg ${activePosIndex === idx ? 'bg-slate-800 text-white shadow-inner' : 'text-slate-600 hover:text-slate-400'}`}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* ⭐ 하단: 팀 선택 탭 (승패 컬러 적용) */}
        <div className="flex p-2 gap-3 bg-slate-900/50">
          {/* 홈팀 버튼 */}
          <button 
            onClick={() => setSelectedTeamSide('home')}
            className={`flex-1 py-2 rounded-xl border-2 transition-all flex items-center justify-center relative overflow-hidden ${
              selectedTeamSide === 'home' 
                ? `${themeStyles[getTeamTheme('home')].bg} ${themeStyles[getTeamTheme('home')].border} ${themeStyles[getTeamTheme('home')].text} ${themeStyles[getTeamTheme('home')].shadow}`
                : 'border-transparent bg-slate-900 text-slate-500 opacity-40 hover:opacity-70'
            }`}
          >
             {matchData.home.logo ? (
               <img src={matchData.home.logo} className="w-8 h-8 object-contain drop-shadow-lg relative z-10" />
             ) : (
               <span className="font-black text-xl italic relative z-10">{matchData.home.name.substring(0, 2)}</span>
             )}
             {/* 승패 배지 (선택되었을 때만) */}
             {selectedTeamSide === 'home' && isFinished && (
               <span className="absolute top-1 right-1 text-[8px] font-black opacity-50">{isHomeWin ? 'WIN' : 'LOSE'}</span>
             )}
          </button>
          
          {/* 원정팀 버튼 */}
          <button 
            onClick={() => setSelectedTeamSide('away')}
            className={`flex-1 py-2 rounded-xl border-2 transition-all flex items-center justify-center relative overflow-hidden ${
              selectedTeamSide === 'away' 
                ? `${themeStyles[getTeamTheme('away')].bg} ${themeStyles[getTeamTheme('away')].border} ${themeStyles[getTeamTheme('away')].text} ${themeStyles[getTeamTheme('away')].shadow}`
                : 'border-transparent bg-slate-900 text-slate-500 opacity-40 hover:opacity-70'
            }`}
          >
             {matchData.away.logo ? (
               <img src={matchData.away.logo} className="w-8 h-8 object-contain drop-shadow-lg relative z-10" />
             ) : (
               <span className="font-black text-xl italic relative z-10">{matchData.away.name.substring(0, 2)}</span>
             )}
             {selectedTeamSide === 'away' && isFinished && (
               <span className="absolute top-1 right-1 text-[8px] font-black opacity-50">{isAwayWin ? 'WIN' : 'LOSE'}</span>
             )}
          </button>
        </div>
      </div>

      {/* 메인 컨텐츠 영역 */}
      <div className="max-w-md mx-auto p-4 space-y-6">
        
        {/* ⭐ 선수 정보 카드 (테마 적용) */}
        {currentPlayerName && (
          <motion.div 
            key={currentPlayerName} 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            className={`p-6 rounded-[2rem] border relative overflow-hidden shadow-2xl transition-colors duration-500 ${themeStyles[currentTheme].cardBg}`}
          >
             {/* 배경 데코레이션 */}
             <div className="absolute -right-4 -top-4 text-[10rem] opacity-5 font-black italic select-none pointer-events-none text-white">
                {POSITIONS[activePosIndex]}
             </div>
             
             <div className="relative z-10 flex justify-between items-end">
                <div>
                   <div className="text-[10px] font-bold text-slate-400 mb-1 flex items-center gap-2">
                     <span className={`w-2 h-2 rounded-full ${currentTheme === 'red' ? 'bg-red-500' : currentTheme === 'blue' ? 'bg-blue-500' : 'bg-slate-500'}`}></span>
                     {selectedTeamSide === 'home' ? matchData.home.name : matchData.away.name} • {POSITIONS[activePosIndex]}
                   </div>
                   <div className="text-2xl font-black italic text-white uppercase tracking-tighter">{currentPlayerName}</div>
                </div>
                <div className="text-right">
                   <div className="text-[10px] text-slate-400 font-bold mb-0.5">AVG RATING</div>
                   <div className={`text-3xl font-black italic ${themeStyles[currentTheme].avgText}`}>
                      {(avgRatings[currentPlayerName] ?? 0).toFixed(1)}
                   </div>
                </div>
             </div>
             <div className="h-px bg-white/10 my-4" />
             <div className="flex justify-between items-center relative z-10">
                <span className="text-xs font-bold text-slate-400">내가 준 평점</span>
                <span className="text-xl font-black text-white">
                   {myRatings[currentPlayerName] ? myRatings[currentPlayerName].toFixed(1) : <span className="text-slate-600">_._</span>}
                </span>
             </div>
          </motion.div>
        )}

        {/* 댓글 섹션 */}
        {currentPlayerName && (
           <CommentSection matchId={matchId} playerName={currentPlayerName} />
        )}
        <Footer />
      </div>
      <ScrollToTopButton />
    </div>
  );
}

// ... (CommentSection, CommentItem, ScrollToTopButton은 변경 없이 그대로 유지)
function CommentSection({ matchId, playerName }: { matchId: string, playerName: string }) {
  const [comments, setComments] = useState<any[]>([]);
  const [myComment, setMyComment] = useState<any>(null);
  const [inputVal, setInputVal] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  
  const user = auth.currentUser;
  const PER_PAGE = 20;

  const fetchMyComment = async () => {
    if (!user) return;
    try {
      const docId = `${matchId}_${playerName}_${user.uid}`;
      const snap = await getDoc(doc(db, "matchComments", docId));
      if (snap.exists()) setMyComment({ id: snap.id, ...snap.data() });
      else setMyComment(null);
    } catch (e) { console.error(e); }
  };

  const fetchInitialComments = async () => {
    try {
      const q = query(
        collection(db, "matchComments"), 
        where("matchId", "==", matchId), 
        where("playerName", "==", playerName),
        orderBy("createdAt", "desc"),
        limit(PER_PAGE)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setComments(list);
      setLastVisible(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.docs.length === PER_PAGE);
    } catch (e) { console.error(e); }
  };

  const fetchMoreComments = async () => {
    if (!lastVisible || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, "matchComments"), 
        where("matchId", "==", matchId), 
        where("playerName", "==", playerName),
        orderBy("createdAt", "desc"),
        startAfter(lastVisible),
        limit(PER_PAGE)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setComments(prev => [...prev, ...list]);
      setLastVisible(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.docs.length === PER_PAGE);
    } catch (e) { console.error(e); }
    finally { setLoadingMore(false); }
  };

  useEffect(() => {
    setComments([]); setMyComment(null); setLastVisible(null); setHasMore(false); setInputVal("");
    fetchMyComment(); fetchInitialComments();
  }, [matchId, playerName]);

  const handleSubmit = async () => {
    if (!user) return alert("로그인이 필요합니다.");
    if (!inputVal.trim()) return;
    setIsSubmitting(true);
    try {
      const commentId = `${matchId}_${playerName}_${user.uid}`;
      await setDoc(doc(db, "matchComments", commentId), {
        userId: user.uid, userName: user.email?.split('@')[0] || "Unknown", matchId, playerName, content: inputVal, likes: 0, likedBy: [], createdAt: serverTimestamp()
      });
      await fetchMyComment(); await fetchInitialComments(); setInputVal("");
    } catch (e) { alert("저장 실패"); } finally { setIsSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!confirm("삭제하시겠습니까?")) return;
    if (!myComment) return;
    try { await deleteDoc(doc(db, "matchComments", myComment.id)); setMyComment(null); fetchInitialComments(); } catch (e) { alert("삭제 실패"); }
  };

  const handleLike = async (comment: any) => {
    if (!user) return alert("로그인이 필요합니다.");
    const ref = doc(db, "matchComments", comment.id);
    const isLiked = comment.likedBy?.includes(user.uid);
    const updateList = (list: any[]) => list.map(c => {
        if(c.id === comment.id) {
            const newLikes = isLiked ? c.likes - 1 : c.likes + 1;
            const newLikedBy = isLiked ? c.likedBy.filter((id:string) => id !== user.uid) : [...(c.likedBy||[]), user.uid];
            return { ...c, likes: newLikes, likedBy: newLikedBy };
        }
        return c;
    });
    setComments(prev => updateList(prev));
    if(myComment && myComment.id === comment.id) setMyComment(updateList([myComment])[0]);
    try {
      if (isLiked) await updateDoc(ref, { likes: Math.max(0, comment.likes - 1), likedBy: arrayRemove(user.uid) });
      else await updateDoc(ref, { likes: comment.likes + 1, likedBy: arrayUnion(user.uid) });
    } catch (e) { console.error(e); }
  };

  const filteredComments = comments.filter(c => c.id !== myComment?.id);
  const sortedComments = () => {
    const combined = [...filteredComments];
    const byLikes = [...combined].sort((a, b) => b.likes - a.likes);
    const best3 = byLikes.slice(0, 3).filter(c => c.likes > 0);
    const bestIds = new Set(best3.map(c => c.id));
    const rest = combined.filter(c => !bestIds.has(c.id));
    return { best3, rest };
  };
  const { best3, rest } = sortedComments();

  return (
    <div className="space-y-6">
      {!myComment ? (
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
          <label className="text-xs font-bold text-slate-500 mb-2 block">한줄평 남기기 (100자 이내)</label>
          <div className="flex gap-2">
            <textarea value={inputVal} onChange={(e) => setInputVal(e.target.value.slice(0, 100))} placeholder={user ? "매너있는 평가를 남겨주세요." : "로그인 후 작성 가능합니다."} disabled={!user || isSubmitting} className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 resize-none outline-none focus:border-cyan-500/50 h-20" />
            <button onClick={handleSubmit} disabled={!user || isSubmitting || !inputVal.trim()} className="w-16 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-bold text-xs transition-colors">등록</button>
          </div>
        </div>
      ) : (
        <div className="bg-cyan-950/20 border border-cyan-500/30 p-4 rounded-2xl relative">
          <div className="flex justify-between items-start mb-2"><span className="text-[10px] font-bold text-cyan-400 bg-cyan-900/50 px-2 py-0.5 rounded">MY COMMENT</span><div className="flex gap-2"><button onClick={handleDelete} className="text-xs text-slate-500 hover:text-red-400 underline">삭제</button></div></div>
          <p className="text-white text-sm leading-relaxed">{myComment.content}</p>
          <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">👍 {myComment.likes} Likes</div>
        </div>
      )}
      <div className="space-y-4 pb-10">
        <div className="flex items-center gap-2"><div className="h-px bg-slate-800 flex-1"></div><span className="text-xs font-bold text-slate-600">COMMENTS</span><div className="h-px bg-slate-800 flex-1"></div></div>
        {best3.map(c => <CommentItem key={c.id} comment={c} isBest={true} onLike={() => handleLike(c)} currentUserId={user?.uid} />)}
        {rest.map(c => <CommentItem key={c.id} comment={c} isBest={false} onLike={() => handleLike(c)} currentUserId={user?.uid} />)}
        {comments.length === 0 && !myComment && <div className="text-center text-slate-600 text-xs py-10">아직 작성된 코멘트가 없습니다.</div>}
        {hasMore && <button onClick={fetchMoreComments} disabled={loadingMore} className="w-full py-3 bg-slate-800 text-slate-400 text-xs font-bold rounded-xl hover:bg-slate-700 hover:text-white transition-colors flex items-center justify-center gap-2">{loadingMore ? '로딩 중...' : '더 보기 🔽'}</button>}
      </div>
    </div>
  );
}

function CommentItem({ comment, isBest, onLike, currentUserId }: any) {
  const isLiked = comment.likedBy?.includes(currentUserId);
  return (
    <div className={`p-4 rounded-2xl border relative ${isBest ? 'bg-amber-950/10 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'bg-slate-900 border-slate-800'}`}>
       {isBest && <div className="absolute -top-2 -left-2 bg-amber-500 text-black text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg">BEST</div>}
       <div className="flex justify-between items-start mb-1.5">
          <span className={`text-[10px] font-bold ${isBest ? 'text-amber-200' : 'text-slate-500'}`}>{comment.userName}</span>
          <button onClick={onLike} className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full transition-all active:scale-95 ${isLiked ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}><span>{isLiked ? '❤️' : '🤍'}</span><span>{comment.likes}</span></button>
       </div>
       <p className="text-slate-300 text-sm font-medium leading-relaxed break-words">{comment.content}</p>
    </div>
  );
}

function ScrollToTopButton() {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  return <button onClick={scrollToTop} className="fixed bottom-6 right-6 w-12 h-12 bg-slate-800 border border-slate-700 text-white rounded-full shadow-2xl flex items-center justify-center text-xl z-40 hover:bg-slate-700 active:scale-90 transition-all">↑</button>;
}