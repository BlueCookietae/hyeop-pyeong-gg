import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

const PANDASCORE_TOKEN = process.env.PANDASCORE_TOKEN;

export async function GET(request: Request) {
  if (!PANDASCORE_TOKEN) return NextResponse.json({ error: "Missing Token" }, { status: 500 });

  try {
    const kstOffset = 9 * 60 * 60 * 1000;
    const todayStr = new Date(Date.now() + kstOffset).toISOString().split('T')[0];

    // 1. DB에서 오늘 경기 가져오기
    const q = query(collection(db, 'matches'), where('date', '>=', todayStr));
    const snap = await getDocs(q);

    // 2. 필터링 (이미 끝난 경기 제외)
    const activeMatches = snap.docs.filter(doc => doc.data().status !== 'FINISHED');
    if (activeMatches.length === 0) return NextResponse.json({ message: "No matches." });

    // 3. PandaScore 호출
    const response = await fetch(
      `https://api.pandascore.co/lol/matches?filter[begin_at]=${todayStr}&token=${PANDASCORE_TOKEN}`
    );
    const pandaData = await response.json();
    let updatedCount = 0;

    // 4. ⭐ [핵심] Code(Acronym) 기반 매칭
    for (const myMatch of activeMatches) {
        const myData = myMatch.data();
        
        // DB에 저장된 code 사용 (없으면 name으로 fallback)
        const homeCode = myData.home.code || myData.home.name;
        const awayCode = myData.away.code || myData.away.name;

        // PandaScore에서 팀 찾기 (acronym == code)
        const foundPandaMatch = pandaData.find((p: any) => {
            const teamA = p.opponents[0]?.opponent?.acronym;
            const teamB = p.opponents[1]?.opponent?.acronym;
            
            // "T1" == "T1", "GEN" == "GEN" -> 100% 일치!
            const hasHome = teamA === homeCode || teamB === homeCode;
            const hasAway = teamA === awayCode || teamB === awayCode;
            
            return hasHome && hasAway;
        });

        if (foundPandaMatch) {
            // 점수 업데이트 로직 (이전과 동일)
            const teamA_Res = foundPandaMatch.results[0];
            const teamB_Res = foundPandaMatch.results[1];
            const teamA_Code = foundPandaMatch.opponents[0].opponent.acronym;
            
            let realHomeScore = 0;
            let realAwayScore = 0;

            if (teamA_Code === homeCode) {
                realHomeScore = teamA_Res.score;
                realAwayScore = teamB_Res.score;
            } else {
                realHomeScore = teamB_Res.score;
                realAwayScore = teamA_Res.score;
            }

            const newStatus = foundPandaMatch.status === 'finished' ? 'FINISHED' : 'LIVE';

            if (myData.home.score !== realHomeScore || myData.away.score !== realAwayScore || myData.status !== newStatus) {
                await updateDoc(doc(db, 'matches', myMatch.id), {
                    'home.score': realHomeScore,
                    'away.score': realAwayScore,
                    'status': newStatus
                });
                updatedCount++;
            }
        }
    }

    return NextResponse.json({ success: true, updated: updatedCount });

  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}