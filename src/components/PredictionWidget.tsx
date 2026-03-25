'use client';

interface PredictionResultProps {
  homeCode: string;
  awayCode: string;
  predCounts: { home: number; away: number };
  userPick: 'home' | 'away' | null;
  actualWinner?: 'home' | 'away' | null;
}

export default function PredictionResult({ homeCode, awayCode, predCounts, userPick, actualWinner }: PredictionResultProps) {
  const total = predCounts.home + predCounts.away;
  if (total === 0 && !userPick) return null;

  const homePct = total > 0 ? Math.round((predCounts.home / total) * 100) : 50;
  const awayPct = total > 0 ? 100 - homePct : 50;
  const isCorrect = userPick && actualWinner && userPick === actualWinner;
  const isWrong = userPick && actualWinner && userPick !== actualWinner;

  return (
    <div className="pt-3 border-t border-slate-800/50">
      <div className="flex items-center justify-between mb-2">
        {userPick ? (
          <span className={`text-[9px] font-black uppercase tracking-widest ${isCorrect ? 'text-green-400' : isWrong ? 'text-red-400' : 'text-cyan-400'}`}>
            {isCorrect ? '✅ 예측 성공!' : isWrong ? '❌ 예측 실패' : '내 예측'}
          </span>
        ) : (
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">커뮤니티 예측</span>
        )}
        <span className="text-[9px] text-slate-500">{total}명 참여</span>
      </div>
      <div className="space-y-1.5">
        {(['home', 'away'] as const).map(side => {
          const code = side === 'home' ? homeCode : awayCode;
          const pct = side === 'home' ? homePct : awayPct;
          const isMine = userPick === side;
          const isWin = actualWinner === side;
          return (
            <div key={side} className="flex items-center gap-2">
              <span className={`text-[9px] font-black uppercase w-8 shrink-0 ${isMine ? 'text-cyan-400' : 'text-slate-500'}`}>{code}</span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isWin ? 'bg-red-500' : isMine ? 'bg-cyan-500' : 'bg-slate-600'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-[9px] font-black w-7 text-right shrink-0 ${isMine ? 'text-cyan-400' : 'text-slate-500'}`}>{pct}%</span>
              {isMine && <span className="text-[8px] shrink-0">👤</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
