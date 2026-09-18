export type GameModeId = 'classic' | 'blood_fog' | 'altar_overdrive' | 'contagion' | 'lockdown_escape';

export interface IGameModeDef {
  id: GameModeId;
  name: string;
  badge: string;
  tagline: string;
  description: string;
  rules: string[];
  color: string;
  icon: string;
}

export const GAME_MODES: Record<GameModeId, IGameModeDef> = {
  classic: {
    id: 'classic',
    name: 'Sector 6: Classic Hunt',
    badge: 'STANDARD',
    tagline: 'The Original Asymmetric Farm Survival',
    description: 'Survive in the contaminated Sector 6 slaughter compound. At the halfway mark, an animal transforms into the Butcher. Work together to revive downed allies and appease the ancient Altar.',
    rules: [
      'Transformation strikes at round midpoint',
      'Manage Mark tiers: Clean (0-2) vs Tainted (3+)',
      'Revive allies near Altar to purge Marks (-1)',
      'Survive until round timer expires',
    ],
    color: '#38bdf8',
    icon: '🌾',
  },
  blood_fog: {
    id: 'blood_fog',
    name: 'Fog of Blood (Blind Terror)',
    badge: 'HARDCORE',
    tagline: 'Near-Zero Visibility Horror Challenge',
    description: 'A thick, blood-scented miasma blankets Sector 6. Field of vision is reduced to a tight radius. The Butcher stalks swiftly through the crimson dark with heightened sensory instinct.',
    rules: [
      'Vision clamped to 260px radius',
      'Butcher movement speed +15%',
      'Proximity heartbeat audio alerts you when killer is near',
      'Use radio terminals & flares to pierce the darkness',
    ],
    color: '#ef4444',
    icon: '🩸',
  },
  altar_overdrive: {
    id: 'altar_overdrive',
    name: 'Sacrificial Overdrive (Altar Rush)',
    badge: 'OBJECTIVE',
    tagline: 'Feed the Relic Altar Before Catastrophe',
    description: 'The ancient quarantine altar is active from the first second! 4 glowing Bio-Cores have appeared across Sector 6 outposts. Scavenge and deposit them at the Altar before the timer runs out.',
    rules: [
      'Altar demands 4 Bio-Cores to stabilize',
      'Bio-Cores spawn at Silo, Greenhouse & Culvert',
      'Deposit Bio-Cores at Altar for team speed surges',
      'Failing to feed the altar enrages the Butcher',
    ],
    color: '#a855f7',
    icon: '🔮',
  },
  contagion: {
    id: 'contagion',
    name: 'Contagion (Butcher Horde)',
    badge: 'HORDE',
    tagline: 'Downed Animals Rise as Infected Thralls',
    description: 'The slaughter infection mutates. Animals struck down by the Butcher reanimate after 6 seconds as mindless Thralls, compelled to hunt down their remaining farm brethren.',
    rules: [
      'Downed animals rise as infected Thrall minions',
      'Thralls stalk prey and inflict slowing strikes',
      'Prey must stick together and use hideouts',
      'Escape alive before the entire farm is turned',
    ],
    color: '#f97316',
    icon: '🧟',
  },
  lockdown_escape: {
    id: 'lockdown_escape',
    name: 'Lockdown: Escape Protocol',
    badge: 'EVACUATION',
    tagline: 'Repair 3 Terminals to Unlock South Blast Gate',
    description: 'Quarantine lockdown sealed all perimeter gates. Locate and repair 3 Generator Terminals scattered across Sector 6 to power the South Blast Doors and make your escape!',
    rules: [
      'Terminal 1: Grain Silo Outpost (North-West)',
      'Terminal 2: Hydroponic Greenhouse (South-West)',
      'Terminal 3: Decontamination Culvert (Mid-West)',
      'Hold [E] to repair each terminal (4 sec channel)',
      'Escape through the South Blast Gate once powered',
    ],
    color: '#22c55e',
    icon: '🚪',
  },
};
