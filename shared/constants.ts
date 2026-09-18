export const GAME_CONSTANTS = {
  // Map dimensions (80x80 tiles @ 32px each)
  MAP_TILE_SIZE: 32,
  MAP_TILES_X: 80,
  MAP_TILES_Y: 80,
  MAP_WIDTH: 80 * 32, // 2560px
  MAP_HEIGHT: 80 * 32, // 2560px

  // Timings
  ROUND_DURATION_SEC: 240, // 4 minutes
  TRANSFORMATION_TIME_SEC: 120, // 50% into round
  ALTAR_ACTIVATION_TIME_SEC: 80, // 80s into round
  LOBBY_BOT_FILL_TIMEOUT_SEC: 30, // Fill bots after 30s if < 6 players
  COUNTDOWN_DURATION_SEC: 3,

  // Lobby limits
  MIN_PLAYERS_TO_START: 6,
  TARGET_LOBBY_SIZE: 8,
  MAX_PLAYERS: 12,

  // Server Simulation
  SERVER_TICK_RATE: 60, // 60hz physics simulation
  SERVER_BROADCAST_RATE: 20, // 20hz state broadcast

  // Animal Base Speeds (px/sec)
  SPEEDS: {
    chicken: 207, // +15% over baseline 180
    pig: 180,
    goat: 185,
    sheep: 175,
    cow: 165,
    horse: 200,
    duck: 180,
    butcherBase: 186, // Between Chicken (207) and Cow (165)
  },

  // Butcher Scaling:
  // +5% speed per prey above 6, max +25%
  // +1 cleaver range per 3 prey above 6, max +2m
  BUTCHER_BASE_CLEAVER_RANGE_PX: 56,

  // Mark Thresholds
  MARK_MIN: 0,
  MARK_MAX: 10,
  MARK_TIER_CLEAN_MAX: 2,
  MARK_TIER_TAINTED_MAX: 5,
  // 6+ is MARKED

  // Altar configuration
  ALTAR_POSITION: { x: 1280, y: 1280 },
  ALTAR_RADIUS_PX: 80,

  // Scoring
  SCORES: {
    SURVIVAL_PER_SEC: 1,
    ESCAPED_ALIVE: 50,
    VOLUNTEER_SACRIFICE: 75,
    PUSHED_SACRIFICE: 30,
    REVIVE_ALLY: 40,
    BECAME_BUTCHER: 20,
    BUTCHER_KILL: 15,
    BETRAYAL_DETECTED: -20,
  },
} as const;

// Helper function for dynamic altar demand based on lobby player count
export function calculateAltarDemand(playerCount: number): number {
  if (playerCount <= 6) return 1;
  if (playerCount <= 8) return 2;
  return 3; // 9-12 players
}

// Helper function for dynamic butcher speed
export function calculateButcherSpeed(preyCount: number): number {
  const base = GAME_CONSTANTS.SPEEDS.butcherBase;
  const extraPrey = Math.max(0, preyCount - 6);
  const bonusPct = Math.min(0.25, extraPrey * 0.05);
  return base * (1 + bonusPct);
}

// Helper function for dynamic butcher cleaver range
export function calculateButcherCleaverRange(preyCount: number): number {
  const basePx = GAME_CONSTANTS.BUTCHER_BASE_CLEAVER_RANGE_PX;
  const extraPrey = Math.max(0, preyCount - 6);
  const extraMeters = Math.min(2, Math.floor(extraPrey / 3));
  const pxPerMeter = 28;
  return basePx + extraMeters * pxPerMeter;
}
