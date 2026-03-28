import "./globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AuthProvider from "@/components/AuthProvider";

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
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}

export const metadata: Metadata = {
  title: '협곡평점.GG - LCK 선수 평점 커뮤니티',
  description: '오늘 LCK 봤지? 선수별 플레이에 직접 평점 남기고 팬들의 평가를 확인해봐!',
  openGraph: {
    title: '협곡평점.GG - LCK 선수 평점 커뮤니티',
    description: 'LCK 경기별 선수 평점을 직접 남기고, 시즌 랭킹을 확인하세요.',
    url: 'https://hyeop-pyeong-gg.vercel.app',
    siteName: '협곡평점.GG',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '협곡평점.GG - LCK 선수 평점 커뮤니티',
    description: 'LCK 경기별 선수 평점을 직접 남기고, 시즌 랭킹을 확인하세요.',
  },
};