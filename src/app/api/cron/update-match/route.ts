import { NextResponse } from 'next/server';
import { db, auth } from '@/lib/firebase'; 
import { signInAnonymously } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const APP_ID = 'lck-2026-app';
const PANDASCORE_TOKEN = process.env.PANDASCORE_TOKEN;

// --- [Helper] 인증 및 API 호출 ---

async function ensureAuth() {
    if (auth.currentUser) return auth.currentUser;
    try {
        await signInAnonymously(auth);
        return auth.currentUser;
    } catch (error) {
        console.error("🔥 Firebase Auth Failed:", error);
        throw new Error("Firebase Authentication failed");
    }
}

async function fetchPanda(endpoint: string) {
    if (!PANDASCORE_TOKEN) throw new Error("PANDASCORE_TOKEN is missing");
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${endpoint}${separator}token=${PANDASCORE_TOKEN}`;
    // console.log(`📡 Fetching Panda: ${endpoint}`); // 로그 너무 많으면 주석 처리
    const res = await fetch(url, { cache: 'no-store' }); // 캐싱 방지
    if (!res.ok) {
        const text = await res.text();
        console.error(`❌ Panda API Error (${res.status}):`, text.substring(0, 100));
        throw new Error(`PandaScore API Error: ${res.status}`);
    }
    return await res.json();
}

// --- [Helper] DB 저장 공통 로직 (중복 제거 및 일관성 유지) ---
// 전체 동기화와 스마트 동기화가 같은 저장 방식을 사용하도록 분리했습니다.
async function saveMatchToDB(m: any) {
    // 상대팀 정보가 없는(TBD) 경기는 저장 제외
    if (!m.opponents || m.opponents.length < 2) return false;

    console.log(`💾 Saving Match: ${m.name} (Status: ${m.status}, Score: ${m.results[0]?.score}:${m.results[1]?.score})`);

    const date = new Date(m.begin_at);
    // KST 변환
    const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().replace("T", " ").substring(0, 16);

    const gamesData = (m.games || []).map((g: any, index: number) => ({
        id: g.id,
        position: g.position || index + 1,
        finished: g.finished,
        winner_id: g.winner?.id || null,
    }));

    const matchData = {
        id: m.id,
        league: "LCK",
        round: m.serie?.name || "2026 Season",
        date: kstDate,
        original_date: m.begin_at,
        status: m.status.toUpperCase(), // RUNNING, FINISHED, NOT_STARTED
        number_of_games: m.number_of_games, // Bo3, Bo5
        home: {
            id: m.opponents[0].opponent.id,
            name: m.opponents[0].opponent.name,
            code: m.opponents[0].opponent.acronym,
            logo: m.opponents[0].opponent.image_url,
            score: m.results[0]?.score || 0 // 실시간 점수
        },
        away: {
            id: m.opponents[1].opponent.id,
            name: m.opponents[1].opponent.name,
            code: m.opponents[1].opponent.acronym,
            logo: m.opponents[1].opponent.image_url,
            score: m.results[1]?.score || 0 // 실시간 점수
        },
        games: gamesData,
        updatedAt: serverTimestamp()
    };
    
    // 경로: artifacts/lck-2026-app/public/data/matches/{id}
    // merge: true 옵션으로 기존 stats 필드(평점)를 날리지 않고 유지함
    await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'matches', String(m.id)), matchData, { merge: true });
    return true;
}


// --- [기능 1] 팀 데이터 동기화 (기존 Admin 기능 유지) ---
async function syncTeamToDB(idOrName: string) {
    await ensureAuth();
    let teamData: any = null;
    const isId = !isNaN(Number(idOrName));

    if (isId) {
        console.log(`🔍 Fetching by ID Filter: ${idOrName}`);
        const results = await fetchPanda(`https://api.pandascore.co/lol/teams?filter[id]=${idOrName}`);
        if (results && results.length > 0) teamData = results[0];
    } else {
        const term = encodeURIComponent(idOrName);
        console.log(`🔍 Searching team by name: ${idOrName}`);
        let results = await fetchPanda(`https://api.pandascore.co/lol/teams?search[acronym]=${term}`);
        if (!results || results.length === 0) {
            results = await fetchPanda(`https://api.pandascore.co/lol/teams?search[name]=${term}`);
        }

        if (results && results.length > 0) {
            const target = idOrName.toUpperCase();
            teamData = results.find((t: any) => t.name === idOrName) ||
                       results.find((t: any) => t.acronym?.toUpperCase() === target) ||
                       results.find((t: any) => t.location === 'KR') ||
                       results[0];
            console.log(`✅ Selected: ${teamData.name}`);
        }
    }

    if (!teamData) throw new Error(`Team '${idOrName}' not found.`);

    if (!teamData.players || teamData.players.length === 0) {
        try {
            console.log("⚠️ Fetching details for roster...");
            const detail = await fetchPanda(`https://api.pandascore.co/lol/teams/${teamData.id}`);
            teamData = detail; 
        } catch (e) {
            console.warn("⚠️ Detail fetch failed, saving basic info only.");
        }
    }

    const docId = String(teamData.id);
    const playerDetails = (teamData.players || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        role: p.role || 'unknown',
        image: p.image_url,
        active: true
    }));

    await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'teams', docId), {
        id: teamData.id,
        name: teamData.name,
        acronym: teamData.acronym,
        logo: teamData.image_url,
        year: "2026",
        playerDetails: playerDetails,
        updatedAt: serverTimestamp()
    }, { merge: true });

    return { success: true, team: teamData.name, players_count: playerDetails.length, year: "2026" };
}

