import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import HomeView from '@/components/HomeView';
import { Suspense } from 'react';
import { serializeData, getRosterMap } from '@/lib/lck-utils';
import { APP_ID } from '@/constants/config';
import type { Metadata } from 'next';
import type { Match, RosterMap } from '@/types';

export const revalidate = 300;

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ expanded?: string }> }): Promise<Metadata> {
  const { expanded } = await searchParams;
  if (expanded) {
    try {
      const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'matches', expanded));
      if (snap.exists()) {
        const m = snap.data();
        const homeCode = m.home?.code || m.home?.name || '?';
        const awayCode = m.away?.code || m.away?.name || '?';
        const dateLabel = (m.date || '').replace(/-/g, '').substring(2, 8);
        return {
          title: `${dateLabel} ${homeCode} vs ${awayCode} | 협곡평점.GG`,
          openGraph: {
            title: `${dateLabel} ${homeCode} vs ${awayCode}`,
            description: '협곡평점.GG에서 선수 평점을 확인하세요',
            images: [{ url: `/match/${expanded}/opengraph-image`, width: 1200, height: 630 }],
          },
          twitter: {
            card: 'summary_large_image',
            title: `${dateLabel} ${homeCode} vs ${awayCode}`,
          },
        };
      }
    } catch {}
  }
  return {
    title: '협곡평점.GG - LCK 선수 평점 커뮤니티',
    description: 'LCK 경기별 선수 평점을 직접 남기고, 시즌 랭킹을 확인하세요.',
  };
}

export default async function Page() {
  let matches: Match[] = [];
  let rosters: Record<number, RosterMap> = {};

  try {
    // 1. 매치 데이터
    const matchesRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'matches');
    const matchSnap = await getDocs(matchesRef);
    
    matches = matchSnap.docs
      .map(d => serializeData({ id: d.id, ...d.data() }) as Match)
      .sort((a, b) => b.date.localeCompare(a.date));

    // 2. 팀 데이터 (로스터)
    const teamsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'teams');
    const teamSnap = await getDocs(teamsRef);
    
    teamSnap.forEach(doc => {
      const safeData = serializeData({ id: doc.id, ...doc.data() });
      
      if (safeData) {
          const rosterMap = getRosterMap(safeData);
          rosters[safeData.id] = rosterMap;
      }
    });

  } catch (e) {
    console.error("🔥 Server Fetch Error:", e);
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin"></div>
        <div className="text-cyan-400 font-black italic tracking-widest text-sm animate-pulse">LOADING ARENA...</div>
      </div>
    }>
      <HomeView initialMatches={matches} initialRosters={rosters} />
    </Suspense>
  );
}