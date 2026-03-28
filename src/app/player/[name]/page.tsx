import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { serializeData, getRosterMap } from '@/lib/lck-utils';
import { APP_ID, POSITIONS, POS_ICONS } from '@/constants/config';
import type { Match, Player, Position } from '@/types';
import BottomTabBar from '@/components/BottomTabBar';
import SafeImg from '@/components/SafeImg';

export const revalidate = 3600;

const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('/') || url.startsWith('data:') || url.includes('wsrv.nl')) return url;
  return `https://wsrv.nl/?url=${url.replace(/^https?:\/\//, '')}&output=png`;
};

type PlayerInfo = {
  teamName: string;
  teamCode: string;
  teamLogo: string;
  position: Position;
  image?: string | null;
};

type MatchEntry = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  league: string;
  avgRating: number;
  ratingCount: number;
};

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  try {
    const { name } = await params;
    const playerName = decodeURIComponent(name);
    return {
      title: `${playerName} 선수 평점 | 협곡평점.GG`,
      description: `${playerName}의 LCK 시즌 평균 평점과 경기별 기록을 확인하세요.`,
      openGraph: {
        title: `${playerName} 시즌 평점 — 협곡평점.GG`,
        description: `${playerName}의 팬 평가 데이터`,
      },
    };
  } catch {
    return { title: '선수 평점 | 협곡평점.GG' };
  }
}

export default async function PlayerPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const playerName = decodeURIComponent(name);

  let playerInfo: PlayerInfo | null = null;
  let matchHistory: MatchEntry[] = [];

  try {
    const [teamsSnap, matchesSnap] = await Promise.all([
      getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'teams')),
      getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'matches')),
    ]);

    teamsSnap.forEach(doc => {
      const team = serializeData(doc.data());
      if (!team) return;
      const rosterMap = getRosterMap(team);
      POSITIONS.forEach(pos => {
        rosterMap[pos].forEach((p: Player) => {
          if (p.name === playerName) {
            playerInfo = { teamName: team.name, teamCode: team.acronym, teamLogo: team.logo, position: pos, image: p.image };
          }
        });
      });
    });

    matchesSnap.docs.forEach(doc => {
      const m = serializeData({ id: doc.id, ...doc.data() }) as Match;
      if (m.status !== 'FINISHED' || !m.stats?.games || !m.home || !m.away) return;
      let sum = 0, count = 0;
      for (const gameStats of Object.values(m.stats.games)) {
        const stat = gameStats[playerName];
        if (stat && stat.count > 0) { sum += stat.sum; count += stat.count; }
      }
      if (count === 0) return;
      matchHistory.push({
        matchId: String(m.id),
        homeTeam: m.home.code ?? m.home.name ?? '?',
        awayTeam: m.away.code ?? m.away.name ?? '?',
        date: m.date ?? '',
        league: m.league ?? '',
        avgRating: sum / count,
        ratingCount: count,
      });
    });

    matchHistory.sort((a, b) => b.date.localeCompare(a.date));

  } catch (e: any) {
    console.error('[PlayerPage] error:', e?.message, e?.stack);
    return (
      <div className="min-h-screen bg-slate-950 text-slate-500 flex items-center justify-center">
        <div className="text-center">
          <div className="font-black text-red-400 mb-2">오류가 발생했어요</div>
          <div className="text-xs">{e?.message}</div>
        </div>
      </div>
    );
  }

  if (!playerInfo && matchHistory.length === 0) notFound();

  const info = playerInfo as PlayerInfo | null;
  const totalCount = matchHistory.reduce((s, m) => s + m.ratingCount, 0);
  const seasonAvg = totalCount > 0
    ? matchHistory.reduce((s, m) => s + m.avgRating * m.ratingCount, 0) / totalCount
    : null;
  const best = matchHistory.length > 0 ? [...matchHistory].sort((a, b) => b.avgRating - a.avgRating)[0] : null;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans pb-20">
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center gap-3">
          <Link href="/ranking" className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <h1 className="font-black text-cyan-400 italic tracking-tighter uppercase text-lg flex-1 text-center pr-5">{playerName}</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-5 space-y-4">
        {/* 선수 카드 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 overflow-hidden border border-slate-700 shrink-0">
            {info?.image ? (
              <SafeImg src={getProxiedUrl(info.image)} className="w-full h-full object-cover" alt={playerName} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500 text-xl font-black">{playerName[0]}</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-white text-2xl italic tracking-tighter leading-none">{playerName}</div>
            {info && (
              <div className="flex items-center gap-2 mt-1">
                {info.teamLogo && (
                  <SafeImg src={info.teamLogo.startsWith('/') ? info.teamLogo : getProxiedUrl(info.teamLogo)}
                    className="w-4 h-4 object-contain" alt={info.teamCode} />
                )}
                <span className="text-xs text-slate-400 font-bold">{info.teamCode}</span>
                <span className="flex items-center gap-1">
                  <img src={POS_ICONS[info.position]} className="w-3 h-3 object-contain" alt={info.position} />
                  <span className="text-[10px] text-slate-500 font-bold uppercase">{info.position}</span>
                </span>
              </div>
            )}
          </div>
          {seasonAvg !== null && (
            <div className="text-right shrink-0">
              <div className="text-3xl font-black italic text-cyan-400 leading-none">{seasonAvg.toFixed(2)}</div>
              <div className="text-[9px] text-slate-600 font-bold uppercase mt-0.5">시즌 평균</div>
            </div>
          )}
        </div>

        {/* 스탯 */}
        {matchHistory.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '평가 경기', value: `${matchHistory.length}경기` },
              { label: '총 평가 수', value: `${totalCount}회` },
              { label: '최고 경기', value: best ? best.avgRating.toFixed(2) : '-' },
            ].map(s => (
              <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                <div className="text-xl font-black italic text-cyan-400 leading-none">{s.value}</div>
                <div className="text-[9px] text-slate-500 font-bold mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* 경기별 히스토리 */}
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 px-1">경기별 평점</div>
          {matchHistory.length === 0 ? (
            <div className="text-center text-slate-600 py-12 font-bold">
              아직 평점 데이터가 없어요<br />
              <span className="text-sm font-normal text-slate-700 mt-2 block">경기를 보고 평점을 남겨주세요!</span>
            </div>
          ) : (
            <div className="space-y-2">
              {matchHistory.map(m => {
                const color = m.avgRating >= 8 ? 'text-red-400' : m.avgRating >= 6 ? 'text-cyan-400' : 'text-slate-500';
                return (
                  <Link key={m.matchId} href={`/match/${m.matchId}?player=${encodeURIComponent(playerName)}`}
                    className="block bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl p-4 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-white text-sm uppercase tracking-tighter">
                          {m.homeTeam} <span className="text-slate-600 font-bold">vs</span> {m.awayTeam}
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5">
                          {m.league} · {m.date.substring(5, 10).replace('-', '.')} · {m.ratingCount}명 평가
                        </div>
                      </div>
                      <div className={`text-2xl font-black italic ${color} shrink-0`}>{m.avgRating.toFixed(2)}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <BottomTabBar />
    </div>
  );
}
