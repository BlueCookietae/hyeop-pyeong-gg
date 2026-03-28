import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = '협곡평점.GG - LCK 선수 평점 커뮤니티';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
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
        }}
      >
        {/* 배경 글로우 */}
        <div style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
        }} />

        {/* 메인 타이틀 */}
        <div style={{
          fontSize: 80,
          fontWeight: 900,
          color: '#22d3ee',
          letterSpacing: '-4px',
          fontStyle: 'italic',
          textTransform: 'uppercase',
          lineHeight: 1,
          marginBottom: 16,
          display: 'flex',
        }}>
          협곡평점.GG
        </div>

        {/* 서브타이틀 */}
        <div style={{
          fontSize: 32,
          color: '#94a3b8',
          fontWeight: 700,
          marginBottom: 48,
          display: 'flex',
        }}>
          LCK 선수 평점을 직접 남기세요
        </div>

        {/* 평점 카드 예시 3개 */}
        <div style={{ display: 'flex', gap: 24 }}>
          {[
            { name: 'Faker', pos: 'MID', score: '9.4', color: '#f87171' },
            { name: 'Keria', pos: 'SUP', score: '8.9', color: '#22d3ee' },
            { name: 'Chovy', pos: 'MID', score: '8.7', color: '#22d3ee' },
          ].map(p => (
            <div key={p.name} style={{
              background: 'rgba(15,23,42,0.8)',
              border: '1px solid rgba(51,65,85,0.8)',
              borderRadius: 16,
              padding: '16px 28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, display: 'flex' }}>{p.pos}</div>
              <div style={{ fontSize: 22, color: 'white', fontWeight: 900, fontStyle: 'italic', display: 'flex' }}>{p.name}</div>
              <div style={{ fontSize: 36, color: p.color, fontWeight: 900, fontStyle: 'italic', lineHeight: 1, display: 'flex' }}>{p.score}</div>
            </div>
          ))}
        </div>

        {/* URL */}
        <div style={{
          position: 'absolute',
          bottom: 32,
          fontSize: 20,
          color: '#334155',
          fontWeight: 700,
          display: 'flex',
        }}>
          hyeop-pyeong-gg.vercel.app
        </div>
      </div>
    ),
    { ...size }
  );
}
