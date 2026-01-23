import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore'; 
import MatchDetailView from '@/components/MatchDetailView';
import { serializeData, getRosterMap } from '@/lib/lck-utils'; // ⭐ 공통 모듈 사용

export const revalidate = 60; 
const APP_ID = 'lck-2026-app';

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  try {
    const matchSnap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'matches', id));
    if (!matchSnap.exists()) return <div className="min-h-screen bg-[#0a0a0c] text-white flex items-center justify-center">Match not found</div>;

    const safeData = serializeData(matchSnap.data());
    const matchData = { id: matchSnap.id, ...safeData };

    // 팀 데이터 가져오기
    const [hSnap, aSnap] = await Promise.all([
        getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'teams', String(matchData.home.id))),
        getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'teams', String(matchData.away.id)))
    ]);

    // ⭐ 공통 함수 사용으로 코드 통일
    const rosters = {
        home: getRosterMap(hSnap.exists() ? serializeData(hSnap.data()) : null),
        away: getRosterMap(aSnap.exists() ? serializeData(aSnap.data()) : null)
    };

    return (
      <MatchDetailView 
        matchData={matchData} 
        initialRosters={rosters}
        initialAvgRatings={matchData.stats?.games || {}}
        initialComments={[]} 
      />
    );

  } catch (e: any) { 
      return <div className="min-h-screen bg-[#0a0a0c] text-slate-500 flex items-center justify-center">Error: {e.message}</div>; 
  }
}