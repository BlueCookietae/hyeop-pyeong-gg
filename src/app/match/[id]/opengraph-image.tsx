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

function localFileBase64(relPath: string): string | null {
  try {
    const p = path.join(process.cwd(), 'public', relPath);
    const buf = fs.readFileSync(p);
    const ext = relPath.split('.').pop() || 'png';
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch { return null; }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let homeCode = '?', awayCode = '?', league = 'LCK', dateLabel = '';
  let homeScore = 0, awayScore = 0;
  let homeLogo: string | null = null, awayLogo: string | null = null;
  let isFinished = false;

  type PosRow = { pos: string; home: { name: string; avg: number } | null; away: { name: string; avg: number } | null };
  const posRows: PosRow[] = [];

  const iconBase64: Record<string, string> = {};
  for (const p of POSITIONS) {
    const b = localFileBase64(`icons/${p.icon}`);
    if (b) iconBase64[p.key] = b;
  }
  const bgBase64 = localFileBase64('og-bg.jpg');

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

        for (const { key } of POSITIONS) {
          posRows.push({ pos: key, home: bestPlayer(byPos(hSnap, key)), away: bestPlayer(byPos(aSnap, key)) });
        }
      }
    }
  } catch {}

  const homeWin = isFinished && homeScore > awayScore;
  const awayWin = isFinished && awayScore > homeScore;
  const homeBoxColor = !isFinished ? '#6b7280' : homeWin ? '#dc2626' : '#1d4ed8';
  const awayBoxColor = !isFinished ? '#6b7280' : awayWin ? '#dc2626' : '#1d4ed8';
  const hasRatings = posRows.some(r => r.home || r.away);

  // 텍스트 색상 — 라이트 배경이므로 어둡게
  const textPrimary = '#1e1b4b';   // 진한 남보라
  const textSecondary = '#4c1d95'; // 보라
  const textMuted = '#6d28d9';

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%',
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'sans-serif',
        overflow: 'hidden',
      }}>
        {/* 배경 이미지 */}
        {bgBase64 && (
          <img src={bgBase64} style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
          }} />
        )}

        {/* 흰색 오버레이 — 배경 밝히기 */}
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          background: 'rgba(255,255,255,0.60)',
          display: 'flex',
        }} />

        {/* 콘텐츠 */}
        <div style={{
          position: 'relative', display: 'flex', flexDirection: 'column',
          padding: '28px 48px 20px', height: '100%',
        }}>
          {/* 헤더 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 22, color: textMuted, fontWeight: 700, letterSpacing: 3, display: 'flex' }}>{dateLabel}</div>
            <div style={{ fontSize: 20, color: '#7c3aed', fontWeight: 900, letterSpacing: 1, display: 'flex' }}>협곡평점.GG</div>
          </div>

          {/* 팀 섹션: 로고+팀명이 스코어 바로 양옆 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: hasRatings ? 18 : 0 }}>

            {/* 홈팀: 팀명 + 로고 (오른쪽 정렬) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              {homeLogo
                ? <img src={homeLogo} style={{ width: 64, height: 64, objectFit: 'contain' }} />
                : <div style={{ width: 64, height: 64, background: 'rgba(0,0,0,0.1)', borderRadius: 10, display: 'flex' }} />}
              <span style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', color: textPrimary, letterSpacing: -1, display: 'flex' }}>{homeCode}</span>
            </div>

            {/* 스코어 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              {isFinished ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 64, fontWeight: 900, color: homeWin ? '#dc2626' : '#374151', display: 'flex', lineHeight: 1 }}>{homeScore}</span>
                  <span style={{ fontSize: 28, color: '#9ca3af', fontWeight: 700, display: 'flex' }}>:</span>
                  <span style={{ fontSize: 64, fontWeight: 900, color: awayWin ? '#dc2626' : '#374151', display: 'flex', lineHeight: 1 }}>{awayScore}</span>
                </div>
              ) : (
                <div style={{ fontSize: 40, color: '#9ca3af', fontWeight: 900, display: 'flex' }}>vs</div>
              )}
              <div style={{ fontSize: 12, color: textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 3, display: 'flex' }}>{league}</div>
            </div>

            {/* 어웨이팀: 로고 + 팀명 (왼쪽 정렬) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              {awayLogo
                ? <img src={awayLogo} style={{ width: 64, height: 64, objectFit: 'contain' }} />
                : <div style={{ width: 64, height: 64, background: 'rgba(0,0,0,0.1)', borderRadius: 10, display: 'flex' }} />}
              <span style={{ fontSize: 28, fontWeight: 900, fontStyle: 'italic', color: textPrimary, letterSpacing: -1, display: 'flex' }}>{awayCode}</span>
            </div>
          </div>

          {/* 구분선 */}
          {hasRatings && (
            <div style={{ height: 1, background: 'rgba(109,40,217,0.2)', marginBottom: 10, display: 'flex' }} />
          )}

          {/* 포지션별 평점 */}
          {hasRatings && posRows.map(({ pos, home, away }) => (
            <div key={pos} style={{
              display: 'flex', alignItems: 'center',
              padding: '6px 0',
              borderBottom: '1px solid rgba(109,40,217,0.1)',
            }}>
              {/* 홈 선수명 */}
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: 12 }}>
                <span style={{ fontSize: 20, color: '#1f2937', fontWeight: 600, display: 'flex' }}>{home?.name ?? ''}</span>
              </div>

              {/* 홈 평점 박스 */}
              <div style={{
                width: 52, height: 34,
                background: home ? homeBoxColor : 'transparent',
                borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginRight: 8,
              }}>
                {home && <span style={{ fontSize: 18, fontWeight: 900, color: 'white', display: 'flex' }}>{home.avg.toFixed(1)}</span>}
              </div>

              {/* 포지션 아이콘 */}
              <div style={{ width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {iconBase64[pos]
                  ? <img src={iconBase64[pos]} style={{ width: 20, height: 20, objectFit: 'contain', opacity: 0.4 }} />
                  : <span style={{ fontSize: 10, color: textMuted, fontWeight: 700, display: 'flex' }}>{pos}</span>}
              </div>

              {/* 어웨이 평점 박스 */}
              <div style={{
                width: 52, height: 34,
                background: away ? awayBoxColor : 'transparent',
                borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginLeft: 8,
              }}>
                {away && <span style={{ fontSize: 18, fontWeight: 900, color: 'white', display: 'flex' }}>{away.avg.toFixed(1)}</span>}
              </div>

              {/* 어웨이 선수명 */}
              <div style={{ flex: 1, paddingLeft: 12, display: 'flex' }}>
                <span style={{ fontSize: 20, color: '#1f2937', fontWeight: 600, display: 'flex' }}>{away?.name ?? ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
