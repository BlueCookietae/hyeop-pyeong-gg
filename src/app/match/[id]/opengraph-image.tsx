import { ImageResponse } from 'next/og';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { APP_ID } from '@/constants/config';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let homeCode = '?', awayCode = '?', league = 'LCK', dateLabel = '';

  try {
    const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'matches', id));
    if (snap.exists()) {
      const m = snap.data();
      homeCode = m.home?.code || m.home?.name || '?';
      awayCode = m.away?.code || m.away?.name || '?';
      league = m.league || 'LCK';
      // "2026-03-01" → "260301"
      const d = (m.date || '').replace(/-/g, '');
      dateLabel = d.length >= 8 ? d.substring(2, 8) : '';
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

        {/* 날짜 레이블 */}
        {dateLabel && (
          <div style={{ fontSize: 28, color: '#475569', fontWeight: 700, letterSpacing: 3, marginBottom: 24, display: 'flex' }}>
            {dateLabel}
          </div>
        )}

        {/* 매치업 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 48, marginBottom: 32 }}>
          <div style={{ fontSize: 108, fontWeight: 900, color: 'white', fontStyle: 'italic', letterSpacing: -4, display: 'flex' }}>
            {homeCode}
          </div>
          <div style={{ fontSize: 40, color: '#334155', fontWeight: 900, display: 'flex' }}>vs</div>
          <div style={{ fontSize: 108, fontWeight: 900, color: 'white', fontStyle: 'italic', letterSpacing: -4, display: 'flex' }}>
            {awayCode}
          </div>
        </div>

        {/* 리그명 + 사이트 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 22, color: '#334155', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, display: 'flex' }}>
            {league}
          </div>
          <div style={{ fontSize: 22, color: '#1e293b', fontWeight: 700, display: 'flex' }}>·</div>
          <div style={{ fontSize: 22, color: '#22d3ee', fontWeight: 700, display: 'flex' }}>
            협곡평점.GG
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
