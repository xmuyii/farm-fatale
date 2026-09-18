-- ==============================================================================
-- FARM FATALE: Migration 002_add_farm_fatale_columns.sql
-- Adds dedicated, isolated game columns to public.players without affecting existing columns
-- ==============================================================================

ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS farm_all_time_points INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS farm_weekly_points INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS farm_daily_points INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS farm_wins INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS farm_matches INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS farm_bests JSONB NOT NULL DEFAULT '{"highestScore":0,"mostKills":0,"mostRevives":0,"fastestWinSec":0}'::jsonb,
ADD COLUMN IF NOT EXISTS farm_last_played TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS game_saves JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Compatibility View: public.profiles -> public.players
CREATE OR REPLACE VIEW public.profiles AS
SELECT 
    id,
    user_id,
    username,
    created_at,
    updated_at,
    total_matches,
    total_wins,
    favorite_animal
FROM public.players;

-- Index for instant leaderboard sorting
CREATE INDEX IF NOT EXISTS idx_players_farm_all_time ON public.players (farm_all_time_points DESC);
CREATE INDEX IF NOT EXISTS idx_players_farm_weekly ON public.players (farm_weekly_points DESC);
CREATE INDEX IF NOT EXISTS idx_players_farm_daily ON public.players (farm_daily_points DESC);
