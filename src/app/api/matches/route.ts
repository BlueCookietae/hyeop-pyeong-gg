import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get('matchId');
  const RIOT_API_KEY = process.env.RIOT_API_KEY;

  // 1. 초기 파라미터 확인 로그
  console.log("--------- API 호출 시작 ---------");
  console.log("전달받은 Match ID:", matchId);
  console.log("API 키 존재 여부:", RIOT_API_KEY ? "O (앞 8자리: " + RIOT_API_KEY.substring(0, 8) + "...)" : "X");

  if (!matchId) return NextResponse.json({ error: 'Match ID is required' }, { status: 400 });

try {
    const apiUrl = `https://asia.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    console.log("호출 URL:", apiUrl);

    const response = await fetch(apiUrl, {
      headers: { "X-Riot-Token": RIOT_API_KEY! }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Riot API 에러 상세:", errorText);
      throw new Error(`Riot API 호출 실패 (상태코드: ${response.status})`);
    }

    const data = await response.json();
    console.log("데이터 파싱 성공!");

    const participants = data.info.participants;
    
    // 포지션 매핑용 (Riot 데이터 순서가 일정하지 않을 수 있지만 기본적으로 이 순서를 따름)
// src/app/api/matches/route.ts 내부

const formatTeam = (startIndex: number) => ({
  // Riot API에서 teamId 100은 블루, 200은 레드입니다.
  // teams[0].win이 블루팀의 승리 여부를 알려줍니다.
  name: startIndex === 0 ? "BLUE TEAM" : "RED TEAM",
  win: startIndex === 0 ? data.info.teams[0].win : data.info.teams[1].win, // ⭐ 이 줄이 꼭 있어야 합니다!
  players: participants.slice(startIndex, startIndex + 5).map((p: any, idx: number) => ({
    id: p.puuid,
    name: p.riotIdGameName ? `${p.riotIdGameName}#${p.riotIdTagline}` : p.summonerName,
    position: ['TOP', 'JGL', 'MID', 'ADC', 'SUP'][idx],
    championId: p.championId,
  }))
});

    console.log("데이터 가공 완료. 클라이언트로 전송합니다.");

    return NextResponse.json({
      id: matchId,
      title: "LIVE MATCH DATA",
      date: new Date(data.info.gameCreation).toLocaleDateString(),
      // ⭐ 핵심 수정: Riot API v5 정식 경로 반영
      score: `${data.info.teams[0]?.objectives?.champion?.kills ?? 0}:${data.info.teams[1]?.objectives?.champion?.kills ?? 0}`,
      teams: {
        home: formatTeam(0),
        away: formatTeam(5)
      }
    });

  } catch (error: any) {
    console.error("--------- 에러 발생 ---------");
    console.error("메시지:", error.message);
    return NextResponse.json({ 
      error: '데이터 가공 중 에러 발생',
      details: error.message 
    }, { status: 500 });
  }
}