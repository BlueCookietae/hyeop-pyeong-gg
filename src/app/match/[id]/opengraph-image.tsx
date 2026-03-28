import { ImageResponse } from 'next/og';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { APP_ID } from '@/constants/config';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'] as const;

async function toBase64(url: string): Promise<string | null> {
  try {
    const proxied = `https://wsrv.nl/?url=${url.replace(/^https?:\/\//, '')}&output=png&w=80&h=80`;
    const res = await fetch(proxied, { cache: 'no-store' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
  } catch { return null; }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let homeCode = '?', awayCode = '?', league = 'LCK', dateLabel = '';
  let homeScore = 0, awayScore = 0;
  let homeLogo: string | null = null, awayLogo: string | null = null;
  let isFinished = false;

  // 포지션별 [홈선수명+평점, 어웨이선수명+평점]
  const posRows: { pos: string; home: { name: string; avg: number } | null; away: { name: string; avg: number } | null }[] = [];

  try {
    const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'matches', id));
    if (snap.exists()) {
      const m = snap.data();
      homeCode = m.home?.code || m.home?.name || '?';
      awayCode = m.away?.code || m.away?.name || '?';
      league = m.league || 'LCK';
      homeScore = m.home?.score ?? 0;
      awayScore = m.away?.score ?? 0;
      isFinished = m.status === 'FINISHED';
      const d = (m.date || '').replace(/-/g, '');
      dateLabel = d.length >= 8 ? d.substring(2, 8) : '';

      // 팀 로고 base64 변환
      const [hl, al] = await Promise.all([
        m.home?.logo ? toBase64(m.home.logo) : Promise.resolve(null),
        m.away?.logo ? toBase64(m.away.logo) : Promise.resolve(null),
      ]);
      homeLogo = hl;
      awayLogo = al;

      // 선수별 통합 평점 집계
      if (m.stats?.games) {
        const playerTotals: Record<string, { sum: number; count: number }> = {};
        for (const gameStats of Object.values(m.stats.games) as any[]) {
          for (const [name, stat] of Object.entries(gameStats) as [string, any][]) {
            if (stat?.count > 0) {
              if (!playerTotals[name]) playerTotals[name] = { sum: 0, count: 0 };
              playerTotals[name].sum += stat.sum;
              playerTotals[name].count += stat.count;
            }
          }
        }

        // 홈/어웨이 로스터에서 포지션별 대표 선수 추출
        const getTopPlayer = (players: any[]): { name: string; avg: number } | null => {
          if (!players?.length) return null;
          let best: { name: string; avg: number } | null = null;
          for (const p of players) {
            const t = playerTotals[p.name];
            if (t && t.count > 0) {
              const avg = t.sum / t.count;
              if (!best || avg > best.avg) best = { name: p.name, avg };
            }
          }
          return best;
        };

        // 홈/어웨이 팀 데이터에서 포지션별 선수 가져오기
        const [hSnap, aSnap] = await Promise.all([
          m.home?.id ? getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'teams', String(m.home.id))) : Promise.resolve(null),
          m.away?.id ? getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'teams', String(m.away.id))) : Promise.resolve(null),
        ]);

        const getPlayersByPos = (teamSnap: any, pos: string): any[] => {
          if (!teamSnap?.exists()) return [];
          const data = teamSnap.data();
          return (data.playerDetails || []).filter((p: any) => {
            const r = p.role?.toLowerCase() || '';
            if (pos === 'TOP') return r.includes('top');
            if (pos === 'JGL') return r.includes('jun') || r.includes('jgl');
            if (pos === 'MID') return r.includes('mid');
            if (pos === 'ADC') return r.includes('adc') || r.includes('bot');
            if (pos === 'SUP') return r.includes('sup');
            return false;
          });
        };

        for (const pos of POSITIONS) {
          const homePlayers = getPlayersByPos(hSnap, pos);
          const awayPlayers = getPlayersByPos(aSnap, pos);
          posRows.push({
            pos,
            home: getTopPlayer(homePlayers),
            away: getTopPlayer(awayPlayers),
          });
        }
      }
    }
  } catch {}

  const hasRatings = posRows.some(r => r.home || r.away);
  const homeWin = isFinished && homeScore > awayScore;
  const awayWin = isFinished && awayScore > homeScore;

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%',
        background: '#09090b',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'sans-serif',
        padding: '36px 48px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* 배경 글로우 */}
        <div style={{
          position: 'absolute', width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)',
          top: '50%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex',
        }} />

        {/* 상단: 날짜 + 리그 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 20, color: '#475569', fontWeight: 700, letterSpacing: 3, display: 'flex' }}>
            {dateLabel}
          </div>
          <div style={{ fontSize: 18, color: '#22d3ee', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', display: 'flex' }}>
            협곡평점.GG
          </div>
        </div>

        {/* 중앙: 팀 로고 + 스코어 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: hasRatings ? 28 : 0 }}>
          {/* 홈팀 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: 1 }}>
            {homeLogo
              ? <img src={homeLogo} style={{ width: 72, height: 72, objectFit: 'contain' }} />
              : <div style={{ width: 72, height: 72, background: '#1e293b', borderRadius: 12, display: 'flex' }} />
            }
            <div style={{
              fontSize: 52, fontWeight: 900, fontStyle: 'italic', letterSpacing: -2,
              color: homeWin ? 'white' : '#64748b',
              display: 'flex',
            }}>{homeCode}</div>
          </div>

          {/* 스코어 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            {isFinished ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 64, fontWeight: 900, color: homeWin ? 'white' : '#475569', display: 'flex' }}>{homeScore}</span>
                <span style={{ fontSize: 28, color: '#334155', fontWeight: 700, display: 'flex' }}>:</span>
                <span style={{ fontSize: 64, fontWeight: 900, color: awayWin ? 'white' : '#475569', display: 'flex' }}>{awayScore}</span>
              </div>
            ) : (
              <div style={{ fontSize: 32, color: '#334155', fontWeight: 900, display: 'flex' }}>vs</div>
            )}
            <div style={{ fontSize: 14, color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, display: 'flex' }}>{league}</div>
          </div>

          {/* 어웨이팀 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: 1 }}>
            {awayLogo
              ? <img src={awayLogo} style={{ width: 72, height: 72, objectFit: 'contain' }} />
              : <div style={{ width: 72, height: 72, background: '#1e293b', borderRadius: 12, display: 'flex' }} />
            }
            <div style={{
              fontSize: 52, fontWeight: 900, fontStyle: 'italic', letterSpacing: -2,
              color: awayWin ? 'white' : '#64748b',
              display: 'flex',
            }}>{awayCode}</div>
          </div>
        </div>

        {/* 포지션별 평점 테이블 */}
        {hasRatings && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {posRows.filter(r => r.home || r.away).map(({ pos, home, away }) => (
              <div key={pos} style={{
                display: 'flex', alignItems: 'center',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 8, padding: '6px 16px',
              }}>
                {/* 홈 선수 */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                  {home ? (
                    <>
                      <span style={{ fontSize: 18, color: '#94a3b8', fontWeight: 700, display: 'flex' }}>{home.name}</span>
                      <span style={{ fontSize: 22, fontWeight: 900, fontStyle: 'italic', color: home.avg >= 8 ? '#f87171' : '#22d3ee', display: 'flex' }}>{home.avg.toFixed(1)}</span>
                    </>
                  ) : <span style={{ display: 'flex' }} />}
                </div>
                {/* 포지션 */}
                <div style={{ width: 52, textAlign: 'center', fontSize: 11, color: '#334155', fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', display: 'flex', justifyContent: 'center' }}>
                  {pos}
                </div>
                {/* 어웨이 선수 */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {away ? (
                    <>
                      <span style={{ fontSize: 22, fontWeight: 900, fontStyle: 'italic', color: away.avg >= 8 ? '#f87171' : '#22d3ee', display: 'flex' }}>{away.avg.toFixed(1)}</span>
                      <span style={{ fontSize: 18, color: '#94a3b8', fontWeight: 700, display: 'flex' }}>{away.name}</span>
                    </>
                  ) : <span style={{ display: 'flex' }} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    { ...size }
  );
}
