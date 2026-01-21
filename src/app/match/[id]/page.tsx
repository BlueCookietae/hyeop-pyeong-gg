import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore'; 
import MatchDetailView from '@/components/MatchDetailView';
import { Suspense } from 'react'; 

export const revalidate = 60; 
const APP_ID = 'lck-2026-app';

const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];

const serializeData = (data: any) => {
  if (!data) return null;
  return JSON.parse(JSON.stringify(data, (key, value) => {
    if (value && typeof value === 'object' && 'seconds' in value) {
       return new Date(value.seconds * 1000).toISOString();
    }
    return value;
  }));
};

// ⭐ [수정] 단순 이름 매핑 -> 객체 배열 매핑 ({ name, image, id })
const getRosterMap = (teamData: any) => {
    const map: Record<string, any[]> = {}; // POS -> Array of Players
    POSITIONS.forEach(pos => map[pos] = []);

    if (teamData && teamData.playerDetails) {
        teamData.playerDetails.forEach((p: any) => {
            let pos = 'SUB';
            const r = p.role?.toLowerCase();
            if (r === 'top') pos = 'TOP';
            else if (r === 'jun' || r === 'jungle') pos = 'JGL';
            else if (r === 'mid') pos = 'MID';
            else if (r === 'adc') pos = 'ADC';
            else if (r === 'sup' || r === 'support') pos = 'SUP';
            
            if (p.active && map[pos]) {
                map[pos].push({
                    id: p.id,
                    name: p.name, // e.g. "Faker"
                    image: p.image || null // 선수 이미지 URL
                });
            }
        });
    }
    return map;
};

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  try {
    const matchSnap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'matches', id));
    if (!matchSnap.exists()) return <div>Match not found</div>;

    const safeData = serializeData(matchSnap.data());
    const matchData = { id: matchSnap.id, ...safeData };

    // 팀 데이터 가져오기
    const [hSnap, aSnap] = await Promise.all([
        getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'teams', String(matchData.home.id))),
        getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'teams', String(matchData.away.id)))
    ]);

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

  } catch (e: any) { return <div>Error: {e.message}</div>; }
}