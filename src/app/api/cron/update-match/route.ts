import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const PANDASCORE_TOKEN = process.env.PANDASCORE_TOKEN;

export async function GET(request: Request) {
  if (!PANDASCORE_TOKEN) return NextResponse.json({ error: "Missing PandaScore Token" }, { status: 500 });

  try {
    const kstOffset = 9 * 60 * 60 * 1000;
    const now = new Date();
    const kstNow = new Date(now.getTime() + kstOffset);
    
    const todayStr = kstNow.toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7); 

    const yesterdayDate = new Date(kstNow);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

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

    const q = query(collection(db, 'matches'), where('date', '>=', yesterdayStr));
    const snap = await getDocs(q);
    
    // ⭐ [최적화] 필터링 로직 강화
    const activeMatches = snap.docs.filter(doc => {
        const data = doc.data();
        
        // 1. 이미 끝난 건 패스
        if (data.status === 'FINISHED') return false; 
        
        // 2. LIVE면 무조건 호출 (점수판 중계 중)
        if (data.status === 'LIVE') return true;

        // 3. SCHEDULED(예정) 상태일 때
        if (data.date) {
            const matchTime = new Date(data.date.replace(' ', 'T') + ':00'); 
            const diffMs = matchTime.getTime() - kstNow.getTime();
            const diffMinutes = diffMs / (1000 * 60); // 분 단위 변환

            // ⭐ [핵심] 경기 시작 10분 전 ~ 이미 시간 지남(음수)일 때만 호출
            // 예: 17:00 경기인데 지금 16:30 -> 30분 남음 -> 호출 X
            // 예: 17:00 경기인데 지금 16:55 -> 5분 남음 -> 호출 O
            // 예: 17:00 경기인데 지금 17:10 -> -10분 (이미 지남) -> 호출 O (상태를 LIVE로 바꿔야 하니까!)
            if (diffMinutes <= 10) return true;
        }

        return false;
    });

    let apiCalled = false;
    let updatedCount = 0;

    if (activeMatches.length > 0) {
        console.log(`🐼 Found ${activeMatches.length} matches needed update. Calling API...`);
        
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
    } else {
        // 호출 안 함 로그
        console.log("🐼 No urgent matches. Save money mode ON.");
    }

    if (apiCalled) {
        logData.todayCalls += 1;
        logData.monthlyCalls += 1;
    }
    
    await setDoc(logRef, {
        ...logData,
        lastRun: kstNow.toISOString(),
        lastCallDate: todayStr,
        lastResult: apiCalled 
            ? `Success (${updatedCount} updated)` 
            : `Skipped (Next match > 10m away)`, // 로그 메시지 변경
        status: 'OK'
    });

    return NextResponse.json({ 
        success: true, 
        apiCalled, 
        updated: updatedCount,
        usage: { today: logData.todayCalls, month: logData.monthlyCalls } 
    });

  } catch (error) {
    console.error("Cron Error:", error);
    await setDoc(doc(db, 'system', 'pandascore'), { 
        lastRun: new Date().toISOString(), 
        status: 'ERROR', 
        errorMsg: String(error) 
    }, { merge: true });

    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}