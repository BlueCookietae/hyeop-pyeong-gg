import { NextResponse } from 'next/server';
import { db, auth } from '@/lib/firebase'; 
import { signInAnonymously } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const APP_ID = 'lck-2026-app';
const PANDASCORE_TOKEN = process.env.PANDASCORE_TOKEN;

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
    console.log(`📡 Fetching Panda: ${endpoint}`); 
    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text();
        console.error(`❌ Panda API Error (${res.status}):`, text.substring(0, 100));
        throw new Error(`PandaScore API Error: ${res.status}`);
    }
    return await res.json();
}

// --- 기능 로직 ---

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

// ⭐ [디버깅 강화] 경기 데이터 동기화
async function syncMatchData() {
    await ensureAuth();
    console.log("🎮 Syncing Match Data (Start)...");
    
    // 1. LCK 리그 ID 확인 (293이 맞는지, 혹은 2026년 데이터가 있는지)
    // 범위를 넓혀서 100개를 긁어봅니다.
    const url = `https://api.pandascore.co/lol/matches?filter[league_id]=293&range[begin_at]=2026-01-01T00:00:00Z,2026-12-31T23:59:59Z&per_page=100&sort=begin_at`;
    
    const matches = await fetchPanda(url);
    
    console.log(`🐼 PandaScore returned: ${matches.length} matches`); // ⭐ 몇 개 왔는지 확인!

    if (matches.length === 0) {
        console.warn("⚠️ No matches found for LCK (ID 293) in 2026.");
        console.warn("👉 Try checking if the League ID is correct or if the schedule is published.");
        return { success: false, count: 0, message: "No matches found from API" };
    }
    
    let count = 0;
    for (const m of matches) {
        // 상대팀 정보가 없는(TBD) 경기는 제외
        if (!m.opponents || m.opponents.length < 2) {
            console.log(`Skipping match ${m.id}: Opponents not ready (TBD)`);
            continue;
        }
        
        console.log(`💾 Saving Match: ${m.name} (${m.begin_at})`);

        const date = new Date(m.begin_at);
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
            status: m.status.toUpperCase(),
            home: {
                id: m.opponents[0].opponent.id,
                name: m.opponents[0].opponent.name,
                code: m.opponents[0].opponent.acronym,
                logo: m.opponents[0].opponent.image_url,
                score: m.results[0]?.score || 0
            },
            away: {
                id: m.opponents[1].opponent.id,
                name: m.opponents[1].opponent.name,
                code: m.opponents[1].opponent.acronym,
                logo: m.opponents[1].opponent.image_url,
                score: m.results[1]?.score || 0
            },
            games: gamesData,
            updatedAt: serverTimestamp()
        };
        
        // 경로 확인: artifacts/lck-2026-app/public/data/matches/{id}
        await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'matches', String(m.id)), matchData, { merge: true });
        count++;
    }
    
    console.log(`✅ Successfully saved ${count} matches to Firestore.`);
    return { success: true, count, message: "Match data synced" };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const mode = searchParams.get('mode');
        const targetId = searchParams.get('id');
        const inspectId = searchParams.get('inspectId');
        const inspectType = searchParams.get('inspectType');

        console.log(`🤖 API Request: mode=${mode}, target=${targetId || inspectId}`);

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

        if (mode === 'sync_team' && targetId) {
            const result = await syncTeamToDB(targetId);
            return NextResponse.json(result);
        }

        if (mode === 'sync_matches') {
            const result = await syncMatchData();
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