// --- [기능 2] 전체 경기 데이터 동기화 (기존 Admin 기능 유지) ---
async function syncMatchData() {
    await ensureAuth();
    console.log("🎮 Full Sync (2026 All Matches) Started...");
    
    // LCK 2026 전체 범위
    const url = `https://api.pandascore.co/lol/matches?filter[league_id]=293&range[begin_at]=2026-01-01T00:00:00Z,2026-12-31T23:59:59Z&per_page=100&sort=begin_at`;
    const matches = await fetchPanda(url);
    console.log(`🐼 PandaScore returned: ${matches.length} matches`);

    if (matches.length === 0) {
        return { success: false, count: 0, message: "No matches found from API" };
    }
    
    let count = 0;
    for (const m of matches) {
        const saved = await saveMatchToDB(m);
        if (saved) count++;
    }
    
    console.log(`✅ Full Sync Completed: ${count} matches updated.`);
    return { success: true, count, message: "Full match data synced" };
}

// --- [기능 3] 스마트 동기화 (NEW: Cron Job 전용) ---
// 현재 시간 기준 ±12시간 내의 경기만 업데이트하여 API 호출을 아끼고, 실시간성을 확보함
async function syncLiveAndRecentMatches() {
    await ensureAuth();
    
    const now = new Date();
    const past = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1시간 전
    const future = new Date(now.getTime() + 1 * 60 * 60 * 1000); // 1시간 후
    const rangeString = `${past.toISOString()},${future.toISOString()}`;
    
    console.log(`⏱️ Smart Cron Triggered: Checking range ${rangeString}`);

    // 범위 필터 적용
    const url = `https://api.pandascore.co/lol/matches?filter[league_id]=293&range[begin_at]=${rangeString}&sort=begin_at`;
    const matches = await fetchPanda(url);

    if (matches.length === 0) {
        console.log("💤 No active/recent matches found within range.");
        return { success: true, count: 0, message: "No active matches nearby" };
    }

    let count = 0;
    for (const m of matches) {
        const saved = await saveMatchToDB(m);
        if (saved) count++;
    }

    return { success: true, count, message: `Smart Sync: Updated ${count} matches` };
}


// ⭐ 메인 API 라우트 핸들러
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        let mode = searchParams.get('mode');
        const targetId = searchParams.get('id');
        const inspectId = searchParams.get('inspectId');
        const inspectType = searchParams.get('inspectType');

        // ⭐ [핵심 수정] Vercel Cron은 파라미터 없이 호출하므로, mode가 없으면 자동으로 'cron' 모드로 인식
        // 이를 통해 400 Bad Request 에러를 해결합니다.
        if (!mode) {
            console.log("🤖 Incoming Request without mode -> Assuming CRON JOB");
            mode = 'cron';
        }

        console.log(`🤖 API Request: mode=${mode}, target=${targetId || inspectId}`);

        // 1. 크론잡 (자동 실행 - 스마트 업데이트)
        if (mode === 'cron') {
            const result = await syncLiveAndRecentMatches();
            return NextResponse.json(result);
        }

        // 2. Admin Inspect 기능 (기존 유지)
        if (mode === 'inspect') {
            if (!inspectId) throw new Error("Missing inspectId");
            let url = "";
            if (inspectType === 'match') url = `https://api.pandascore.co/lol/matches/${inspectId}`;
            else if (inspectType === 'team') {
                if (!isNaN(Number(inspectId))) url = `https://api.pandascore.co/lol/teams/${inspectId}`;
                else url = `https://api.pandascore.co/lol/teams?search[name]=${encodeURIComponent(inspectId)}`;
            }
            const data = await fetchPanda(url);
            return NextResponse.json(data);
        }

        // 3. Admin 팀 동기화 기능 (기존 유지)
        if (mode === 'sync_team' && targetId) {
            const result = await syncTeamToDB(targetId);
            return NextResponse.json(result);
        }

        // 4. Admin 전체 경기 동기화 기능 (기존 유지)
        if (mode === 'sync_matches') {
            const result = await syncMatchData(); // 전체 동기화 함수 호출
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: "Invalid mode parameter" }, { status: 400 });

    } catch (error: any) {
        console.error("🔥 Critical API Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error", details: String(error) }, 
            { status: 500 }
        );
    }
}