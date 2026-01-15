'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from "@/lib/firebase"; 
import { doc, getDoc, collection, query, where, getDocs, setDoc, deleteDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp, orderBy, limit, startAfter } from "firebase/firestore";
import { motion } from 'framer-motion';
import Footer from '@/components/Footer';

const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];

interface Props {
  matchData: any;
  initialRosters: { home: string[], away: string[] };
  initialAvgRatings: Record<string, number>;
  initialComments: any[];
}

export default function MatchDetailView({ matchData, initialRosters, initialAvgRatings, initialComments }: Props) {
  const router = useRouter();
  const matchId = matchData.id;

  const [homeRoster] = useState<string[]>(initialRosters.home);
  const [awayRoster] = useState<string[]>(initialRosters.away);
  const [avgRatings] = useState<Record<string, number>>(initialAvgRatings);

  const [activePosIndex, setActivePosIndex] = useState(0); 
  const [selectedTeamSide, setSelectedTeamSide] = useState<'home' | 'away'>('home'); 
  
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});

  useEffect(() => {
     const fetchMyData = async () => {
        const user = auth.currentUser;
        if (user) {
          try {
            const mySnap = await getDoc(doc(db, "matchRatings", `${user.uid}_${matchId}`));
            if (mySnap.exists()) {
              const ratings = mySnap.data().ratings;
              const parsed: any = {};
              Object.entries(ratings).forEach(([name, val]: any) => parsed[name] = val.score);
              setMyRatings(parsed);
            }
          } catch(e) { console.error(e); }
        }
     };
     fetchMyData();
  }, [matchId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activePosIndex, selectedTeamSide]);

  const isFinished = matchData?.status === 'FINISHED';
  const isHomeWin = isFinished && (matchData?.home?.score || 0) > (matchData?.away?.score || 0);
  const isAwayWin = isFinished && (matchData?.away?.score || 0) > (matchData?.home?.score || 0);

  const getTeamTheme = (side: 'home' | 'away') => {
    if (!isFinished) return 'slate'; 
    if (side === 'home') return isHomeWin ? 'red' : 'blue';
    return isAwayWin ? 'red' : 'blue';
  };

  const currentTheme = getTeamTheme(selectedTeamSide);
  
  const themeStyles = {
    slate: { bg: 'bg-slate-900', border: 'border-slate-700', text: 'text-slate-400', shadow: '', cardBg: 'bg-slate-900 border-slate-800', avgText: 'text-slate-400' },
    red: { bg: 'bg-red-950/60', border: 'border-red-500', text: 'text-red-500', shadow: 'shadow-[0_0_15px_rgba(239,68,68,0.4)]', cardBg: 'bg-gradient-to-br from-red-950 to-slate-900 border-red-500/30', avgText: 'text-red-400' },
    blue: { bg: 'bg-blue-950/60', border: 'border-blue-500', text: 'text-blue-400', shadow: 'shadow-[0_0_15px_rgba(59,130,246,0.4)]', cardBg: 'bg-gradient-to-br from-blue-950 to-slate-900 border-blue-500/30', avgText: 'text-blue-400' }
  };

  const currentPlayerName = selectedTeamSide === 'home' ? homeRoster[activePosIndex] : awayRoster[activePosIndex];

  const handleGoBack = () => {
    router.push(`/?expanded=${matchId}`);
  };

  return (
    <div className="bg-slate-950 min-h-screen text-slate-50 font-sans pb-20">
      <div className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 shadow-2xl transition-all max-w-md mx-auto">
        <div className="flex justify-between items-center px-4 py-3">
          <button onClick={handleGoBack} className="text-2xl font-black text-slate-500 hover:text-white transition-colors">←</button>
          <h1 className="text-xl font-black text-cyan-400 italic tracking-tighter uppercase">협곡평점.GG</h1>
          <div className="w-6"></div> 
        </div>

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

        <div className="flex p-2 gap-3 bg-slate-900/50">
          <button 
            onClick={() => setSelectedTeamSide('home')}
            className={`flex-1 py-2 rounded-xl border-2 transition-all flex items-center justify-center relative overflow-hidden ${selectedTeamSide === 'home' ? `${themeStyles[getTeamTheme('home')].bg} ${themeStyles[getTeamTheme('home')].border} ${themeStyles[getTeamTheme('home')].text} ${themeStyles[getTeamTheme('home')].shadow}` : 'border-transparent bg-slate-900 text-slate-500 opacity-40 hover:opacity-70'}`}
          >
             {matchData.home.logo ? <img src={matchData.home.logo} className="w-8 h-8 object-contain drop-shadow-lg relative z-10" /> : <span className="font-black text-xl italic relative z-10">{matchData.home.name.substring(0, 2)}</span>}
             {selectedTeamSide === 'home' && isFinished && <span className="absolute top-1 right-1 text-[8px] font-black opacity-50">{isHomeWin ? 'WIN' : 'LOSE'}</span>}
          </button>
          <button 
            onClick={() => setSelectedTeamSide('away')}
            className={`flex-1 py-2 rounded-xl border-2 transition-all flex items-center justify-center relative overflow-hidden ${selectedTeamSide === 'away' ? `${themeStyles[getTeamTheme('away')].bg} ${themeStyles[getTeamTheme('away')].border} ${themeStyles[getTeamTheme('away')].text} ${themeStyles[getTeamTheme('away')].shadow}` : 'border-transparent bg-slate-900 text-slate-500 opacity-40 hover:opacity-70'}`}
          >
             {matchData.away.logo ? <img src={matchData.away.logo} className="w-8 h-8 object-contain drop-shadow-lg relative z-10" /> : <span className="font-black text-xl italic relative z-10">{matchData.away.name.substring(0, 2)}</span>}
             {selectedTeamSide === 'away' && isFinished && <span className="absolute top-1 right-1 text-[8px] font-black opacity-50">{isAwayWin ? 'WIN' : 'LOSE'}</span>}
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        {currentPlayerName && (
          <motion.div 
            key={currentPlayerName} 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            className={`p-6 rounded-[2rem] border relative overflow-hidden shadow-2xl transition-colors duration-500 ${themeStyles[currentTheme].cardBg}`}
          >
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

        {currentPlayerName && (
           <CommentSection 
              matchId={matchId} 
              playerName={currentPlayerName} 
              initialComments={initialComments}
              userRating={myRatings[currentPlayerName]} 
              onGoRate={handleGoBack}
           />
        )}
        <Footer />
      </div>
      <ScrollToTopButton />
    </div>
  );
}

function CommentSection({ matchId, playerName, initialComments, userRating, onGoRate }: { matchId: string, playerName: string, initialComments: any[], userRating?: number, onGoRate: () => void }) {
  const [comments, setComments] = useState<any[]>(initialComments);
  const [myComment, setMyComment] = useState<any>(null);
  const [inputVal, setInputVal] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingComments, setLoadingComments] = useState(initialComments.length === 0);
  
  const user = auth.currentUser;
  const PER_PAGE = 20;

  const hasRated = userRating !== undefined && userRating > 0;

  const maskName = (name: string) => {
    if (!name) return "****";
    const visible = name.substring(0, 3);
    const masked = "*".repeat(Math.max(0, name.length - 3));
    return visible + masked;
  };

  // ⭐ [핵심 수정] ID 생성 시 슬래시(/) 제거 함수
  const getSafeDocId = (uid: string) => {
    // 슬래시(/)를 언더바(_) 또는 하이픈(-)으로 치환해서 경로 오류 방지
    const safePlayerName = playerName.replace(/\//g, '-');
    return `${matchId}_${safePlayerName}_${uid}`;
  };

  useEffect(() => {
    // 1. 내 댓글 가져오기
    const fetchMy = async () => {
        if (!user) return;
        try {
          // ⭐ 수정된 ID 생성 함수 사용
          const docRef = doc(db, "matchComments", getSafeDocId(user.uid));
          const snap = await getDoc(docRef);
          const snapData = snap.data(); 
          if (snap.exists() && snapData) {
            const myData = { id: snap.id, ...snapData };
            setMyComment(myData);
            if (snapData.content) {
              setInputVal(snapData.content);
            }
          } else {
            setMyComment(null);
            setInputVal("");
          }
        } catch(e) { 
          console.error("내 댓글 불러오기 오류:", e); 
        }
    };
    fetchMy();

    // 2. 전체 댓글 (스트리밍 데이터 확인 및 폴백)
    const checkStreamedData = () => {
        const streamed = (window as any).__INITIAL_COMMENTS__;
        if (streamed && Array.isArray(streamed)) {
            const filtered = streamed.filter((c: any) => c.playerName === playerName);
            setComments(filtered);
            setLoadingComments(false);
            setHasMore(filtered.length >= PER_PAGE);
            return true;
        }
        return false;
    };

    if (!loadingComments) return; // 이미 데이터가 있으면 패스

    if (checkStreamedData()) return;

    const timer = setInterval(() => {
        if (checkStreamedData()) clearInterval(timer);
    }, 100);

    const fallbackTimer = setTimeout(async () => {
        clearInterval(timer);
        if (comments.length === 0) {
            await fetchInitialComments();
            setLoadingComments(false);
        }
    }, 3000);

    return () => { clearInterval(timer); clearTimeout(fallbackTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, playerName, user]);

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

  const handleSubmit = async () => {
    if (!user) return alert("로그인이 필요합니다.");
    if (!hasRated) return alert("평점을 먼저 남겨주세요!");
    if (!inputVal.trim()) return;
    
    setIsSubmitting(true);
    try {
      // ⭐ 수정된 ID 생성 함수 사용
      const commentId = getSafeDocId(user.uid);
      const newComment = {
        userId: user.uid, 
        userName: user.email?.split('@')[0] || "Unknown", 
        matchId, 
        playerName, 
        content: inputVal, 
        rating: userRating,
        likes: myComment?.likes || 0, 
        likedBy: myComment?.likedBy || [], 
        createdAt: serverTimestamp()
      };
      
      await setDoc(doc(db, "matchComments", commentId), newComment);
      await fetchInitialComments(); 
      const snap = await getDoc(doc(db, "matchComments", commentId));
      if (snap.exists()) setMyComment({ id: snap.id, ...snap.data() });
      alert(myComment ? "수정되었습니다!" : "등록되었습니다!");
    } catch (e) { 
        console.error(e);
        alert("저장 실패"); 
    } finally { setIsSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!confirm("삭제하시겠습니까?")) return;
    if (!myComment) return;
    try { 
      // myComment.id는 이미 안전한 ID이므로 그대로 사용 가능
      await deleteDoc(doc(db, "matchComments", myComment.id)); 
      setMyComment(null); 
      setInputVal("");
      fetchInitialComments(); 
    } catch (e) { alert("삭제 실패"); }
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

  const sortedComments = () => {
    const byLikes = [...comments].sort((a, b) => b.likes - a.likes);
    const best3 = byLikes.slice(0, 3).filter(c => c.likes > 0);
    const bestIds = new Set(best3.map(c => c.id));
    const rest = comments.filter(c => !bestIds.has(c.id));
    return { best3, rest };
  };
  const { best3, rest } = sortedComments();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px bg-slate-800 flex-1"></div>
        <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Comments</span>
        <div className="h-px bg-slate-800 flex-1"></div>
      </div>

      {loadingComments ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin"></div>
          <p className="text-[10px] font-bold text-slate-600 animate-pulse uppercase tracking-widest">불러오는 중...</p>
        </div>
      ) : (
        <>
          {best3.length > 0 && (
             <div className="space-y-4">
                {best3.map(c => (
                  <CommentItem 
                    key={c.id} 
                    comment={c} 
                    isBest={true} 
                    onLike={() => handleLike(c)} 
                    currentUserId={user?.uid} 
                    maskName={maskName}
                    onDelete={handleDelete}
                  />
                ))}
             </div>
          )}

          <div className={`border p-4 rounded-2xl shadow-lg transition-all ${hasRated ? 'bg-slate-900 border-slate-800' : 'bg-slate-900/50 border-slate-800/50'}`}>
            <label className="text-xs font-bold text-slate-500 mb-2 block">
              {myComment ? '내 코멘트 수정하기' : '한줄평 남기기 (100자 이내)'}
            </label>
            
            {!hasRated && user && (
               <div className="mb-3 text-center py-4 bg-slate-950/50 rounded-xl border border-dashed border-slate-800">
                  <p className="text-xs text-slate-400 mb-2 font-bold">평점을 먼저 등록해야 작성할 수 있습니다.</p>
                  <button onClick={onGoRate} className="bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold px-3 py-2 rounded-lg transition-colors">
                      이 선수 평점 남기러 가기 ⚡
                  </button>
               </div>
            )}

            <div className="flex gap-2">
              <textarea 
                value={inputVal} 
                onChange={(e) => setInputVal(e.target.value.slice(0, 100))} 
                placeholder={
                    !user ? "로그인 후 작성 가능합니다." :
                    !hasRated ? "평점을 먼저 남겨주세요!" :
                    "매너있는 평가를 남겨주세요."
                } 
                disabled={!user || isSubmitting || !hasRated} 
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 resize-none outline-none focus:border-cyan-500/50 h-20 disabled:opacity-50 disabled:cursor-not-allowed" 
              />
              <button 
                onClick={handleSubmit} 
                disabled={!user || isSubmitting || !inputVal.trim() || !hasRated} 
                className="w-16 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-bold text-xs transition-colors"
              >
                {myComment ? '수정' : '등록'}
              </button>
            </div>
          </div>

          <div className="space-y-4 pb-10">
            {rest.map(c => (
              <CommentItem 
                key={c.id} 
                comment={c} 
                isBest={false} 
                onLike={() => handleLike(c)} 
                currentUserId={user?.uid} 
                maskName={maskName}
                onDelete={handleDelete}
              />
            ))}
            
            {comments.length === 0 && <div className="text-center text-slate-600 text-xs py-10">아직 작성된 코멘트가 없습니다.</div>}
            
            {hasMore && <button onClick={fetchMoreComments} disabled={loadingMore} className="w-full py-3 bg-slate-800 text-slate-400 text-xs font-bold rounded-xl hover:bg-slate-700 hover:text-white transition-colors flex items-center justify-center gap-2">{loadingMore ? '로딩 중...' : '더 보기 🔽'}</button>}
          </div>
        </>
      )}
    </div>
  );
}

function CommentItem({ comment, isBest, onLike, currentUserId, maskName, onDelete }: any) {
  const isLiked = comment.likedBy?.includes(currentUserId);
  const isMine = comment.userId === currentUserId;

  return (
    <div className={`p-4 rounded-2xl border relative transition-all ${isBest ? 'bg-amber-950/10 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'bg-slate-900 border-slate-800'} ${isMine ? 'border-cyan-500/30 bg-cyan-950/5' : ''}`}>
       {isBest && <div className="absolute -top-2 -left-2 bg-amber-500 text-black text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg">BEST</div>}
       
       <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <span className="bg-slate-800 border border-slate-700 text-cyan-400 text-[10px] font-black px-1.5 py-0.5 rounded-md min-w-[38px] text-center">
              {comment.rating ? comment.rating.toFixed(1) : '-.-'}
            </span>
            
            <span className={`text-[10px] font-bold ${isMine ? 'text-cyan-400' : (isBest ? 'text-amber-200' : 'text-slate-500')}`}>
              {maskName(comment.userName)}
            </span>

            {isMine && (
              <div className="flex gap-2 ml-1">
                <button onClick={onDelete} className="text-[9px] text-slate-600 hover:text-red-400 underline decoration-slate-700">삭제</button>
              </div>
            )}
          </div>

          <button onClick={onLike} className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full transition-all active:scale-95 ${isLiked ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>
            <span>{isLiked ? '❤️' : '🤍'}</span>
            <span>{comment.likes}</span>
          </button>
       </div>

       <p className="text-slate-300 text-sm font-medium leading-relaxed break-words px-0.5">
         {comment.content}
       </p>
    </div>
  );
}

function ScrollToTopButton() {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  return <button onClick={scrollToTop} className="fixed bottom-6 right-6 w-12 h-12 bg-slate-800 border border-slate-700 text-white rounded-full shadow-2xl flex items-center justify-center text-xl z-40 hover:bg-slate-700 active:scale-90 transition-all">↑</button>;
}