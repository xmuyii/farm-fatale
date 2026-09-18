import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabaseInstance: SupabaseClient | null = null;

export function getClientSupabase(): SupabaseClient | null {
  if (!supabaseInstance) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('[ClientSupabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing.');
      return null;
    }
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseInstance;
}

export interface PlayerProfile {
  id: number | string;
  user_id: string;
  username: string;
  favorite_animal?: string;
  last_animal?: string;
  farm_all_time_points?: number;
  farm_weekly_points?: number;
  farm_daily_points?: number;
  farm_wins?: number;
  farm_matches?: number;
  is_telegram?: boolean;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name?: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
          query_id?: string;
          auth_date?: number;
          hash?: string;
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
      };
    };
  }
}

export interface LeaderboardEntry {
  rank: number;
  id: number | string;
  userId: string;
  username: string;
  animal: string;
  score: number;
  badge: string;
  matchesPlayed?: number;
  wins?: number;
  isCurrentPlayer?: boolean;
}

export interface PersonalBests {
  highestScore: number;
  mostKills: number;
  mostRevives: number;
  fastestWinSec: number;
  totalMatches: number;
  totalWins: number;
  favoriteAnimal: string;
}

const ACTIVE_PLAYER_KEY = 'farm_fatale_active_player';
const PERSONAL_BESTS_KEY = 'farm_fatale_personal_bests';
const TELEGRAM_USER_KEY = 'farm_fatale_unique_user_id';
const TELEGRAM_USERNAME_KEY = 'farm_fatale_unique_username';

/**
 * Determines player identity via Telegram WebApp (passwordless) or device-unique guest.
 * Players NEVER share or switch accounts.
 */
