import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const PANDASCORE_TOKEN = process.env.PANDASCORE_TOKEN;

export async function GET(request: Request) {
  if (!PANDASCORE_TOKEN) return NextResponse.json({ error: "Missing Token" }, { status: 500 });

  try {
    // 1. 날짜 계산 (어제 & 오늘 구하기)
    const kstOffset = 9 * 60 * 60 * 1000;
    const now = new Date();
    const kstNow = new Date(now.getTime() + kstOffset);
    
    // 오늘
    const todayStr = kstNow.toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7);

    // ⭐ 어제 (24시간 전)
    const yesterdayDate = new Date(kstNow);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    // 2. 시스템 로그 가져오기
    const logRef = doc(db, 'system', 'pandascore');
    const logSnap = await getDoc(logRef);
    const dbData = logSnap.exists() ? logSnap.data() : {};

    const logData = {
        todayCalls: dbData.todayCalls || 0,
        monthlyCalls: dbData.monthlyCalls || 0,
        lastRun: dbData.lastRun || null,
        lastCallDate: dbData.lastCallDate || ''
    };

    if (logData.lastCallDate !== todayStr) {
        logData.todayCalls = 0; 
        if (!logData.lastCallDate.startsWith(currentMonthStr)) {
            logData.monthlyCalls = 0; 
        }
    }

    // 3. ⭐ [핵심 변경] "어제"부터의 경기를 가져옵니다.
    // 어제 경기가 아직 LIVE 상태로 멈춰있을 수 있으니까요.
    const q = query(collection(db, 'matches'), where('date', '>=', yesterdayStr));
    const snap = await getDocs(q);
    
    // 이미 끝난(FINISHED) 경기는 제외하되, 
    // 혹시 결과가 잘못돼서 다시 돌리는 경우를 대비해 필요하다면 이 필터를 뺄 수도 있습니다.
    // 지금은 쿼터 절약을 위해 유지합니다.
    const activeMatches = snap.docs.filter(doc => doc.data().status !== 'FINISHED');

    let apiCalled = false;
    let updatedCount = 0;

    // 4. API 호출
    if (activeMatches.length > 0) {
        console.log(`🐼 Fetching matches from ${yesterdayStr} to ${todayStr}...`);
        
        // ⭐ [핵심 변경] PandaScore에게 "어제부터 오늘까지"의 데이터를 달라고 요청합니다.
        // range[begin_at]을 사용합니다.
        const response = await fetch(
            `https://api.pandascore.co/lol/matches?range[begin_at]=${yesterdayStr}T00:00:00Z,${todayStr}T23:59:59Z&token=${PANDASCORE_TOKEN}`
        );
        
        if (!response.ok) throw new Error(`PandaScore API Failed: ${response.statusText}`);
        
        const pandaData = await response.json();
        apiCalled = true;

        for (const myMatch of activeMatches) {
            const myData = myMatch.data();
            const homeCode = myData.home.code || myData.home.name;
            const awayCode = myData.away.code || myData.away.name;

            const foundPandaMatch = pandaData.find((p: any) => {
                const teamA = p.opponents[0]?.opponent?.acronym;
                const teamB = p.opponents[1]?.opponent?.acronym;
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

                if (teamA_Code === homeCode) {
                    realHomeScore = teamA_Res.score;
                    realAwayScore = teamB_Res.score;
                } else {
                    realHomeScore = teamB_Res.score;
                    realAwayScore = teamA_Res.score;
                }

                // PandaScore status: 'not_started', 'running', 'finished'
                let newStatus = 'SCHEDULED';
                if (foundPandaMatch.status === 'running') newStatus = 'LIVE';
                if (foundPandaMatch.status === 'finished') newStatus = 'FINISHED';

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

    // 5. 로그 저장
    if (apiCalled) {
        logData.todayCalls += 1;
        logData.monthlyCalls += 1;
    }
    
    await setDoc(logRef, {
        ...logData,
        lastRun: kstNow.toISOString(),
        lastCallDate: todayStr,
        lastResult: apiCalled ? `Success (${updatedCount} updated)` : 'Skipped (No active matches)',
        status: 'OK'
    });

    return NextResponse.json({ 
        success: true, 
        apiCalled, 
        updated: updatedCount,
        usage: { today: logData.todayCalls, month: logData.monthlyCalls } 
    });

  } catch (error) {
    await setDoc(doc(db, 'system', 'pandascore'), { 
        lastRun: new Date().toISOString(), 
        status: 'ERROR', 
        errorMsg: String(error) 
    }, { merge: true });

    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}