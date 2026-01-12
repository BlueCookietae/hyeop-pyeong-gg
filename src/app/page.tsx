import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import HomeView from '@/components/HomeView';

// 60초 캐싱 (서버비 절약)
export const revalidate = 60; 

export default async function Page() {
  let matches: any[] = [];
  let rosters: any = {};

  try {
    // 1. 경기 정보 가져오기
    const matchSnap = await getDocs(query(collection(db, 'matches'), orderBy('date', 'desc')));
    
    // ⭐ [여기가 수정됨] 데이터를 "단순한 값"으로 변환(직렬화)하는 과정
    matches = matchSnap.docs.map(d => {
      const data = d.data();
      
      return {
        id: d.id,
        ...data,
        // 1. createdAt이 Firestore Timestamp 객체라면 -> 문자열로 변환
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        
        // 2. 혹시 date도 Timestamp로 저장되어 있다면 -> 문자열로 변환 (이미 문자열이면 그대로 둠)
        date: data.date?.toDate ? data.date.toDate().toISOString() : data.date,

        // 3. (만약 있다면) updatedAt 등 다른 Timestamp도 똑같이 변환해줘야 함
      };
    });

    // 2. 팀 로스터 정보 가져오기
    const teamSnap = await getDocs(collection(db, 'teams'));
    teamSnap.forEach(doc => {
      rosters[doc.id] = doc.data().roster;
    });

  } catch (e) {
    console.error("Server Fetch Error:", e);
  }

  // 3. 클라이언트 컴포넌트로 데이터 전달
  return (
    <HomeView initialMatches={matches} initialRosters={rosters} />
  );
}