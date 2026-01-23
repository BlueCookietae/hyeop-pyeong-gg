import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore'; 
import HomeView from '@/components/HomeView';
import { Suspense } from 'react'; 
import { serializeData, getRosterMap } from '@/lib/lck-utils'; // ⭐ 공통 모듈 사용

export const revalidate = 60; 
const APP_ID = 'lck-2026-app';

export default async function Page() {
  let matches: any[] = [];
  let rosters: Record<string, any> = {};

  try {
    // 1. 매치 데이터
    const matchesRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'matches');
    const matchSnap = await getDocs(matchesRef);
    
    matches = matchSnap.docs
      .map(d => serializeData({ id: d.id, ...d.data() }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // 2. 팀 데이터 (로스터)
    const teamsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'teams');
    const teamSnap = await getDocs(teamsRef);
    
    teamSnap.forEach(doc => {
      const safeData = serializeData({ id: doc.id, ...doc.data() });
      
      if (safeData) {
          // ⭐ 함수 호출 한 번으로 끝!
          const rosterMap = getRosterMap(safeData);
          rosters[safeData.id] = rosterMap; 
          if (safeData.name) rosters[safeData.name] = rosterMap;
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