import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'; 
import MatchDetailView from '@/components/MatchDetailView';

// ⭐ 60초 캐싱
export const revalidate = 60; 

const formatPlayerName = (fullName: string, teamName: string) => {
  if (!fullName) return '';
  return fullName.split('/').map(part => {
    const name = part.trim();
    if (name.startsWith(teamName + ' ')) return name.substring(teamName.length + 1);
    return name;
  }).join(' / ');
};

const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchId = id;
  
  let matchData: any = null;
  let rosters: { home: string[], away: string[] } = { home: [], away: [] };
  let avgRatings: Record<string, number> = {};
  let serverComments: any[] = []; 

  try {
    // 1. 경기 데이터 가져오기 (가장 중요)
    const matchSnap = await getDoc(doc(db, "matches", matchId));
    
    if (matchSnap.exists()) {
      const data = matchSnap.data();
      matchData = { 
        id: matchSnap.id, 
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        date: data.date 
      };

      const stats = data.stats || {};
      Object.keys(stats).forEach(key => {
        if (stats[key].count > 0) {
            avgRatings[key] = stats[key].sum / stats[key].count;
        }
      });

      // ⭐ [안전장치 추가] 댓글 가져오기는 실패해도 경기 정보는 보여줘야 함!
      // 별도의 try-catch로 감쌉니다.
      try {
        const commentsQuery = query(
            collection(db, "matchComments"),
            where("matchId", "==", matchId),
            orderBy("createdAt", "desc"),
            limit(50) 
        );
        
        const commentSnap = await getDocs(commentsQuery);
        serverComments = commentSnap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toISOString() : null
        }));
      } catch (commentError) {
          // 댓글 에러나면 그냥 빈 배열로 두고, 콘솔에만 찍음 (페이지 안 터지게)
          console.error("⚠️ 댓글 로딩 실패 (인덱스 문제 등):", commentError);
      }

      // 3. 로스터 가져오기
      const year = data.date ? data.date.split('-')[0] : '2025';
      const homeId = `${data.home.name}_${year}`;
      const awayId = `${data.away.name}_${year}`;

      const [hSnap, aSnap] = await Promise.all([
        getDoc(doc(db, "teams", homeId)),
        getDoc(doc(db, "teams", awayId))
      ]);

      const rawHome = hSnap.exists() ? hSnap.data().roster : POSITIONS.map(p => `${data.home.name} ${p}`);
      const rawAway = aSnap.exists() ? aSnap.data().roster : POSITIONS.map(p => `${data.away.name} ${p}`);

      rosters.home = rawHome.map((n: string) => formatPlayerName(n, data.home.name));
      rosters.away = rawAway.map((n: string) => formatPlayerName(n, data.away.name));
    }
  } catch (e) {
    console.error("🔥 Server Fetch Error (Critical):", e);
  }

  if (!matchData) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">경기 정보를 찾을 수 없습니다.</div>;

  return (
    <MatchDetailView 
      matchData={matchData} 
      initialRosters={rosters}
      initialAvgRatings={avgRatings}
      initialComments={serverComments} 
    />
  );
}