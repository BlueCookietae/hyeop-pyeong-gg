import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query, limit, where } from 'firebase/firestore';
import HomeView from '@/components/HomeView';

// 60초 캐싱 (서버비 절약)
export const revalidate = 60; 

export default async function Page() {
  let matches: any[] = [];
  let rosters: Record<string, string[]> = {};

  try {
    // 📅 오늘 날짜 (KST 기준) 구하기
    // 서버 시간은 UTC일 수 있으므로 한국 시간으로 변환
    const kstOffset = 9 * 60 * 60 * 1000;
    const now = new Date();
    const kstDate = new Date(now.getTime() + kstOffset);
    // YYYY-MM-DD 형식 문자열 (예: "2025-01-13")
    const todayStr = kstDate.toISOString().split('T')[0];

    // 1️⃣ [쿼리 1] 예정된 경기 (오늘 포함 미래) -> 가까운 순서로 10개
    const futureQuery = query(
      collection(db, 'matches'),
      where('date', '>=', todayStr), // 오늘 날짜보다 크거나 같은 것
      orderBy('date', 'asc'),        // 날짜 오름차순 (오늘 -> 내일 -> 모레)
      limit(10)                      // 10개만
    );

    // 2️⃣ [쿼리 2] 지난 경기 (어제 이전) -> 최신 순서로 10개
    const pastQuery = query(
      collection(db, 'matches'),
      where('date', '<', todayStr),  // 오늘 날짜보다 작은 것
      orderBy('date', 'desc'),       // 날짜 내림차순 (어제 -> 그저께)
      limit(10)                      // 10개만
    );

    // 두 쿼리를 동시에 실행 (병렬 처리)
    const [futureSnap, pastSnap] = await Promise.all([
      getDocs(futureQuery),
      getDocs(pastQuery)
    ]);

    // 두 결과를 합치기
    const rawMatches = [...futureSnap.docs, ...pastSnap.docs];

    // 3️⃣ 데이터 직렬화 (Timestamp 처리 등)
    matches = rawMatches.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        date: data.date?.toDate ? data.date.toDate().toISOString() : data.date,
      };
    });

    // 4️⃣ 날짜순 정렬 (화면에 예쁘게 나오도록 다시 정렬)
    // 과거(내림차순)와 미래(오름차순)가 섞여있으므로, 전체를 최신순(내림차순)으로 통일
    matches.sort((a, b) => b.date.localeCompare(a.date));


    // 5️⃣ 팀 로스터 정보 가져오기
    // (팀 숫자가 적어서 이건 그냥 다 가져와도 비용이 크지 않습니다)
    const teamSnap = await getDocs(collection(db, 'teams'));
    teamSnap.forEach(doc => {
      rosters[doc.id] = doc.data().roster;
    });

  } catch (e) {
    console.error("🔥 Server Fetch Error:", e);
  }

  return (
    <HomeView initialMatches={matches} initialRosters={rosters} />
  );
}