export function getTelegramOrGuestIdentity(): { userId: string; username: string; isTelegram: boolean } {
  try {
    const tgWebApp = window.Telegram?.WebApp;
    if (tgWebApp) {
      tgWebApp.ready?.();
      tgWebApp.expand?.();
      const tgUser = tgWebApp.initDataUnsafe?.user;
      if (tgUser && tgUser.id) {
        const userId = `tg_${tgUser.id}`;
        let username = tgUser.username ? `@${tgUser.username}` : (tgUser.first_name || `Farmer_${tgUser.id}`);
        username = username.slice(0, 24);
        localStorage.setItem(TELEGRAM_USER_KEY, userId);
        localStorage.setItem(TELEGRAM_USERNAME_KEY, username);
        return { userId, username, isTelegram: true };
      }
    }
  } catch (err) {
    console.warn('[TelegramAuth] Telegram WebApp read error:', err);
  }

  // Fallback to permanent, isolated guest identity for non-Telegram browser
  let storedUserId = localStorage.getItem(TELEGRAM_USER_KEY);
  let storedUsername = localStorage.getItem(TELEGRAM_USERNAME_KEY);

  if (!storedUserId) {
    storedUserId = `guest_${Math.random().toString(36).substring(2, 10)}`;
    storedUsername = `Farmer_${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem(TELEGRAM_USER_KEY, storedUserId);
    localStorage.setItem(TELEGRAM_USERNAME_KEY, storedUsername);
  }

  return {
    userId: storedUserId,
    username: storedUsername || 'Farmer_Unknown',
    isTelegram: false,
  };
}

export function getCachedActivePlayer(): PlayerProfile {
  const identity = getTelegramOrGuestIdentity();
  try {
    const raw = localStorage.getItem(ACTIVE_PLAYER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.user_id === identity.userId) {
        return parsed;
      }
    }
  } catch (e) {}

  const defaultProfile: PlayerProfile = {
    id: identity.userId,
    user_id: identity.userId,
    username: identity.username,
    favorite_animal: 'pig',
    last_animal: 'pig',
    farm_all_time_points: 0,
    farm_weekly_points: 0,
    farm_daily_points: 0,
    farm_wins: 0,
    farm_matches: 0,
    is_telegram: identity.isTelegram,
  };
  saveCachedActivePlayer(defaultProfile);
  return defaultProfile;
}

export function saveCachedActivePlayer(profile: PlayerProfile): void {
  try {
    localStorage.setItem(ACTIVE_PLAYER_KEY, JSON.stringify(profile));
  } catch (e) {}
}

export function getPersonalBests(): PersonalBests {
  try {
    const raw = localStorage.getItem(PERSONAL_BESTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    highestScore: 0,
    mostKills: 0,
    mostRevives: 0,
    fastestWinSec: 0,
    totalMatches: 0,
    totalWins: 0,
    favoriteAnimal: 'pig',
  };
}

export function recordPersonalMatch(
  score: number,
  kills: number,
  revives: number,
  survived: boolean,
  durationSec: number
): PersonalBests {
  const bests = getPersonalBests();
  bests.totalMatches += 1;
  if (survived) bests.totalWins += 1;
  if (score > bests.highestScore) bests.highestScore = score;
  if (kills > bests.mostKills) bests.mostKills = kills;
  if (revives > bests.mostRevives) bests.mostRevives = revives;
  if (survived && (bests.fastestWinSec === 0 || durationSec < bests.fastestWinSec)) {
    bests.fastestWinSec = durationSec;
  }

  try {
    localStorage.setItem(PERSONAL_BESTS_KEY, JSON.stringify(bests));
  } catch (e) {}
  return bests;
}

/**
 * Initializes the user profile safely via Telegram passwordless auth or persistent guest identity.
 * If the user does not exist in the database, automatically registers them without password prompts.
 * Players NEVER access or switch to other players' profiles.
 */
export async function initializeUserProfile(): Promise<PlayerProfile> {
  const identity = getTelegramOrGuestIdentity();
  let cached = getCachedActivePlayer();
  const supabase = getClientSupabase();

  if (cached.user_id !== identity.userId) {
    cached.user_id = identity.userId;
    cached.username = identity.username;
    cached.is_telegram = identity.isTelegram;
    saveCachedActivePlayer(cached);
  }

  if (!supabase) return cached;

  try {
    // 1. Check if this exact user exists in the Supabase database
    const { data: playerData, error } = await supabase
      .from('players')
      .select('id, user_id, username, favorite_animal, farm_all_time_points, farm_weekly_points, farm_daily_points, farm_wins, farm_matches')
      .eq('user_id', identity.userId)
      .maybeSingle();

    if (!error && playerData) {
      const profile: PlayerProfile = {
        id: playerData.id,
        user_id: playerData.user_id,
        username: playerData.username || identity.username,
        favorite_animal: playerData.favorite_animal || cached.favorite_animal || 'pig',
        last_animal: cached.last_animal || playerData.favorite_animal || 'pig',
        farm_all_time_points: playerData.farm_all_time_points || 0,
        farm_weekly_points: playerData.farm_weekly_points || 0,
        farm_daily_points: playerData.farm_daily_points || 0,
        farm_wins: playerData.farm_wins || 0,
        farm_matches: playerData.farm_matches || 0,
        is_telegram: identity.isTelegram,
      };
      saveCachedActivePlayer(profile);
      return profile;
    }

    // 2. Not in database? Auto-register new player seamlessly using Telegram auth!
    console.log('[TelegramAuth] Auto-registering new player:', identity.userId, identity.username);
    const { data: created, error: insertError } = await supabase
      .from('players')
      .insert({
        user_id: identity.userId,
        username: identity.username,
        favorite_animal: cached.last_animal || 'pig',
        farm_all_time_points: 0,
        farm_weekly_points: 0,
        farm_daily_points: 0,
        farm_wins: 0,
        farm_matches: 0,
      })
      .select('id, user_id, username, favorite_animal, farm_all_time_points, farm_weekly_points, farm_daily_points, farm_wins, farm_matches')
      .maybeSingle();

    if (!insertError && created) {
      const profile: PlayerProfile = {
        id: created.id,
        user_id: created.user_id,
        username: created.username,
        favorite_animal: created.favorite_animal || 'pig',
        last_animal: cached.last_animal || 'pig',
        farm_all_time_points: created.farm_all_time_points || 0,
        farm_weekly_points: created.farm_weekly_points || 0,
        farm_daily_points: created.farm_daily_points || 0,
        farm_wins: created.farm_wins || 0,
        farm_matches: created.farm_matches || 0,
        is_telegram: identity.isTelegram,
      };
      saveCachedActivePlayer(profile);
      return profile;
    }

    return cached;
  } catch (err) {
    console.warn('[ClientSupabase] Profile init fallback to local cache:', err);
    return cached;
  }
}

// -----------------------------------------------------------------------------
// 60-Second Client-Side Cached Leaderboard Service
// -----------------------------------------------------------------------------
interface LeaderboardCacheItem {
  timestamp: number;
  data: LeaderboardEntry[];
}

const leaderboardCache: Map<string, LeaderboardCacheItem> = new Map();
const CACHE_TTL_MS = 60 * 1000;

export function getLeaderboardCacheAge(period: 'daily' | 'weekly' | 'all-time'): number {
  const cached = leaderboardCache.get(period);
  if (!cached) return 0;
  return Math.floor((Date.now() - cached.timestamp) / 1000);
}

const ANIMALS_LIST = ['pig', 'chicken', 'goat', 'cow', 'horse', 'sheep', 'duck'];

function assignBadge(rank: number, score: number): string {
  if (rank === 1) return '🏆 GRAND BUTCHER';
  if (rank === 2) return '🥈 APEX SURVIVOR';
  if (rank === 3) return '🥉 SACRIFICIAL MASTER';
  if (score >= 1000) return '⭐ ELITE PREY';
  if (score >= 200) return '🔥 TAINTED';
  return '🌱 CLEAN';
}

export async function fetchLeaderboard(
  period: 'daily' | 'weekly' | 'all-time',
  forceRefresh: boolean = false
): Promise<LeaderboardEntry[]> {
  const now = Date.now();
  const cached = leaderboardCache.get(period);

  if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const supabase = getClientSupabase();
  const currentProfile = getCachedActivePlayer();

  if (!supabase) {
    return getFallbackLeaderboard(period, currentProfile);
  }

  try {
    // Only select id, user_id, username, and game_saves (where farm_fatale stats reside)
    const { data: playersData, error } = await supabase
      .from('players')
      .select('id, user_id, username, game_saves')
      .limit(100);

    if (error || !playersData || playersData.length === 0) {
      return getFallbackLeaderboard(period, currentProfile);
    }

    // Extract farm stats from game_saves.farm_fatale
    const entriesWithScore = playersData.map((row: any, index: number) => {
      const farmData = row.game_saves?.farm_fatale || {};
      let score = 0;
      if (period === 'daily') {
        score = Number(farmData.daily_points) || 0;
      } else if (period === 'weekly') {
        score = Number(farmData.weekly_points) || 0;
      } else {
        score = Number(farmData.all_time_points) || 0;
      }

      // If this is the current active player, merge with local personal bests
      if (row.user_id === currentProfile.user_id) {
        const bests = getPersonalBests();
        if (bests.highestScore > score) {
          score = bests.highestScore;
        }
      }

      const animal = farmData.favorite_animal || ANIMALS_LIST[index % ANIMALS_LIST.length];
      const wins = Number(farmData.wins) || 0;
      const matches = Number(farmData.matches) || 0;

      return {
        id: row.id,
        userId: row.user_id,
        username: row.username || `Player_${row.id}`,
        animal,
        score,
        matchesPlayed: matches,
        wins,
        isCurrentPlayer: row.user_id === currentProfile.user_id || row.username === currentProfile.username,
      };
    });

    // Sort descending by score
    entriesWithScore.sort((a, b) => b.score - a.score);

    const entries: LeaderboardEntry[] = entriesWithScore.slice(0, 50).map((item, index) => {
      const rank = index + 1;
      return {
        ...item,
        rank,
        badge: assignBadge(rank, item.score),
      };
    });

    leaderboardCache.set(period, {
      timestamp: now,
      data: entries,
    });

    return entries;
  } catch (err) {
    console.warn('[Leaderboard] Error fetching leaderboard:', err);
    return getFallbackLeaderboard(period, currentProfile);
  }
}

function getFallbackLeaderboard(
  period: 'daily' | 'weekly' | 'all-time',
  currentProfile: PlayerProfile
): LeaderboardEntry[] {
  const mockLegends = [
    { name: 'xxMasonxx', score: period === 'daily' ? 420 : period === 'weekly' ? 1450 : 3800, animal: 'pig' },
    { name: 'Johanliebert', score: period === 'daily' ? 380 : period === 'weekly' ? 1120 : 3200, animal: 'chicken' },
    { name: 'Starpath 🧿🪬', score: period === 'daily' ? 310 : period === 'weekly' ? 950 : 2700, animal: 'goat' },
    { name: 'Silver', score: period === 'daily' ? 240 : period === 'weekly' ? 780 : 2100, animal: 'cow' },
    { name: 'Muyi', score: period === 'daily' ? 190 : period === 'weekly' ? 640 : 1800, animal: 'horse' },
    { name: 'EmmyTunz', score: period === 'daily' ? 140 : period === 'weekly' ? 510 : 1400, animal: 'sheep' },
    { name: currentProfile.username, score: period === 'daily' ? 110 : period === 'weekly' ? 340 : 980, animal: currentProfile.favorite_animal || 'pig' },
  ];

  return mockLegends.map((item, idx) => ({
    rank: idx + 1,
    id: idx + 1,
    userId: `mock_${idx}`,
    username: item.name,
    animal: item.animal,
    score: item.score,
    badge: assignBadge(idx + 1, item.score),
    matchesPlayed: Math.max(1, Math.floor(item.score / 40)),
    wins: Math.floor(item.score / 120),
    isCurrentPlayer: item.name === currentProfile.username,
  }));
}
