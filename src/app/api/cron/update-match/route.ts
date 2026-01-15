import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const PANDASCORE_TOKEN = process.env.PANDASCORE_TOKEN;

export async function GET(request: Request) {
  if (!PANDASCORE_TOKEN) return NextResponse.json({ error: "Missing Token" }, { status: 500 });

  try {
    // 1. 날짜 및 시간 계산 (KST)
    const kstOffset = 9 * 60 * 60 * 1000;
    const now = new Date();
    const kstNow = new Date(now.getTime() + kstOffset);
    const todayStr = kstNow.toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM

    // 2. [모니터링용] 시스템 로그 가져오기 & 카운터 리셋 로직
    const logRef = doc(db, 'system', 'pandascore');
    const logSnap = await getDoc(logRef);
    let logData = logSnap.exists() ? logSnap.data() : { todayCalls: 0, monthlyCalls: 0, lastRun: null, lastCallDate: '' };

    if (logData.lastCallDate !== todayStr) {
        logData.todayCalls = 0; // 날짜 변경 시 일간 초기화
        if (!logData.lastCallDate.startsWith(currentMonthStr)) {
            logData.monthlyCalls = 0; // 월 변경 시 월간 초기화
        }
    }

    // 3. 업데이트 대상 경기 찾기 (오늘 이후 경기 중 끝나지 않은 것)
    const q = query(collection(db, 'matches'), where('date', '>=', todayStr));
    const snap = await getDocs(q);
    
    // 이미 끝난 경기는 제외 (쿼터 절약)
    const activeMatches = snap.docs.filter(doc => doc.data().status !== 'FINISHED');

    let apiCalled = false;
    let updatedCount = 0;

    // 4. 대상 경기가 있을 때만 PandaScore 호출
    if (activeMatches.length > 0) {
        console.log("🐼 Calling PandaScore API...");
        const response = await fetch(
            `https://api.pandascore.co/lol/matches?filter[begin_at]=${todayStr}&token=${PANDASCORE_TOKEN}`
        );
        
        if (!response.ok) throw new Error(`PandaScore API Failed: ${response.statusText}`);
        
        const pandaData = await response.json();
        apiCalled = true;

        // 5. Code(Acronym) 기반 데이터 매칭 및 업데이트
        for (const myMatch of activeMatches) {
            const myData = myMatch.data();
            
            // DB에 저장된 code 사용 (없으면 name으로 fallback)
            const homeCode = myData.home.code || myData.home.name;
            const awayCode = myData.away.code || myData.away.name;

            // PandaScore에서 팀 찾기 (acronym == code)
            const foundPandaMatch = pandaData.find((p: any) => {
                const teamA = p.opponents[0]?.opponent?.acronym;
                const teamB = p.opponents[1]?.opponent?.acronym;
                
                // 순서 상관없이 매칭 확인 (T1 vs GEN 혹은 GEN vs T1)
                const hasHome = teamA === homeCode || teamB === homeCode;
                const hasAway = teamA === awayCode || teamB === awayCode;
                
                return hasHome && hasAway;
            });

            if (foundPandaMatch) {
                const teamA_Res = foundPandaMatch.results[0];
                const teamB_Res = foundPandaMatch.results[1];
                const teamA_Code = foundPandaMatch.opponents[0].opponent.acronym;
                
                let realHomeScore = 0;
                let realAwayScore = 0;

                // 우리 DB의 Home이 PandaScore의 첫 번째 팀인지 확인하여 점수 배정
                if (teamA_Code === homeCode) {
                    realHomeScore = teamA_Res.score;
                    realAwayScore = teamB_Res.score;
                } else {
                    realHomeScore = teamB_Res.score;
                    realAwayScore = teamA_Res.score;
                }

                const newStatus = foundPandaMatch.status === 'finished' ? 'FINISHED' : 'LIVE';

                // 값이 다를 때만 DB 업데이트 (쓰기 비용 절약)
                if (
                    myData.home.score !== realHomeScore || 
                    myData.away.score !== realAwayScore || 
                    myData.status !== newStatus
                ) {
                    await updateDoc(doc(db, 'matches', myMatch.id), {
                        'home.score': realHomeScore,
                        'away.score': realAwayScore,
                        'status': newStatus
                    });
                    updatedCount++;
                }
            }
        }
    }

    // 6. [모니터링용] 시스템 로그 업데이트 (DB 기록)
    if (apiCalled) {
        logData.todayCalls += 1;
        logData.monthlyCalls += 1;
    }
    
    await setDoc(logRef, {
        ...logData,
        lastRun: kstNow.toISOString(),
        lastCallDate: todayStr,
        lastResult: apiCalled ? `Success (${updatedCount} updated)` : 'Skipped (No matches)',
        status: 'OK'
    });

    return NextResponse.json({ 
        success: true, 
        apiCalled, 
        updated: updatedCount,
        usage: { today: logData.todayCalls, month: logData.monthlyCalls } 
    });

  } catch (error) {
    // 에러 발생 시에도 로그 남김 (그래야 관리자 페이지에서 빨간불 확인 가능)
    await setDoc(doc(db, 'system', 'pandascore'), { 
        lastRun: new Date().toISOString(), 
        status: 'ERROR', 
        errorMsg: String(error) 
    }, { merge: true });

    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}