import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'; 
import MatchDetailView from '@/components/MatchDetailView';
import { Suspense } from 'react'; 

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

    const avgRatings: Record<string, number> = {};
    const stats = data.stats || {};
    Object.keys(stats).forEach(key => {
      if (stats[key].count > 0) {
          avgRatings[key] = stats[key].sum / stats[key].count;
      }
    });

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
      <>
        {/* 카드(가벼움)를 먼저 렌더링 -> 페이지 이동 체감 속도 향상 */}
        <MatchDetailView 
          matchData={matchData} 
          initialRosters={rosters}
          initialAvgRatings={avgRatings}
          initialComments={[]} // 댓글은 빈 배열로 시작
        />

        {/* 무거운 댓글 데이터는 비동기로 불러와서 클라이언트에 주입 */}
        <Suspense fallback={null}>
          <CommentsDataFetcher matchId={matchId} />
        </Suspense>
      </>
    );

  } catch (e) {
    console.error("Critical Error:", e);
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">오류가 발생했습니다.</div>;
  }
}

async function CommentsDataFetcher({ matchId }: { matchId: string }) {
  try {
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

    return <CommentsInjector comments={serverComments} />;
  } catch (e) {
    return null;
  }
}

function CommentsInjector({ comments }: { comments: any[] }) {
  return (
    <script 
      dangerouslySetInnerHTML={{
        __html: `window.__INITIAL_COMMENTS__ = ${JSON.stringify(comments)};`
      }} 
    />
  );
}