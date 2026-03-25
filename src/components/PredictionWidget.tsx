'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { APP_ID } from '@/constants/config';
import { useAuthStore } from '@/stores/authStore';
import type { Match } from '@/types';

interface PredictionWidgetProps {
  match: Match;
  homeCode: string;
  awayCode: string;
}

export default function PredictionWidget({ match, homeCode, awayCode }: PredictionWidgetProps) {
  const { user } = useAuthStore();
  const [userPick, setUserPick] = useState<'home' | 'away' | null>(null);
  const [predCounts, setPredCounts] = useState({
    home: match.predictions?.home ?? 0,
    away: match.predictions?.away ?? 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  const isNotStarted = match.status === 'NOT_STARTED';
  const isFinished = match.status === 'FINISHED';
  const actualWinner: 'home' | 'away' | null = isFinished
    ? match.home.score > match.away.score ? 'home'
    : match.away.score > match.home.score ? 'away'
    : null
    : null;

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'matchPredictions', `${user.uid}_${match.id}`));
        if (snap.exists()) setUserPick(snap.data().pick as 'home' | 'away');
      } catch (e) {}
    };
    load();
  }, [user, match.id]);

  const vote = async (pick: 'home' | 'away') => {
    if (!user || userPick || isLoading || !isNotStarted) return;
    setIsLoading(true);
    // 낙관적 업데이트: 트랜잭션 결과 기다리지 않고 즉시 UI 반영
    setUserPick(pick);
    setPredCounts(prev => ({ ...prev, [pick]: prev[pick] + 1 }));
    try {
      const predRef = doc(db, 'matchPredictions', `${user.uid}_${match.id}`);
      const matchRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'matches', String(match.id));
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(predRef);
        if (snap.exists()) throw new Error('already voted');
        tx.set(predRef, { pick, matchId: String(match.id), userId: user.uid, createdAt: serverTimestamp() });
        tx.update(matchRef, { [`predictions.${pick}`]: increment(1) });
      });
    } catch (e) {
      // 실패 시 롤백
      setUserPick(null);
      setPredCounts(prev => ({ ...prev, [pick]: prev[pick] - 1 }));
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const total = predCounts.home + predCounts.away;
  const homePct = total > 0 ? Math.round((predCounts.home / total) * 100) : 50;
  const awayPct = total > 0 ? 100 - homePct : 50;

  // NOT_STARTED
  if (isNotStarted) {
    if (!userPick) {
      return (
        <div className="px-4 pb-4 pt-1">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 text-center mb-2">🏆 승자 예측</div>
          <div className="flex gap-2">
            {(['home', 'away'] as const).map(side => {
              const code = side === 'home' ? homeCode : awayCode;
              return (
                <button
                  key={side}
                  onClick={(e) => { e.stopPropagation(); vote(side); }}
                  disabled={isLoading || !user}
                  className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 hover:border-cyan-500/50 active:scale-95 transition-all disabled:opacity-40"
                >
                  <img src={`/teams/${code}.png`} className="w-8 h-8 object-contain" alt={code} />
                  <span className="text-[10px] font-black uppercase text-white">{code}</span>
                  <span className="text-[8px] text-slate-500 font-bold">승리 예측</span>
                </button>
              );
            })}
          </div>
          {!user && (
            <div className="text-center text-[9px] text-slate-600 mt-2">로그인 후 예측 참여 가능</div>
          )}
        </div>
      );
    }

    // Voted
    return (
      <div className="px-4 pb-4 pt-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400">✅ 예측 완료</span>
          <span className="text-[9px] text-slate-500">{total}명 참여</span>
        </div>
        <PredBar homeCode={homeCode} awayCode={awayCode} homePct={homePct} awayPct={awayPct} userPick={userPick} />
      </div>
    );
  }

  // RUNNING
  if (match.status === 'RUNNING') {
    if (total === 0 && !userPick) return null;
    return (
      <div className="pt-3 border-t border-slate-800/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">커뮤니티 예측</span>
          <span className="text-[9px] text-slate-500">{total}명 참여</span>
        </div>
        <PredBar homeCode={homeCode} awayCode={awayCode} homePct={homePct} awayPct={awayPct} userPick={userPick} />
      </div>
    );
  }

  // FINISHED
  if (total === 0 && !userPick) return null;

  const isCorrect = userPick && actualWinner && userPick === actualWinner;
  const isWrong = userPick && actualWinner && userPick !== actualWinner;

  return (
    <div className="pt-3 border-t border-slate-800/50">
      <div className="flex items-center justify-between mb-2">
        {userPick ? (
          <span className={`text-[9px] font-black uppercase tracking-widest ${isCorrect ? 'text-green-400' : isWrong ? 'text-red-400' : 'text-slate-500'}`}>
            {isCorrect ? '✅ 예측 성공!' : isWrong ? '❌ 예측 실패' : '예측 결과'}
          </span>
        ) : (
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">커뮤니티 예측</span>
        )}
        <span className="text-[9px] text-slate-500">{total}명 참여</span>
      </div>
      <PredBar
        homeCode={homeCode}
        awayCode={awayCode}
        homePct={homePct}
        awayPct={awayPct}
        userPick={userPick}
        actualWinner={actualWinner}
      />
    </div>
  );
}

function PredBar({
  homeCode, awayCode, homePct, awayPct, userPick, actualWinner,
}: {
  homeCode: string;
  awayCode: string;
  homePct: number;
  awayPct: number;
  userPick: 'home' | 'away' | null;
  actualWinner?: 'home' | 'away' | null;
}) {
  return (
    <div className="space-y-1.5">
      {(['home', 'away'] as const).map(side => {
        const code = side === 'home' ? homeCode : awayCode;
        const pct = side === 'home' ? homePct : awayPct;
        const isMine = userPick === side;
        const isWinner = actualWinner === side;
        return (
          <div key={side} className="flex items-center gap-2">
            <span className={`text-[9px] font-black uppercase w-8 shrink-0 ${isMine ? 'text-cyan-400' : 'text-slate-500'}`}>{code}</span>
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isWinner ? 'bg-red-500' : isMine ? 'bg-cyan-500' : 'bg-slate-600'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`text-[9px] font-black w-7 text-right shrink-0 ${isMine ? 'text-cyan-400' : 'text-slate-500'}`}>{pct}%</span>
            {isMine && <span className="text-[8px] text-cyan-400 shrink-0">👤</span>}
          </div>
        );
      })}
    </div>
  );
}
