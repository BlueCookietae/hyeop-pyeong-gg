import { ImageResponse } from 'next/og';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { APP_ID } from '@/constants/config';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let homeCode = '?', awayCode = '?', league = 'LCK', date = '';

  try {
    const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'matches', id));
    if (snap.exists()) {
      const m = snap.data();
      homeCode = m.home?.code || m.home?.name || '?';
      awayCode = m.away?.code || m.away?.name || '?';
      league = m.league || 'LCK';
      date = (m.date || '').substring(5, 10).replace('-', '.');
    }
  } catch {}

  return new ImageResponse(
    (
      <div style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #020817 0%, #0f172a 50%, #020817 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* 배경 글로우 */}
        <div style={{
          position: 'absolute',
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
        }} />

        {/* 리그 + 날짜 */}
        <div style={{ fontSize: 24, color: '#64748b', fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 32, display: 'flex', gap: 16 }}>
          <span>{league}</span>
          {date && <span>· {date}</span>}
        </div>

        {/* 매치업 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 48, marginBottom: 40 }}>
          <div style={{ fontSize: 96, fontWeight: 900, color: 'white', fontStyle: 'italic', letterSpacing: -4, display: 'flex' }}>
            {homeCode}
          </div>
          <div style={{ fontSize: 36, color: '#334155', fontWeight: 900, display: 'flex' }}>VS</div>
          <div style={{ fontSize: 96, fontWeight: 900, color: 'white', fontStyle: 'italic', letterSpacing: -4, display: 'flex' }}>
            {awayCode}
          </div>
        </div>

        {/* CTA */}
        <div style={{
          background: 'rgba(6,182,212,0.15)',
          border: '1px solid rgba(6,182,212,0.4)',
          borderRadius: 12,
          padding: '12px 32px',
          fontSize: 24,
          color: '#22d3ee',
          fontWeight: 700,
          display: 'flex',
        }}>
          선수 평점 남기러 가기 →
        </div>

        {/* 사이트명 */}
        <div style={{
          position: 'absolute', bottom: 32,
          fontSize: 20, color: '#1e293b', fontWeight: 700,
          display: 'flex',
        }}>
          협곡평점.GG
        </div>
      </div>
    ),
    { ...size }
  );
}
