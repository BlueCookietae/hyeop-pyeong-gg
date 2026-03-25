'use client';

import { useState } from 'react';
import Link from 'next/link';
import { POSITIONS, POS_ICONS } from '@/constants/config';
import type { Position, PlayerRankData, MatchHighlight } from '@/types';
import BottomTabBar from '@/components/BottomTabBar';

const getProxiedUrl = (url?: string | null): string => {
  if (!url) return '';
  if (url.startsWith('/') || url.startsWith('data:') || url.includes('wsrv.nl')) return url;
  return `https://wsrv.nl/?url=${url.replace(/^https?:\/\//, '')}&output=png`;
};

export default function RankingView({ rankingData }: { rankingData: PlayerRankData[] }) {
  const [activePos, setActivePos] = useState<Position>('TOP');

  const filtered = rankingData.filter(p => p.position === activePos);

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-center">
          <h1 className="font-black text-cyan-400 italic tracking-tighter uppercase text-lg">시즌 랭킹</h1>
        </div>

        {/* Position tabs */}
        <div className="max-w-md mx-auto px-4 pb-3 flex gap-2 justify-center">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setActivePos(pos)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl border transition-all ${
                activePos === pos
                  ? 'bg-cyan-500/20 border-cyan-500/50 opacity-100'
                  : 'border-transparent opacity-30 hover:opacity-60'
              }`}
            >
              <img src={POS_ICONS[pos]} alt={pos} className="w-4 h-4 object-contain" />
              <span className="text-[9px] font-black uppercase tracking-widest">{pos}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ranking List */}
      <div className="max-w-md mx-auto px-4 pt-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center text-slate-600 py-20 font-bold">
            아직 평점 데이터가 부족해요<br />
            <span className="text-sm font-normal text-slate-700 mt-2 block">경기를 보고 평점을 남겨주세요!</span>
          </div>
        ) : (
          filtered.map((player, idx) => (
            <PlayerRankCard key={player.name} player={player} rank={idx + 1} />
          ))
        )}
      </div>
      <BottomTabBar />
    </div>
  );
}

function PlayerRankCard({ player, rank }: { player: PlayerRankData; rank: number }) {
  const rankColor =
    rank === 1 ? 'text-yellow-400' :
    rank === 2 ? 'text-slate-300' :
    rank === 3 ? 'text-amber-600' :
    'text-slate-600';

  const rankBg =
    rank === 1 ? 'border-yellow-500/30 bg-yellow-500/5' :
    rank === 2 ? 'border-slate-500/30' :
    rank === 3 ? 'border-amber-600/30' :
    'border-slate-800';

  return (
    <div className={`bg-slate-900 border ${rankBg} rounded-2xl p-4 space-y-3`}>
      {/* 선수 기본 정보 */}
      <div className="flex items-center gap-3">
        <span className={`text-xl font-black italic w-7 text-center shrink-0 ${rankColor}`}>{rank}</span>

        <div className="w-12 h-12 rounded-xl bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
          {player.image ? (
            <img src={getProxiedUrl(player.image)} className="w-full h-full object-cover" alt={player.name} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm font-black">
              {player.name[0]}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-black text-white text-lg italic tracking-tighter leading-none">{player.name}</div>
          <div className="text-[10px] text-slate-500 font-bold mt-0.5">
            {player.teamCode} · {player.totalRatings}명 평가
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-2xl font-black italic text-cyan-400 leading-none">{player.avgRating.toFixed(2)}</div>
          <div className="text-[9px] text-slate-600 font-bold uppercase mt-0.5">시즌 평균</div>
        </div>
      </div>

      {/* 최고/최저 경기 */}
      {(player.bestMatch || player.worstMatch) && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/50">
          {player.bestMatch && <MatchHighlightCard highlight={player.bestMatch} type="best" />}
          {player.worstMatch && <MatchHighlightCard highlight={player.worstMatch} type="worst" />}
        </div>
      )}
    </div>
  );
}

function MatchHighlightCard({ highlight, type }: { highlight: MatchHighlight; type: 'best' | 'worst' }) {
  const isBest = type === 'best';
  return (
    <Link
      href={`/match/${highlight.matchId}`}
      className={`rounded-xl p-3 border transition-colors block ${
        isBest
          ? 'bg-red-950/30 border-red-500/20 hover:border-red-500/50'
          : 'bg-slate-900/80 border-slate-700/40 hover:border-slate-600'
      }`}
    >
      <div className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${isBest ? 'text-red-400' : 'text-slate-500'}`}>
        {isBest ? '🔥 최고 경기' : '💤 최저 경기'}
      </div>
      <div className="text-[10px] font-black text-white leading-tight">
        {highlight.homeTeam} vs {highlight.awayTeam}
      </div>
      <div className={`text-base font-black italic mt-0.5 ${isBest ? 'text-red-400' : 'text-slate-500'}`}>
        {highlight.avgRating.toFixed(2)}
      </div>
      <div className="text-[9px] text-slate-600 mt-0.5">
        {highlight.date.substring(5, 10).replace('-', '.')}
      </div>
    </Link>
  );
}
