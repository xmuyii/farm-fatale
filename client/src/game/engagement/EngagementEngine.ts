import { AnimalType, DailyChaosDef, AnimalMasteryData } from '@shared/types.ts';

export interface KillCamSnapshot {
  timestamp: number;
  victimUsername: string;
  victimAnimal: AnimalType;
  killerUsername: string;
  locationName: string;
  x: number;
  y: number;
}

export interface HighlightMoment {
  id: string;
  title: string;
  desc: string;
  icon: string;
  tag: string;
}

export interface MatchPrediction {
  betOn: 'butcher_victory' | 'prey_escape' | 'first_down_under_60s' | 'chorus_formed';
  wagerCorn: number;
  odds: number;
  resolved: boolean;
  won: boolean;
}

export interface NemesisRecord {
  nemesisName: string;
  downedCount: number;
  escapedCount: number;
  lastEncounterTime: number;
}

export const DAILY_CHAOS_MODIFIERS: DailyChaosDef[] = [
  {
    day: 'Sunday',
    title: 'Blood Choir Sunday',
    icon: '🩸',
    description: 'Altar retribution pulses are 2x stronger, and butcher speed increases by 10%.',
    effectKey: 'blood_choir',
  },
  {
    day: 'Monday',
    title: 'Mega-Moo Monday',
    icon: '📢',
    description: 'All animal voice call radii are doubled across Sector 6!',
    effectKey: 'mega_moo',
  },
  {
    day: 'Tuesday',
    title: 'Slippery Mud Tuesday',
    icon: '🍌',
    description: 'Mud pits and puddles are 3x slicker! Cartoon slips occur more frequently.',
    effectKey: 'slippery_mud',
  },
  {
    day: 'Wednesday',
    title: 'Foggy Frenzy Wednesday',
    icon: '🌫️',
    description: 'Persistent toxic fog envelops the sector. Vision is halved, but stealth is amplified.',
    effectKey: 'foggy_frenzy',
  },
  {
    day: 'Thursday',
    title: 'Mark Roulette Thursday',
    icon: '🎲',
    description: 'Betrayals reward double points, but raise Mark suspicion twice as fast.',
    effectKey: 'mark_roulette',
  },
  {
    day: 'Friday',
    title: 'Barnyard Riot Friday',
    icon: '🎉',
    description: 'Coordinated Barnyard Choruses grant an explosive +25% sprint boost for 6s!',
    effectKey: 'barnyard_riot',
  },
  {
    day: 'Saturday',
    title: 'Silent Stalkers Saturday',
    icon: '🤫',
    description: 'Silence of Suspicion countdown is halved to 15s. Communication is mandatory!',
    effectKey: 'silent_stalkers',
  },
];

export class EngagementEngine {
  // Mastery tracks per animal (Level 1-5)
  private masteryData: Map<AnimalType, AnimalMasteryData> = new Map();

  // Out-of-game currency (Barnyard Corn)
  private barnyardCorn: number = 250;

  // Active prediction
  private activePrediction: MatchPrediction | null = null;

  // Nemesis tracking
  private nemesisRecords: Map<string, NemesisRecord> = new Map();

  // Highlights of current match
  private matchHighlights: HighlightMoment[] = [];

  // Kill cam snapshot
  private lastKillCam: KillCamSnapshot | null = null;

  // Streamer Mode toggle
  private isStreamerMode: boolean = false;

  // Seasonal mystery lore fragments
  private unlockedLoreFragments: number[] = [1]; // Start with fragment 1

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const savedCorn = localStorage.getItem('ff_corn');
      if (savedCorn) this.barnyardCorn = parseInt(savedCorn, 10);

      const savedMastery = localStorage.getItem('ff_mastery');
      if (savedMastery) {
        const parsed = JSON.parse(savedMastery);
        Object.keys(parsed).forEach((k) => {
          this.masteryData.set(k as AnimalType, parsed[k]);
        });
      }

