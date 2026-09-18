export type AnimalType = 'chicken' | 'pig' | 'goat' | 'sheep' | 'cow' | 'horse' | 'duck' | 'parrot';

export type Role = 'prey' | 'butcher';

export type GamePhase = 'lobby' | 'countdown' | 'in-round' | 'ended';

export type MarkTier = 'clean' | 'tainted' | 'marked';

export type EmoteType = 'dance' | 'taunt' | 'fear' | 'sleep' | 'headbutt';

export interface SpeciesSoundConfig {
  soundText: string;
  baseRadius: number; // in pixels (e.g. 5m = 160px)
  maxPerSec: number;
}

export interface ISpeciesSoundEvent {
  senderId: string;
  username: string;
  animal: AnimalType;
  x: number;
  y: number;
  text: string;
  radius: number;
  timestamp: number;
  isGarbled?: boolean;
  isParrotSentence?: boolean;
}

export interface DailyChaosDef {
  day: string;
  title: string;
  icon: string;
  description: string;
  effectKey: string;
}

export interface AnimalMasteryData {
  animal: AnimalType;
  level: number;
  xp: number;
  title: string;
  unlockedCosmetic: string;
}

export interface PlayerInput {
  dx: number;
  dy: number;
  sequenceNumber?: number;
}

export interface IPlayerState {
  id: string;
  sessionId: string;
  username: string;
  animal: AnimalType;
  role: Role;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  speed: number;
  mark: number;
  markTier: MarkTier;
  isDowned: boolean;
  isStealthed: boolean;
  isStunned: boolean;
  isBot: boolean;
  hasRerolled: boolean;
  score: number;
  kills: number;
  volunteered: boolean;
  survived: boolean;
  lastMarkTimestamp: number;
}

export interface IAltarState {
  x: number;
  y: number;
  radius: number;
  demand: number;
  sacrificesCount: number;
  isActive: boolean;
  isClosed: boolean;
  activeBuff: string | null;
  buffExpiresAt: number;
}

export interface IGameState {
  phase: GamePhase;
  phaseTimeRemaining: number;
  roundDuration: number;
  butcherSessionId: string | null;
  altarState: IAltarState;
  playersCount: number;
  botsCount: number;
  revealMarksUntil: number;
}

export interface IAbilityDef {
  id: string;
  name: string;
  animal: AnimalType | 'butcher';
  cooldownMs: number;
  description: string;
  isBetrayal: boolean;
}

export interface VengeanceLogItem {
  targetId: string;
  targetUsername: string;
  reason: string;
  timestamp: number;
}

export interface MatchSummaryPlayer {
  profileId: string;
  username: string;
  animal: AnimalType;
  markFinal: number;
  score: number;
  becameButcher: boolean;
  volunteered: boolean;
  kills: number;
  survived: boolean;
  wasBot: boolean;
}

export interface MatchSummary {
  matchId: string;
  winner: 'animals' | 'butcher';
  roundDuration: number;
  playerCount: number;
  botCount: number;
  mvpId: string;
  mvpUsername: string;
  players: MatchSummaryPlayer[];
}

// Client <-> Server Message Types
export const NETWORK_MESSAGES = {
  PLAYER_INPUT: 'PLAYER_INPUT',
  USE_ABILITY: 'USE_ABILITY',
  USE_BUTCHER_ABILITY: 'USE_BUTCHER_ABILITY',
  REVIVE_ALLY: 'REVIVE_ALLY',
  SACRIFICE_VOLUNTEER: 'SACRIFICE_VOLUNTEER',
  SACRIFICE_PUSH: 'SACRIFICE_PUSH',
  REROLL_ANIMAL: 'REROLL_ANIMAL',
  START_VOTE: 'START_VOTE',
  SPECIES_SOUND: 'SPECIES_SOUND',
  EMOTE: 'EMOTE',
  MARK_PENALTY: 'MARK_PENALTY',
  // Server broadcasts
  MARK_CHANGED: 'MARK_CHANGED',
  TRANSFORMATION: 'TRANSFORMATION',
  VENGEANCE_LOG: 'VENGEANCE_LOG',
  ALTAR_SACRIFICE: 'ALTAR_SACRIFICE',
  ALTAR_GIFT: 'ALTAR_GIFT',
  PLAYER_DOWNED: 'PLAYER_DOWNED',
  ROUND_ENDED: 'ROUND_ENDED',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
} as const;
