export type Position = 'TOP' | 'JGL' | 'MID' | 'ADC' | 'SUP';
export type TeamSide = 'home' | 'away';
export type CardTheme = 'red' | 'blue' | 'slate';

export interface Player {
  id: number;
  name: string;
  role?: string;
  image?: string | null;
  isStarter?: boolean;
}

export interface TeamInfo {
  id: number;
  name: string;
  code: string;
  logo: string;
  score: number;
}

export interface Game {
  id: string | number;
  position: number;
  finished: boolean;
  winner_id?: number | null;
  active_players?: Record<string, number>;
}

export interface StatData {
  sum: number;
  count: number;
}

export interface GameStats {
  [playerName: string]: StatData;
}

export interface MatchStats {
  games: Record<string, GameStats>;
  total: Record<string, StatData>;
}

export interface Match {
  id: string | number;
  league: string;
  round: string;
  date: string;
  status: 'RUNNING' | 'FINISHED' | 'NOT_STARTED';
  number_of_games: number;
  home: TeamInfo;
  away: TeamInfo;
  games: Game[];
  stats?: MatchStats;
}

export type RosterMap = Record<Position, Player[]>;

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  matchId: string;
  gameId: string;
  gameIndex: number;
  playerName: string;
  content: string;
  rating: number;
  likes: number;
  likedBy: string[];
  createdAt: { seconds: number; nanoseconds: number } | null;
}
