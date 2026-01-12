import { NextResponse } from 'next/server';

// LoL Esports 공식 내부 API 설정값
const LOLESPORTS_API_URL = "https://esports-api.lolesports.com/persisted/gw/getSchedule";
const API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"; // 웹사이트에서 사용하는 공개 API 키
const LCK_LEAGUE_ID = "98767991310872058"; // LCK 고유 ID

export async function GET() {
  try {
    // 1. LoL Esports 서버에 일정 요청
    const url = new URL(LOLESPORTS_API_URL);
    url.searchParams.append("hl", "ko-KR"); // 한국어 데이터
    url.searchParams.append("leagueId", LCK_LEAGUE_ID);
    
// 👇 [중요] 여기 headers 부분을 수정하세요!
    const res = await fetch(url.toString(), {
      headers: { 
        "x-api-key": API_KEY,
        // ⭐ 이 줄이 없으면 봇으로 인식되어 차단됩니다!
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    
if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ API 에러 발생 (${res.status}):`, errText);
      throw new Error(`API 접속 실패: ${res.status}`);
    }
    
    const data = await res.json();

    // 2. 우리 DB 구조에 맞게 데이터 가공 (Formatting)
    const events = data.data.schedule.events;
    
    // 'match' 타입이면서 팀 정보가 있는 경기만 필터링
    const formattedMatches = events
      .filter((e: any) => e.type === 'match' && e.match.teams.length === 2)
      .map((e: any) => {
        const match = e.match;
        const homeTeam = match.teams[0];
        const awayTeam = match.teams[1];
        
        // 날짜 포맷팅 (YYYY-MM-DD HH:MM)
        const dateObj = new Date(e.startTime);
        const dateStr = dateObj.toISOString().split('T')[0];
        const timeStr = dateObj.toTimeString().split(' ')[0].substring(0, 5);

        return {
          // 중복 방지용 ID (리그명_날짜_팀)
          id: `LCK_${dateStr}_${homeTeam.code}_vs_${awayTeam.code}`,
          league: e.league.name, // "LCK"
          round: e.blockName,    // "Week 1" 등
          date: `${dateStr} ${timeStr}`,
          status: e.state === 'unstarted' ? 'SCHEDULED' : (e.state === 'completed' ? 'FINISHED' : 'LIVE'),
          home: {
            name: homeTeam.name,      // "T1"
            code: homeTeam.code,      // "T1"
            logo: homeTeam.image,     // 공식 로고 URL
            score: homeTeam.result?.gameWins || 0
          },
          away: {
            name: awayTeam.name,      // "Gen.G"
            code: awayTeam.code,      // "GEN"
            logo: awayTeam.image,
            score: awayTeam.result?.gameWins || 0
          },
          matchId: match.id // 나중에 상세 통계 가져올 때 쓸 ID
        };
      });

    return NextResponse.json({ 
      count: formattedMatches.length,
      matches: formattedMatches 
    });

  } catch (error: any) {
    console.error("LCK 로드 에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}