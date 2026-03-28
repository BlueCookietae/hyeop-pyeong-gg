import { ImageResponse } from 'next/og';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { APP_ID } from '@/constants/config';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const POSITIONS = [
  { key: 'TOP', icon: 'top.png' },
  { key: 'JGL', icon: 'jungle.png' },
  { key: 'MID', icon: 'middle.png' },
  { key: 'ADC', icon: 'bottom.png' },
  { key: 'SUP', icon: 'support.png' },
] as const;

async function urlToBase64(url: string): Promise<string | null> {
  try {
    const proxied = `https://wsrv.nl/?url=${url.replace(/^https?:\/\//, '')}&output=png&w=120&h=120`;
    const res = await fetch(proxied, { cache: 'no-store' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
  } catch { return null; }
}

function localIconBase64(filename: string): string {
  const p = path.join(process.cwd(), 'public', 'icons', filename);
  const buf = fs.readFileSync(p);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let homeCode = '?', awayCode = '?', league = 'LCK', dateLabel = '';
  let homeScore = 0, awayScore = 0;
  let homeLogo: string | null = null, awayLogo: string | null = null;
  let isFinished = false;

  type PosRow = { pos: string; icon: string; home: { name: string; avg: number } | null; away: { name: string; avg: number } | null };
  const posRows: PosRow[] = [];

  // 포지션 아이콘 미리 로드
  const iconBase64: Record<string, string> = {};
  for (const p of POSITIONS) {
    try { iconBase64[p.key] = localIconBase64(p.icon); } catch {}
  }

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

      const [hl, al] = await Promise.all([
        m.home?.logo ? urlToBase64(m.home.logo) : Promise.resolve(null),
        m.away?.logo ? urlToBase64(m.away.logo) : Promise.resolve(null),
      ]);
      homeLogo = hl;
      awayLogo = al;

      if (m.stats?.games) {
        const totals: Record<string, { sum: number; count: number }> = {};
        for (const gameStats of Object.values(m.stats.games) as any[]) {
          for (const [name, stat] of Object.entries(gameStats) as [string, any][]) {
            if (stat?.count > 0) {
              if (!totals[name]) totals[name] = { sum: 0, count: 0 };
              totals[name].sum += stat.sum;
              totals[name].count += stat.count;
            }
          }
        }

        const [hSnap, aSnap] = await Promise.all([
          m.home?.id ? getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'teams', String(m.home.id))) : Promise.resolve(null),
          m.away?.id ? getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'teams', String(m.away.id))) : Promise.resolve(null),
        ]);

        const byPos = (snap: any, posKey: string): any[] => {
          if (!snap?.exists()) return [];
          return (snap.data().playerDetails || []).filter((p: any) => {
            const r = p.role?.toLowerCase() || '';
            if (posKey === 'TOP') return r.includes('top');
            if (posKey === 'JGL') return r.includes('jun') || r.includes('jgl');
            if (posKey === 'MID') return r.includes('mid');
            if (posKey === 'ADC') return r.includes('adc') || r.includes('bot');
            if (posKey === 'SUP') return r.includes('sup');
            return false;
          });
        };

        const bestPlayer = (players: any[]): { name: string; avg: number } | null => {
          let best: { name: string; avg: number } | null = null;
          for (const p of players) {
            const t = totals[p.name];
            if (t?.count > 0) {
              const avg = t.sum / t.count;
              if (!best || avg > best.avg) best = { name: p.name, avg };
            }
          }
          return best;
        };

        for (const { key, icon } of POSITIONS) {
          posRows.push({
            pos: key,
            icon,
            home: bestPlayer(byPos(hSnap, key)),
            away: bestPlayer(byPos(aSnap, key)),
          });
        }
      }
    }
  } catch {}

  const homeWin = isFinished && homeScore > awayScore;
  const awayWin = isFinished && awayScore > homeScore;
  // 승팀=빨강, 패팀=파랑, 미결=회색
  const homeBoxColor = !isFinished ? '#1e293b' : homeWin ? '#dc2626' : '#1d4ed8';
  const awayBoxColor = !isFinished ? '#1e293b' : awayWin ? '#dc2626' : '#1d4ed8';
  const hasRatings = posRows.some(r => r.home || r.away);

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%',
        background: '#0a0a0f',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'sans-serif',
        padding: '28px 40px 20px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* 배경 글로우 */}
        <div style={{
          position: 'absolute', width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)',
          top: '50%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex',
        }} />

        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 22, color: '#64748b', fontWeight: 700, letterSpacing: 3, display: 'flex' }}>{dateLabel}</div>
          <div style={{ fontSize: 20, color: '#22d3ee', fontWeight: 900, letterSpacing: 1, display: 'flex' }}>협곡평점.GG</div>
        </div>

        {/* 팀 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasRatings ? 16 : 0 }}>
          {/* 홈팀 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
            {homeLogo
              ? <img src={homeLogo} style={{ width: 56, height: 56, objectFit: 'contain', opacity: homeWin ? 1 : 0.4 }} />
              : <div style={{ width: 56, height: 56, background: '#1e293b', borderRadius: 10, display: 'flex' }} />}
            <span style={{
              fontSize: 44, fontWeight: 900, fontStyle: 'italic', letterSpacing: -2,
              color: homeWin ? 'white' : '#475569', display: 'flex',
            }}>{homeCode}</span>
          </div>

          {/* 스코어 */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {isFinished ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 52, fontWeight: 900, color: homeWin ? 'white' : '#475569', display: 'flex' }}>{homeScore}</span>
                <span style={{ fontSize: 24, color: '#334155', fontWeight: 700, display: 'flex' }}>:</span>
                <span style={{ fontSize: 52, fontWeight: 900, color: awayWin ? 'white' : '#475569', display: 'flex' }}>{awayScore}</span>
              </div>
            ) : (
              <div style={{ fontSize: 28, color: '#334155', fontWeight: 900, display: 'flex' }}>vs</div>
            )}
            <div style={{ fontSize: 12, color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3, display: 'flex' }}>{league}</div>
          </div>

          {/* 어웨이팀 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, justifyContent: 'flex-end' }}>
            <span style={{
              fontSize: 44, fontWeight: 900, fontStyle: 'italic', letterSpacing: -2,
              color: awayWin ? 'white' : '#475569', display: 'flex',
            }}>{awayCode}</span>
            {awayLogo
              ? <img src={awayLogo} style={{ width: 56, height: 56, objectFit: 'contain', opacity: awayWin ? 1 : 0.4 }} />
              : <div style={{ width: 56, height: 56, background: '#1e293b', borderRadius: 10, display: 'flex' }} />}
          </div>
        </div>

        {/* 구분선 */}
        {hasRatings && (
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 12, display: 'flex' }} />
        )}

        {/* 포지션별 평점 */}
        {hasRatings && posRows.map(({ pos, home, away }) => (
          <div key={pos} style={{
            display: 'flex', alignItems: 'center',
            padding: '7px 0',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            {/* 홈 선수명 */}
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: 14 }}>
              <span style={{ fontSize: 20, color: '#94a3b8', fontWeight: 600, display: 'flex' }}>
                {home?.name ?? ''}
              </span>
            </div>

            {/* 홈 평점 박스 */}
            <div style={{
              width: 52, height: 34,
              background: home ? homeBoxColor : 'transparent',
              borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginRight: 10,
            }}>
              {home && <span style={{ fontSize: 18, fontWeight: 900, color: 'white', display: 'flex' }}>{home.avg.toFixed(1)}</span>}
            </div>

            {/* 포지션 아이콘 */}
            <div style={{ width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {iconBase64[pos]
                ? <img src={iconBase64[pos]} style={{ width: 22, height: 22, objectFit: 'contain', opacity: 0.5 }} />
                : <span style={{ fontSize: 11, color: '#475569', fontWeight: 700, display: 'flex' }}>{pos}</span>}
            </div>

            {/* 어웨이 평점 박스 */}
            <div style={{
              width: 52, height: 34,
              background: away ? awayBoxColor : 'transparent',
              borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginLeft: 10,
            }}>
              {away && <span style={{ fontSize: 18, fontWeight: 900, color: 'white', display: 'flex' }}>{away.avg.toFixed(1)}</span>}
            </div>

            {/* 어웨이 선수명 */}
            <div style={{ flex: 1, paddingLeft: 14, display: 'flex' }}>
              <span style={{ fontSize: 20, color: '#94a3b8', fontWeight: 600, display: 'flex' }}>
                {away?.name ?? ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    ),
    { ...size }
  );
}
