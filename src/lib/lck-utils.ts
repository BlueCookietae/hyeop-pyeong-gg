// src/lib/lck-utils.ts
import type { RosterMap, Player } from '@/types';

export const POSITIONS = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'];

// Firestore 데이터 직렬화 (Timestamp -> String)
export const serializeData = (data: any) => {
  if (!data) return null;
  return JSON.parse(JSON.stringify(data, (key, value) => {
    if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
       return new Date(value.seconds * 1000).toISOString();
    }
    return value;
  }));
};

// 팀 데이터에서 로스터(선수 명단) 추출 및 정렬 (주전 우선)
export const getRosterMap = (teamData: any): RosterMap => {
    const map: RosterMap = { TOP: [], JGL: [], MID: [], ADC: [], SUP: [] };

    if (teamData && teamData.playerDetails) {
        const startersList: number[] = teamData.starters || [];

        teamData.playerDetails.forEach((p: any) => {
            let pos: keyof RosterMap | 'SUB' = 'SUB';
            const r = p.role?.toLowerCase() || '';
            if (r.includes('top')) pos = 'TOP';
            else if (r.includes('jun') || r.includes('jgl')) pos = 'JGL';
            else if (r.includes('mid')) pos = 'MID';
            else if (r.includes('adc') || r.includes('bot')) pos = 'ADC';
            else if (r.includes('sup')) pos = 'SUP';

            if (p.active && pos !== 'SUB') {
                const player: Player = {
                    id: p.id,
                    name: p.name,
                    image: p.image || null,
                    isStarter: startersList.includes(p.id),
                };
                map[pos].push(player);
            }
        });

        // 주전 선수가 맨 앞(0번)에 오도록 정렬
        (Object.keys(map) as (keyof RosterMap)[]).forEach(pos => {
            if (map[pos].length > 1) {
                map[pos].sort((a: Player, b: Player) => {
                    if (a.isStarter && !b.isStarter) return -1;
                    if (!a.isStarter && b.isStarter) return 1;
                    return 0;
                });
            }
        });
    }
    return map;
};