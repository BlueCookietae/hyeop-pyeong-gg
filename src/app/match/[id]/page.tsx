import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'; 
import MatchDetailView from '@/components/MatchDetailView';

// ⭐ 60초 캐싱 (이게 있어야 과금 폭탄을 막습니다!)
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
  
  try {
    // ⭐ [핵심 수정] 경기 정보와 댓글 50개를 "동시에" 요청 시작합니다.
    // 이렇게 하면 직렬로 가져올 때보다 2배 이상 빨라집니다.
    const matchPromise = getDoc(doc(db, "matches", matchId));
    const commentsPromise = getDocs(query(
      collection(db, "matchComments"),
      where("matchId", "==", matchId),
      orderBy("createdAt", "desc"),
      limit(50) 
    ));

    const [matchSnap, commentSnap] = await Promise.all([matchPromise, commentsPromise]);

    if (!matchSnap.exists()) {
      return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">경기 정보를 찾을 수 없습니다.</div>;
    }

    const data = matchSnap.data();
    const matchData = { 
      id: matchSnap.id, 
      ...data,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
      date: data.date 
    };

    // 평점 계산 로직 (기존 유지)
    const avgRatings: Record<string, number> = {};
    const stats = data.stats || {};
    Object.keys(stats).forEach(key => {
      if (stats[key].count > 0) {
          avgRatings[key] = stats[key].sum / stats[key].count;
      }
    });

    // 댓글 가공 (기존 유지)
    const serverComments = commentSnap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toISOString() : null
    }));

    // 3. 로스터 가져오기 (이것도 병렬 처리)
    const year = data.date ? data.date.split('-')[0] : '2025';
    const homeId = `${data.home.name}_${year}`;
    const awayId = `${data.away.name}_${year}`;

    const [hSnap, aSnap] = await Promise.all([
      getDoc(doc(db, "teams", homeId)),
      getDoc(doc(db, "teams", awayId))
    ]);

    const rawHome = hSnap.exists() ? hSnap.data().roster : POSITIONS.map(p => `${data.home.name} ${p}`);
    const rawAway = aSnap.exists() ? aSnap.data().roster : POSITIONS.map(p => `${data.away.name} ${p}`);

    const rosters = {
      home: rawHome.map((n: string) => formatPlayerName(n, data.home.name)),
      away: rawAway.map((n: string) => formatPlayerName(n, data.away.name))
    };

    return (
      <MatchDetailView 
        matchData={matchData} 
        initialRosters={rosters}
        initialAvgRatings={avgRatings}
        initialComments={serverComments} 
      />
    );

  } catch (e) {
    console.error("🔥 Server Fetch Error (Critical):", e);
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">데이터 로딩 중 치명적 오류가 발생했습니다.</div>;
  }
}