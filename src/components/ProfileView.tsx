'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { APP_ID } from '@/constants/config';
import { useAuthStore } from '@/stores/authStore';
import BottomTabBar from '@/components/BottomTabBar';
import LoginButton from '@/components/LoginButton';

const getProxiedUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('/') || url.startsWith('data:') || url.includes('wsrv.nl')) return url;
  return `https://wsrv.nl/?url=${url.replace(/^https?:\/\//, '')}&output=png`;
};

interface RatedMatch {
  matchId: string;
  createdAtSeconds: number;
  playerRatings: { name: string; score: number }[];
  matchInfo?: {
    homeCode: string;
    awayCode: string;
    homeLogo: string;
    awayLogo: string;
    date: string;
  };
}

export default function ProfileView() {
  const { user, isLoading } = useAuthStore();
  const [ratedMatches, setRatedMatches] = useState<RatedMatch[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { setIsDataLoading(false); return; }

    const load = async () => {
      try {
        const q = query(collection(db, 'matchRatings'), where('userId', '==', user.uid));
        const snap = await getDocs(q);

        const rawRatings = snap.docs.map(d => {
          const data = d.data();
          const playerRatings: { name: string; score: number }[] = [];
          if (data.ratings?.games) {
            for (const gameRatings of Object.values(data.ratings.games)) {
              for (const [name, score] of Object.entries(gameRatings as Record<string, number>)) {
                if (score > 0) playerRatings.push({ name, score });
              }
            }
          }
          return {
            matchId: String(data.matchId),
            createdAtSeconds: data.createdAt?.seconds ?? 0,
            playerRatings,
          };
        });

        // 매치 정보 병렬 fetch
        const matchInfos = await Promise.all(
          rawRatings.map(async (r) => {
            try {
              const matchSnap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'matches', r.matchId));
              if (matchSnap.exists()) {
                const m = matchSnap.data();
                return {
                  matchId: r.matchId,
                  homeCode: m.home?.code || m.home?.name || '?',
                  awayCode: m.away?.code || m.away?.name || '?',
                  homeLogo: m.home?.logo || '',
                  awayLogo: m.away?.logo || '',
                  date: m.date || '',
                };
              }
            } catch (e) {}
            return null;
          })
        );

        const matchInfoMap: Record<string, NonNullable<RatedMatch['matchInfo']>> = {};
        matchInfos.forEach(info => { if (info) matchInfoMap[info.matchId] = info; });

        const result: RatedMatch[] = rawRatings
          .filter(r => r.playerRatings.length > 0)
          .map(r => ({ ...r, matchInfo: matchInfoMap[r.matchId] }))
          .sort((a, b) => b.createdAtSeconds - a.createdAtSeconds);

        setRatedMatches(result);
      } catch (e) {
        console.error(e);
      } finally {
        setIsDataLoading(false);
      }
    };

    load();
  }, [user, isLoading]);

  // 통계 집계
  const totalRatings = ratedMatches.reduce((sum, m) => sum + m.playerRatings.length, 0);
  const avgScore = totalRatings > 0
    ? ratedMatches.reduce((sum, m) => sum + m.playerRatings.reduce((s, p) => s + p.score, 0), 0) / totalRatings
    : 0;

  const playerStats: Record<string, { count: number; sum: number }> = {};
  ratedMatches.forEach(m => {
    m.playerRatings.forEach(p => {
      if (!playerStats[p.name]) playerStats[p.name] = { count: 0, sum: 0 };
      playerStats[p.name].count++;
      playerStats[p.name].sum += p.score;
    });
  });
  const topPlayers = Object.entries(playerStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([name, s]) => ({ name, count: s.count, avg: s.sum / s.count }));

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans pb-20">
      {/* 헤더 */}
      <div className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/50">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-center">
          <h1 className="font-black text-cyan-400 italic tracking-tighter uppercase text-lg">내 프로필</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-5 space-y-4">

        {/* 비로그인 */}
        {!isLoading && !user && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="text-slate-500 font-bold text-center">
              로그인하면 내 평점 기록을<br />확인할 수 있어요
            </div>
            <LoginButton />
          </div>
        )}

        {/* 로딩 */}
        {(isLoading || (user && isDataLoading)) && (
          <div className="flex items-center justify-center py-24">
            <span className="text-slate-600 font-bold animate-pulse">불러오는 중...</span>
          </div>
        )}

        {/* 프로필 본문 */}
        {user && !isDataLoading && (
          <>
            {/* 유저 정보 */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
              {user.photoURL ? (
                <img src={user.photoURL} className="w-14 h-14 rounded-full border-2 border-slate-700" alt="profile" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-xl font-black text-slate-400">
                  {(user.displayName || user.email || '?')[0].toUpperCase()}
                </div>
              )}
              <div>
                <div className="font-black text-white text-lg leading-tight">{user.displayName || '익명'}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{user.email}</div>
              </div>
            </div>

            {/* 스탯 카드 */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '평점 남긴 경기', value: `${ratedMatches.length}경기` },
                { label: '총 평가 횟수', value: `${totalRatings}회` },
                { label: '내 평균 점수', value: totalRatings > 0 ? avgScore.toFixed(2) : '-' },
              ].map(stat => (
                <div key={stat.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-3 text-center">
                  <div className="text-xl font-black italic text-cyan-400 leading-none">{stat.value}</div>
                  <div className="text-[9px] text-slate-500 font-bold mt-1 leading-tight">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* 많이 평가한 선수 TOP 3 */}
            {topPlayers.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">자주 평가한 선수</div>
                <div className="space-y-2">
                  {topPlayers.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className={`text-sm font-black italic w-5 text-center shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : 'text-amber-600'}`}>{i + 1}</span>
                      <span className="flex-1 font-black text-white text-sm">{p.name}</span>
                      <span className="text-[10px] text-slate-500">{p.count}회 평가</span>
                      <span className="text-sm font-black italic text-cyan-400 w-10 text-right">{p.avg.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 평점 남긴 경기 목록 */}
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 px-1">평점 남긴 경기</div>
              {ratedMatches.length === 0 ? (
                <div className="text-center text-slate-600 py-12 font-bold">
                  아직 평점을 남긴 경기가 없어요<br />
                  <span className="text-sm font-normal text-slate-700 mt-2 block">경기를 보고 평점을 남겨주세요!</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {ratedMatches.map(m => {
                    const myAvg = m.playerRatings.reduce((s, p) => s + p.score, 0) / m.playerRatings.length;
                    return (
                      <Link
                        key={m.matchId}
                        href={`/match/${m.matchId}`}
                        className="block bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl p-4 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {m.matchInfo ? (
                            <>
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <img src={getProxiedUrl(m.matchInfo.homeLogo)} className="w-7 h-7 object-contain shrink-0" alt={m.matchInfo.homeCode} />
                                <span className="font-black text-white text-sm uppercase tracking-tighter">{m.matchInfo.homeCode}</span>
                                <span className="text-slate-600 text-xs font-bold">vs</span>
                                <span className="font-black text-white text-sm uppercase tracking-tighter">{m.matchInfo.awayCode}</span>
                                <img src={getProxiedUrl(m.matchInfo.awayLogo)} className="w-7 h-7 object-contain shrink-0" alt={m.matchInfo.awayCode} />
                              </div>
                            </>
                          ) : (
                            <div className="flex-1 text-slate-500 text-sm font-bold">경기 #{m.matchId}</div>
                          )}
                          <div className="text-right shrink-0">
                            <div className="text-lg font-black italic text-cyan-400 leading-none">{myAvg.toFixed(1)}</div>
                            <div className="text-[9px] text-slate-600 mt-0.5">{m.playerRatings.length}명 평가</div>
                          </div>
                        </div>
                        {m.matchInfo?.date && (
                          <div className="text-[9px] text-slate-600 mt-1.5">
                            {m.matchInfo.date.substring(5, 10).replace('-', '.')}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <BottomTabBar />
    </div>
  );
}
