import "./globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

export const metadata: Metadata = {
  title: '협곡평점.GG - LCK 실시간 선수 평점 & 도파민 투표',
  description: '오늘 LCK 봤지? 선수별 플레이에 평점도 매기고, 명경기는 HYPE 하자!',
  openGraph: {
    title: '협곡평점.GG - 너의 POG는 누구?',
    description: 'LCK 실시간 선수 평점, 경기별 도파민 지수 투표, 솔직한 리뷰까지',
    url: 'https://hyeop-pyeong-gg.vercel.app', // 배포 도메인
    siteName: '협곡평점.GG',
    images: [
      {
        url: '/og-image.png', // public 폴더에 1200x630 사이즈로 멋진 썸네일 하나 넣으세요!
        width: 1200,
        height: 630,
      },
    ],
    locale: 'ko_KR',
    type: 'website',
  },
};