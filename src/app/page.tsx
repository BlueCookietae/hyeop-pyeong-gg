import { db } from '@/lib/firebase';
import { collection, getDocs, query, limit, where, orderBy } from 'firebase/firestore';
import HomeView from '@/components/HomeView';
import { Suspense } from 'react'; 

export const revalidate = 60;
const APP_ID = 'lck-2026-app'; // ⭐ 경로 상수

// 직렬화 헬퍼
const serializeData = (data: any) => {
  if (!data) return null;
  return JSON.parse(JSON.stringify(data, (key, value) => {
    if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
       return new Date(value.seconds * 1000).toISOString();
    }
    return value;
  }));
};

export default async function Page() {
  let matches: any[] = [];
  let rosters: Record<string, any> = {}; // ⭐ 구조 변경: string[] -> object

  try {
    const kstOffset = 9 * 60 * 60 * 1000;
    const now = new Date();
    const kstDate = new Date(now.getTime() + kstOffset);
    const todayStr = kstDate.toISOString().split('T')[0];

    // 1. 매치 데이터 가져오기 (artifacts 경로)
    const matchesRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'matches');
    
    // 쿼리 단순화를 위해 전체 로드 후 필터링 (데이터 양이 많지 않다고 가정)
    // 실제 운영 시엔 복합 인덱스 생성 후 쿼리 분리 추천
    const matchSnap = await getDocs(matchesRef);
    const allRawMatches = matchSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    matches = allRawMatches.map(data => serializeData(data));
    // 날짜 정렬 (최신순)
    matches.sort((a, b) => b.date.localeCompare(a.date));

    // 2. 팀 로스터 가져오기
    const teamsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'teams');
    const teamSnap = await getDocs(teamsRef);
    
    teamSnap.forEach(doc => {
      const data = doc.data();
      const safeData = serializeData(data);
      
      // ⭐ [중요] 포지션별 선수 매핑
      // playerDetails: [{ name: 'Zeus', role: 'top' }, ...] -> { TOP: 'Zeus', ... }
      if (safeData && safeData.playerDetails) {
          const rosterMap: Record<string, string> = {};
          safeData.playerDetails.forEach((p: any) => {
             // PandaScore role -> Standard Position 변환
             let pos = 'SUB';
             const r = p.role?.toLowerCase();
             if (r === 'top') pos = 'TOP';
             else if (r === 'jun' || r === 'jungle') pos = 'JGL';
             else if (r === 'mid') pos = 'MID';
             else if (r === 'adc') pos = 'ADC';
             else if (r === 'sup' || r === 'support') pos = 'SUP';
             
             // 해당 포지션에 이미 있으면(주전 경쟁 등), 일단 덮어쓰거나 별도 처리 (여기선 간단히 덮어씀)
             // 실제론 starters 배열을 참조해야 정확하지만, 편의상 role 기반 매핑
             if (p.active) rosterMap[pos] = p.name;
          });
          rosters[safeData.id] = rosterMap; // Team ID를 키로 사용
          rosters[safeData.name] = rosterMap; // Team Name도 키로 사용 (백업)
      }
    });

  } catch (e) {
    console.error("🔥 Server Fetch Error:", e);
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400 font-bold">Loading Arena...</div>}>
      <HomeView initialMatches={matches} initialRosters={rosters} />
    </Suspense>
  );
}