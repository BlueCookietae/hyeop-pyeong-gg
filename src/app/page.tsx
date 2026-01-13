import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query, limit, where } from 'firebase/firestore';
import HomeView from '@/components/HomeView';
import { Suspense } from 'react'; // ⭐ 1. Suspense 불러오기

// 60초 캐싱
export const revalidate = 60; 

export default async function Page() {
  let matches: any[] = [];
  let rosters: Record<string, string[]> = {};

  try {
    const kstOffset = 9 * 60 * 60 * 1000;
    const now = new Date();
    const kstDate = new Date(now.getTime() + kstOffset);
    const todayStr = kstDate.toISOString().split('T')[0];

    const futureQuery = query(
      collection(db, 'matches'),
      where('date', '>=', todayStr), 
      orderBy('date', 'asc'),        
      limit(10)                      
    );

    const pastQuery = query(
      collection(db, 'matches'),
      where('date', '<', todayStr),  
      orderBy('date', 'desc'),       
      limit(10)                      
    );

    const [futureSnap, pastSnap] = await Promise.all([
      getDocs(futureQuery),
      getDocs(pastQuery)
    ]);

    const rawMatches = [...futureSnap.docs, ...pastSnap.docs];

    matches = rawMatches.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        date: data.date?.toDate ? data.date.toDate().toISOString() : data.date,
      };
    });

    matches.sort((a, b) => b.date.localeCompare(a.date));

    const teamSnap = await getDocs(collection(db, 'teams'));
    teamSnap.forEach(doc => {
      rosters[doc.id] = doc.data().roster;
    });

  } catch (e) {
    console.error("🔥 Server Fetch Error:", e);
  }

  // ⭐ 2. Suspense로 HomeView 감싸기
  // fallback은 로딩되는 찰나에 보여줄 화면인데, null로 둬도 됩니다.
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading...</div>}>
      <HomeView initialMatches={matches} initialRosters={rosters} />
    </Suspense>
  );
}