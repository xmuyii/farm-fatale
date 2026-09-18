import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { MatchSummary } from '../../../shared/types.ts';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
// Use JWT key if valid, else fallback to anon JWT
const rawServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const EFFECTIVE_KEY = rawServiceKey.startsWith('eyJ') ? rawServiceKey : anonKey || rawServiceKey;

let supabaseClient: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient | null {
  if (!supabaseClient) {
    if (!SUPABASE_URL || !EFFECTIVE_KEY) {
      console.warn('[ServerSupabase] Supabase credentials not set. Match writes will be skipped.');
      return null;
    }
    supabaseClient = createClient(SUPABASE_URL, EFFECTIVE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

/**
 * Persists match results and player summaries to Supabase
 * Authoritatively updates ONLY Farm Fatale's dedicated game_saves data or farm_* columns.
 * Leaves all existing columns (all_time_points, weekly_points, gold, military, etc.) untouched.
 */
export async function recordMatchResult(summary: MatchSummary): Promise<boolean> {
  const supabase = getServerSupabase();
  if (!supabase) return false;

  try {
    for (const p of summary.players) {
      if (!p.wasBot) {
        try {
          // Look up player by user_id or username
          const { data: existingPlayer } = await supabase
            .from('players')
            .select('id, user_id, username, game_saves')
            .or(`user_id.eq.${p.profileId},username.eq.${p.username}`)
            .maybeSingle();

          if (existingPlayer) {
            const currentSaves = existingPlayer.game_saves || {};
            const farmData = currentSaves.farm_fatale || {
              all_time_points: 0,
              weekly_points: 0,
              daily_points: 0,
              wins: 0,
              matches: 0,
            };

            farmData.all_time_points = (farmData.all_time_points || 0) + p.score;
            farmData.weekly_points = (farmData.weekly_points || 0) + p.score;
            farmData.daily_points = (farmData.daily_points || 0) + p.score;
            farmData.matches = (farmData.matches || 0) + 1;
            if (p.survived) {
              farmData.wins = (farmData.wins || 0) + 1;
            }
            farmData.last_played = new Date().toISOString();

            // 1. Update isolated JSON field game_saves.farm_fatale
            await supabase
              .from('players')
              .update({
                game_saves: {
                  ...currentSaves,
                  farm_fatale: farmData,
                },
              })
              .eq('id', existingPlayer.id);

            // 2. Also try updating dedicated columns if user ran migration 002
            try {
              await supabase
                .from('players')
                .update({
                  farm_all_time_points: farmData.all_time_points,
                  farm_weekly_points: farmData.weekly_points,
                  farm_daily_points: farmData.daily_points,
                  farm_wins: farmData.wins,
                  farm_matches: farmData.matches,
                })
                .eq('id', existingPlayer.id);
            } catch {
              // Dedicated columns may not exist yet, game_saves is the durable fallback
            }

            console.log(
              `[ServerSupabase] Recorded match for ${p.username}: +${p.score} pts (Farm Fatale Total: ${farmData.all_time_points})`
            );
          }
        } catch (playerErr) {
          console.warn(`[ServerSupabase] Error updating player ${p.username}:`, playerErr);
        }
      }
    }

    // Insert into matches table if present
    try {
      await supabase.from('matches').insert({
        id: summary.matchId,
        started_at: new Date(Date.now() - summary.roundDuration * 1000).toISOString(),
        ended_at: new Date().toISOString(),
        winner: summary.winner,
        round_duration: summary.roundDuration,
        player_count: summary.playerCount,
        bot_count: summary.botCount,
      });
    } catch {
      // Ignored if matches table doesn't exist
    }

    console.log(`[ServerSupabase] Match ${summary.matchId} completed.`);
    return true;
  } catch (err) {
    console.error('[ServerSupabase] Failed to write match summary:', err);
    return false;
  }
}
