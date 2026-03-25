import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { serializeData, getRosterMap } from '@/lib/lck-utils';
import { APP_ID, POSITIONS } from '@/constants/config';
import type { Match, Player, Position, PlayerRankData, MatchHighlight } from '@/types';
import RankingView from '@/components/RankingView';

// 비용 최소화: 1시간 캐시 (홈의 60초 대비 60배 절약)
export const revalidate = 3600;

export default async function RankingPage() {
  try {
    // 1. 완료된 경기 데이터만 가져오기
    const matchesSnap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'matches'));
    const matches = matchesSnap.docs
      .map(d => serializeData({ id: d.id, ...d.data() }) as Match)
      .filter(m => m.status === 'FINISHED' && m.stats?.games);

    // 2. 팀/로스터 데이터 가져오기 → playerName → { team, position, image } 매핑
    const teamsSnap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'teams'));
    const playerInfoMap: Record<string, {
      teamName: string;
      teamCode: string;
      teamLogo: string;
      position: Position;
      image?: string | null;
    }> = {};

    teamsSnap.forEach(doc => {
      const team = serializeData(doc.data());
      if (!team) return;
      const rosterMap = getRosterMap(team);
      POSITIONS.forEach(pos => {
        rosterMap[pos].forEach((player: Player) => {
          playerInfoMap[player.name] = {
            teamName: team.name,
            teamCode: team.acronym,
            teamLogo: team.logo,
            position: pos,
            image: player.image,
          };
        });
      });
    });

    // 3. 선수별 통계 집계
    const playerStats: Record<string, {
      totalSum: number;
      totalCount: number;
      matchHighlights: MatchHighlight[];
    }> = {};

    for (const match of matches) {
      if (!match.stats?.games) continue;

      // 이 경기에서 선수별 전체 합산 (게임들 합산)
      const matchPlayerStats: Record<string, { sum: number; count: number }> = {};

      for (const gameStats of Object.values(match.stats.games)) {
        for (const [playerName, stat] of Object.entries(gameStats)) {
          if (stat.count === 0) continue;
          if (!matchPlayerStats[playerName]) matchPlayerStats[playerName] = { sum: 0, count: 0 };
          matchPlayerStats[playerName].sum += stat.sum;
          matchPlayerStats[playerName].count += stat.count;
        }
      }

      // 전체 집계에 반영 (경기당 최소 3개 평점)
      for (const [playerName, stat] of Object.entries(matchPlayerStats)) {
        if (stat.count < 3) continue;

        if (!playerStats[playerName]) {
          playerStats[playerName] = { totalSum: 0, totalCount: 0, matchHighlights: [] };
        }

        playerStats[playerName].totalSum += stat.sum;
        playerStats[playerName].totalCount += stat.count;
        playerStats[playerName].matchHighlights.push({
          matchId: String(match.id),
          homeTeam: match.home.code,
          awayTeam: match.away.code,
          date: match.date,
          avgRating: stat.sum / stat.count,
        });
      }
    }

    // 4. 랭킹 데이터 생성 (최소 5개 평점 필터)
    const rankingData: PlayerRankData[] = Object.entries(playerStats)
      .filter(([name, stats]) => playerInfoMap[name] && stats.totalCount >= 5)
      .map(([name, stats]) => {
        const info = playerInfoMap[name];
        const avgRating = stats.totalSum / stats.totalCount;
        const sorted = [...stats.matchHighlights].sort((a, b) => b.avgRating - a.avgRating);
        const best = sorted[0] ?? null;
        const worst = sorted[sorted.length - 1] ?? null;
        // 경기가 1개뿐이면 최고/최저 둘 다 표시 안 함
        const hasDiff = sorted.length > 1 && best && worst && best.avgRating !== worst.avgRating;

        return {
          name,
          image: info.image,
          teamName: info.teamName,
          teamCode: info.teamCode,
          teamLogo: info.teamLogo,
          position: info.position,
          avgRating,
          totalRatings: stats.totalCount,
          bestMatch: hasDiff ? best : null,
          worstMatch: hasDiff ? worst : null,
        };
      })
      .sort((a, b) => b.avgRating - a.avgRating);

    return <RankingView rankingData={rankingData} />;

  } catch (e: any) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-500 flex items-center justify-center">
        Error: {e.message}
      </div>
    );
  }
}
