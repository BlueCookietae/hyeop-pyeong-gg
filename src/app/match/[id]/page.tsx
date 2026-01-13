import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'; 
import MatchDetailView from '@/components/MatchDetailView';
import { Suspense } from 'react'; // ⭐ 추가

// ⭐ 60초 캐싱 (과금 방지 및 성능 유지)
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
    // 1. 경기 데이터 가져오기 (가장 먼저 수행)
    const matchSnap = await getDoc(doc(db, "matches", matchId));
    
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

    // 2. 로스터 가져오기 (병렬 처리 유지)
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

    // 3. 렌더링
    return (
      <>
        {/* ⭐ 핵심 1: 댓글은 빈 배열로 넘겨서 MatchDetailView가 즉시 뜨게 합니다. */}
        <MatchDetailView 
          matchData={matchData} 
          initialRosters={rosters}
          initialAvgRatings={avgRatings}
          initialComments={[]} 
        />

        {/* ⭐ 핵심 2: 댓글 데이터 페칭을 별도의 서버 컴포넌트로 분리하여 Suspense로 감쌉니다.
            메인 페이지는 이 컴포넌트가 완료될 때까지 기다리지 않고 먼저 응답을 보냅니다.
        */}
        <Suspense fallback={null}>
          <CommentsDataFetcher matchId={matchId} />
        </Suspense>
      </>
    );

  } catch (e) {
    console.error("🔥 Server Fetch Error (Critical):", e);
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">데이터 로딩 중 치명적 오류가 발생했습니다.</div>;
  }
}

// --- 별도의 댓글 전용 서버 컴포넌트 (백그라운드에서 실행됨) ---
async function CommentsDataFetcher({ matchId }: { matchId: string }) {
  try {
    // 여기서 50개 조회를 수행합니다. (캐싱 활용됨)
    const commentsQuery = query(
      collection(db, "matchComments"),
      where("matchId", "==", matchId),
      orderBy("createdAt", "desc"),
      limit(50) 
    );
    
    const commentSnap = await getDocs(commentsQuery);
    const serverComments = commentSnap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toISOString() : null
    }));

    // 데이터를 브라우저의 전역 객체로 밀어넣어주는 인젝터를 리턴합니다.
    return <CommentsInjector comments={serverComments} />;
  } catch (e) {
    console.error("⚠️ 댓글 스트리밍 실패:", e);
    return null;
  }
}

// --- 클라이언트 데이터 주입용 헬퍼 ---
function CommentsInjector({ comments }: { comments: any[] }) {
  return (
    <script 
      dangerouslySetInnerHTML={{
        __html: `window.__INITIAL_COMMENTS__ = ${JSON.stringify(comments)};`
      }} 
    />
  );
}