      const savedNemesis = localStorage.getItem('ff_nemesis');
      if (savedNemesis) {
        const parsed = JSON.parse(savedNemesis);
        Object.keys(parsed).forEach((k) => {
          this.nemesisRecords.set(k, parsed[k]);
        });
      }
    } catch (e) {}

    // Ensure all animals have mastery init
    const animals: AnimalType[] = ['chicken', 'pig', 'goat', 'sheep', 'cow', 'horse', 'duck', 'parrot'];
    animals.forEach((a) => {
      if (!this.masteryData.has(a)) {
        this.masteryData.set(a, {
          animal: a,
          level: 1,
          xp: 0,
          title: 'Novice Farmhand',
          unlockedCosmetic: 'Basic Straw Hat',
        });
      }
    });
  }

  saveToStorage() {
    try {
      localStorage.setItem('ff_corn', this.barnyardCorn.toString());
      const obj: Record<string, any> = {};
      this.masteryData.forEach((v, k) => (obj[k] = v));
      localStorage.setItem('ff_mastery', JSON.stringify(obj));

      const nemObj: Record<string, any> = {};
      this.nemesisRecords.forEach((v, k) => (nemObj[k] = v));
      localStorage.setItem('ff_nemesis', JSON.stringify(nemObj));
    } catch (e) {}
  }

  // 1. Round Loop Micro-Narrative (4 min round)
  getRoundNarrativeAct(timeRemainingSec: number, totalDurationSec: number = 240): {
    actNumber: number;
    actName: string;
    subtitle: string;
    atmosphereColor: string;
  } {
    const elapsed = totalDurationSec - timeRemainingSec;
    if (elapsed < 60) {
      return {
        actNumber: 1,
        actName: 'ACT I: THE GRAZING',
        subtitle: 'Scavenge supply crates, secure bio-cores, and communicate.',
        atmosphereColor: '#38bdf8',
      };
    } else if (elapsed < 120) {
      return {
        actNumber: 2,
        actName: 'ACT II: THE GATHERING STORM',
        subtitle: 'The Silence rises. Beware whispers of paranoia.',
        atmosphereColor: '#facc15',
      };
    } else if (elapsed < 195) {
      return {
        actNumber: 3,
        actName: 'ACT III: THE HUNT',
        subtitle: 'The Butcher walks among us! Trigger blast gates and protect downed allies!',
        atmosphereColor: '#ef4444',
      };
    } else {
      return {
        actNumber: 4,
        actName: 'ACT IV: DESPERATE ESCAPE',
        subtitle: 'Sector evacuation chokepoints are opening! Survive the final reckoning!',
        atmosphereColor: '#dc2626',
      };
    }
  }

  // 2. Paranoia Mark Loop (5 Phases)
  getParanoiaPhase(mark: number): {
    phase: number;
    title: string;
    effectDescription: string;
    color: string;
    whisperFrequency: number;
  } {
    if (mark <= 1) {
      return {
        phase: 0,
        title: 'PHASE 0: UNTAINTED',
        effectDescription: 'Clear conscience. Senses sharp.',
        color: '#22c55e',
        whisperFrequency: 0,
      };
    } else if (mark <= 3) {
      return {
        phase: 1,
        title: 'PHASE 1: THE WHISPERS',
        effectDescription: 'Auditory hallucinations begin. Faint phantom footsteps audible.',
        color: '#38bdf8',
        whisperFrequency: 0.2,
      };
    } else if (mark <= 5) {
      return {
        phase: 2,
        title: 'PHASE 2: TAINTED SOUL',
        effectDescription: 'Visual edge distortion. Yellow pulsing paranoia halo.',
        color: '#facc15',
        whisperFrequency: 0.5,
      };
    } else if (mark <= 8) {
      return {
        phase: 3,
        title: 'PHASE 3: CONDEMNED',
        effectDescription: 'Racing heartbeat vignette. The Butcher detects your directional trail.',
        color: '#f97316',
        whisperFrequency: 0.8,
      };
    } else {
      return {
        phase: 4,
        title: 'PHASE 4: SACRIFICIAL TARGET',
        effectDescription: 'Marked for slaughter! Glowing sacrificial rune reveals position globally.',
        color: '#ef4444',
        whisperFrequency: 1.0,
      };
    }
  }

  // 3. Animal Mastery Track (5 Levels per animal)
  addMasteryXp(animal: AnimalType, xpGained: number): { leveledUp: boolean; newLevel: number; title: string } {
    const data = this.masteryData.get(animal) || {
      animal,
      level: 1,
      xp: 0,
      title: 'Novice Farmhand',
      unlockedCosmetic: 'Basic Straw Hat',
    };

    data.xp += xpGained;
    let leveledUp = false;

    // Thresholds: Lvl 1: 0, Lvl 2: 100, Lvl 3: 300, Lvl 4: 600, Lvl 5: 1000
    const thresholds = [0, 100, 300, 600, 1000];
    const titles = [
      'Novice Farmhand',
      'Barnyard Scout',
      'Herd Veteran',
      'Sector 6 Survivor',
      'Legend of the Pasture',
    ];
    const cosmetics = [
      'Basic Straw Hat',
      'Scout Bandana & Mud Trim',
      'Silver Herd Bell Badge',
      'Ethereal Spore Trail',
      'Mythic Golden Halo & Royal Cape',
    ];

    for (let l = 5; l >= 1; l--) {
      if (data.xp >= thresholds[l - 1]) {
        if (data.level < l) {
          data.level = l;
          data.title = titles[l - 1];
          data.unlockedCosmetic = cosmetics[l - 1];
          leveledUp = true;
        }
        break;
      }
    }

    this.masteryData.set(animal, data);
    this.saveToStorage();
    return { leveledUp, newLevel: data.level, title: data.title };
  }

  getMastery(animal: AnimalType): AnimalMasteryData {
    return (
      this.masteryData.get(animal) || {
        animal,
        level: 1,
        xp: 0,
        title: 'Novice Farmhand',
        unlockedCosmetic: 'Basic Straw Hat',
      }
    );
  }

  getAllMastery(): AnimalMasteryData[] {
    return Array.from(this.masteryData.values());
  }

  // 4. Daily Chaos Modifier
  getTodayChaosModifier(): DailyChaosDef {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[new Date().getDay()];
    return DAILY_CHAOS_MODIFIERS.find((d) => d.day === currentDay) || DAILY_CHAOS_MODIFIERS[0];
  }

  // 5. Environmental Story Events (Rare triggers)
  getEnvironmentalStoryEvent(roll: number): { title: string; desc: string; bannerColor: string } | null {
    if (roll < 0.25) {
      return {
        title: '📻 RADIO INTERCEPT: OUTPOST 4 OVERRUN',
        desc: 'Static screams over Sector 6 comms: "It broke through the silos!"',
        bannerColor: '#f59e0b',
      };
    } else if (roll < 0.5) {
      return {
        title: '⚡ POWER SURGE IN CULVERT DRAINAGE',
        desc: 'Hydro-gates crackle with electrostatic discharge. Puddles temporarily energize.',
        bannerColor: '#38bdf8',
      };
    } else if (roll < 0.75) {
      return {
        title: '🩸 BLOOD ECLIPSE DETECTED',
        desc: 'The sky darkens to crimson. Sacrificial Altar resonance increases by 50%.',
        bannerColor: '#ef4444',
      };
    } else {
      return {
        title: '🐕 PACK HOWL IN DISTANCE',
        desc: 'Farm hounds have caught scent of blood. Watch your tracks!',
        bannerColor: '#a855f7',
      };
    }
  }

  // 6. Kill Cam & Near-Miss Slow-Mo
  recordKillCam(snapshot: KillCamSnapshot) {
    this.lastKillCam = snapshot;
  }

  getLastKillCam(): KillCamSnapshot | null {
    return this.lastKillCam;
  }

  // 7. Highlights & Highlight Reel Generation
  addHighlight(moment: HighlightMoment) {
    this.matchHighlights.push(moment);
  }

  getHighlights(): HighlightMoment[] {
    return this.matchHighlights;
  }

  clearHighlights() {
    this.matchHighlights = [];
  }

  generateShareableRecap(matchWinner: string, mvpName: string): string {
    const chaos = this.getTodayChaosModifier();
    let text = `🌾 FARM FATALE: SECTOR 6 MATCH RECAP\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🏆 Outcome: ${matchWinner.toUpperCase()} VICTORY\n`;
    text += `🌟 Sector MVP: ${mvpName}\n`;
    text += `🌪️ Modifier: ${chaos.icon} ${chaos.title}\n`;
    text += `✨ Key Highlights:\n`;
    if (this.matchHighlights.length === 0) {
      text += `• Surviving through the 4-Minute Panic\n`;
    } else {
      this.matchHighlights.slice(0, 4).forEach((h) => {
        text += `• ${h.icon} ${h.title}: ${h.desc}\n`;
      });
    }
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Play Farm Fatale on AI Studio! 🐔🐷🐴`;
    return text;
  }

  // 8. Pre-Round Predictions & Nemesis
  getBarnyardCorn(): number {
    return this.barnyardCorn;
  }

  placePrediction(betOn: MatchPrediction['betOn'], wager: number, odds: number): boolean {
    if (this.barnyardCorn < wager) return false;
    this.barnyardCorn -= wager;
    this.activePrediction = { betOn, wagerCorn: wager, odds, resolved: false, won: false };
    this.saveToStorage();
    return true;
  }

  resolvePrediction(actualResult: {
    butcherWon: boolean;
    preyEscaped: boolean;
    downUnder60s: boolean;
    chorusFormed: boolean;
  }): { won: boolean; payout: number } | null {
    if (!this.activePrediction || this.activePrediction.resolved) return null;

    let won = false;
    if (this.activePrediction.betOn === 'butcher_victory' && actualResult.butcherWon) won = true;
    if (this.activePrediction.betOn === 'prey_escape' && actualResult.preyEscaped) won = true;
    if (this.activePrediction.betOn === 'first_down_under_60s' && actualResult.downUnder60s) won = true;
    if (this.activePrediction.betOn === 'chorus_formed' && actualResult.chorusFormed) won = true;

    this.activePrediction.resolved = true;
    this.activePrediction.won = won;

    let payout = 0;
    if (won) {
      payout = Math.round(this.activePrediction.wagerCorn * this.activePrediction.odds);
      this.barnyardCorn += payout;
    }
    this.saveToStorage();
    return { won, payout };
  }

  getActivePrediction(): MatchPrediction | null {
    return this.activePrediction;
  }

  recordNemesisDown(nemesisName: string) {
    const rec = this.nemesisRecords.get(nemesisName) || {
      nemesisName,
      downedCount: 0,
      escapedCount: 0,
      lastEncounterTime: Date.now(),
    };
    rec.downedCount += 1;
    rec.lastEncounterTime = Date.now();
    this.nemesisRecords.set(nemesisName, rec);
    this.saveToStorage();
  }

  recordNemesisEscape(nemesisName: string) {
    const rec = this.nemesisRecords.get(nemesisName) || {
      nemesisName,
      downedCount: 0,
      escapedCount: 0,
      lastEncounterTime: Date.now(),
    };
    rec.escapedCount += 1;
    rec.lastEncounterTime = Date.now();
    this.nemesisRecords.set(nemesisName, rec);
    this.saveToStorage();
  }

  getNemesisRecords(): NemesisRecord[] {
    return Array.from(this.nemesisRecords.values()).sort((a, b) => b.downedCount - a.downedCount);
  }

  // Streamer Mode
  toggleStreamerMode(): boolean {
    this.isStreamerMode = !this.isStreamerMode;
    return this.isStreamerMode;
  }

  getIsStreamerMode(): boolean {
    return this.isStreamerMode;
  }

  // Seasonal Mystery Lore
  unlockLore(index: number) {
    if (!this.unlockedLoreFragments.includes(index)) {
      this.unlockedLoreFragments.push(index);
    }
  }

  getUnlockedLore(): number[] {
    return this.unlockedLoreFragments;
  }
}

export const engagementEngine = new EngagementEngine();
