import { NextResponse } from 'next/server';

// 공식 웹사이트용 공개 키 (환경변수 없으면 이거라도 쓰도록 백업)
const FALLBACK_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z";
const LCK_ID = "98767991310872058";

export async function GET() {
  try {
    // 환경변수 우선, 없으면 하드코딩 값 사용
    const apiKey = process.env.LOL_ESPORTS_API_KEY || FALLBACK_KEY;
    
    const url = new URL("https://esports-api.lolesports.com/persisted/gw/getSchedule");
    url.searchParams.append("hl", "ko-KR");
    url.searchParams.append("leagueId", LCK_ID);
    
    // API 호출
    const res = await fetch(url.toString(), {
      headers: { 
        "x-api-key": apiKey,
        // 봇 차단 방지용 헤더
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Riot API Error (${res.status}): ${errText}`);
    }
    
    const data = await res.json();

    // ⭐ [핵심 방어] 데이터 구조가 깊어서 중간에 하나라도 없으면 에러남 -> 안전하게 접근
    const events = data?.data?.schedule?.events;

    if (!Array.isArray(events)) {
        // 일정이 없거나 구조가 바뀐 경우, 에러 대신 빈 배열 반환해서 클라이언트 안 터지게 함
        console.warn("Riot API returned no events or invalid structure.");
        return NextResponse.json({ count: 0, matches: [] }); 
    }
    
    const formattedMatches = events
      .filter((e: any) => e.type === 'match' && e.match?.teams?.length === 2)
      .map((e: any) => {
        const match = e.match;
        const home = match.teams[0];
        const away = match.teams[1];
        
        const dateObj = new Date(e.startTime);
        const dateStr = dateObj.toISOString().split('T')[0];
        const timeStr = dateObj.toTimeString().split(' ')[0].substring(0, 5);

        return {
          id: `LCK_${dateStr}_${home.code}_vs_${away.code}`,
          league: e.league?.name || "LCK",
          round: e.blockName || "Regular Season",
          date: `${dateStr} ${timeStr}`,
          status: e.state === 'unstarted' ? 'SCHEDULED' : (e.state === 'completed' ? 'FINISHED' : 'LIVE'),
          home: {
            name: home.name,
            code: home.code, 
            logo: home.image,
            score: home.result?.gameWins || 0
          },
          away: {
            name: away.name,
            code: away.code,
            logo: away.image,
            score: away.result?.gameWins || 0
          },
          matchId: match.id 
        };
      });

    return NextResponse.json({ count: formattedMatches.length, matches: formattedMatches });

  } catch (error: any) {
    console.error("LCK Server Error:", error);
    // ⭐ 에러가 나도 JSON 포맷을 지켜서 보냄
    return NextResponse.json({ error: error.message, matches: [] }, { status: 500 });
  }
}