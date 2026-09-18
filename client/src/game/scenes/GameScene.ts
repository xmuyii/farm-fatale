import Phaser from 'phaser';
import { colyseusNetwork } from '../../network/colyseus.ts';
import { GAME_CONSTANTS } from '@shared/constants.ts';
import { NETWORK_MESSAGES, AnimalType, VengeanceLogItem, ISpeciesSoundEvent, EmoteType } from '@shared/types.ts';
import { ANIMAL_ABILITIES, BUTCHER_ABILITIES } from '@shared/abilities.ts';
import { soundFx } from '../audio.ts';
import { leaderboardModal } from '../../ui/LeaderboardModal.ts';
import { recordPersonalMatch, getCachedActivePlayer, saveCachedActivePlayer } from '../../network/supabase.ts';
import { GAME_MODES, GameModeId } from '../modes/GameModes.ts';
import { WeatherSystem, WEATHER_TYPES, WeatherType, IWeatherDef } from '../weather/WeatherSystem.ts';
import { gameModeModal } from '../../ui/GameModeModal.ts';
import { VoiceCommsEngine } from '../communication/VoiceCommsEngine.ts';
import { engagementEngine } from '../engagement/EngagementEngine.ts';
import { engagementHubModal } from '../../ui/EngagementHubModal.ts';
import { voiceConsentModal } from '../../ui/VoiceConsentModal.ts';

interface VisualPlayer {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  nameTag: Phaser.GameObjects.Text;
  roleTag: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Graphics;
  markBadge: Phaser.GameObjects.Text;
  statusBadge: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  animal: AnimalType;
  isBot: boolean;
  role: string;
  speechBubble?: Phaser.GameObjects.Container;
  ragdollActive?: boolean;
  ragdollVx?: number;
  ragdollVy?: number;
  ragdollRotSpeed?: number;
}

const ANIMAL_EMOJIS: Record<AnimalType, string> = {
  chicken: '🐔',
  pig: '🐷',
  goat: '🐐',
  sheep: '🐑',
  cow: '🐮',
  horse: '🐴',
  duck: '🦆',
  parrot: '🦜',
};

export type ConsumableType =
  | 'adrenaline'
  | 'smokebomb'
  | 'saltward'
  | 'flare'
  | 'shock_mine'
  | 'decoy'
  | 'medkit'
  | 'camo_cloak';

export interface SectorCrate {
  id: string;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  looted: boolean;
  itemType: ConsumableType;
}

export interface SectorTerminal {
  id: string;
  name: string;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  repaired: boolean;
  progress: number;
  zoneDesc: string;
}

export interface SectorRelic {
  id: string;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  collected: boolean;
}

export interface ElectrifiedPuddle {
  id: string;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  lastShockTime: number;
}

export interface ToxicSporePod {
  id: string;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  popped: boolean;
  respawnAt: number;
}

export interface HydraulicGate {
  id: string;
  gateX: number;
  gateY: number;
  leverX: number;
  leverY: number;
  gateSprite: Phaser.GameObjects.Image;
  leverSprite: Phaser.GameObjects.Image;
  leverLabel: Phaser.GameObjects.Text;
  isClosed: boolean;
  closedUntil: number;
}

export interface ShockMineEntity {
  id: string;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  ownerId: string;
}

export interface DecoyEntity {
  id: string;
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  expiresAt: number;
}

export class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    keyQ: Phaser.Input.Keyboard.Key;
    keyE: Phaser.Input.Keyboard.Key;
    keyR: Phaser.Input.Keyboard.Key;
    keyF: Phaser.Input.Keyboard.Key;
    keySpace: Phaser.Input.Keyboard.Key;
    keyL: Phaser.Input.Keyboard.Key;
    keyB: Phaser.Input.Keyboard.Key;
    keyM: Phaser.Input.Keyboard.Key;
    keyK: Phaser.Input.Keyboard.Key;
    key1: Phaser.Input.Keyboard.Key;
    key2: Phaser.Input.Keyboard.Key;
    keyV: Phaser.Input.Keyboard.Key;
    keyC: Phaser.Input.Keyboard.Key;
    keyT: Phaser.Input.Keyboard.Key;
    keyG: Phaser.Input.Keyboard.Key;
    keyY: Phaser.Input.Keyboard.Key;
    keyH: Phaser.Input.Keyboard.Key;
  };
  private players: Map<string, VisualPlayer> = new Map();
  private traps: Map<string, Phaser.GameObjects.Image> = new Map();
  private hounds: Map<string, Phaser.GameObjects.Image> = new Map();

  // Voice & Species Communication Engine
  public voiceComms!: VoiceCommsEngine;
  private customParrotSentence: string = '';
  private silenceTrackerText!: Phaser.GameObjects.Text;
  private pttIndicatorText!: Phaser.GameObjects.Text;
  private isEmoteWheelOpen: boolean = false;
  private emoteWheelContainer!: Phaser.GameObjects.Container;
  private narrativeActText!: Phaser.GameObjects.Text;
  private paranoiaVignette!: Phaser.GameObjects.Graphics;
  private nearMissSlowMoUntil: number = 0;
  private isInstantReplayActive: boolean = false;
  private replayLetterboxTop!: Phaser.GameObjects.Rectangle;
  private replayLetterboxBottom!: Phaser.GameObjects.Rectangle;
  private replayBannerText!: Phaser.GameObjects.Text;
  private lastDramaticEvent: string = 'Sector 6 Simulation Commenced';
  private mudSlipCooldownUntil: number = 0;

  private lastInputSend: number = 0;
  private currentRoom: any = null;
  private isFrozen: boolean = false;
  private localVengeanceLog: VengeanceLogItem[] = [];

  // Offline / Fallback Solo Practice State
  private isOfflineMode: boolean = false;
  private localPlayer: any = null;
  private localBots: Map<string, any> = new Map();
  private localPhase: 'lobby' | 'countdown' | 'in-round' | 'ended' = 'lobby';
  private localPhaseTimer: number = 10;
  private localLastSecondCheck: number = 0;
  private localButcherId: string = '';

  // Sector 6 Game Modes & Environmental Weather Engine
  public activeGameMode: GameModeId = 'classic';
  public weatherSystem!: WeatherSystem;
  private visionMask!: Phaser.GameObjects.Graphics;

  // Sector 6 Obstacles & Exploration POIs
  private sectorCrates: SectorCrate[] = [];
  private sectorTerminals: SectorTerminal[] = [];
  private sectorRelics: SectorRelic[] = [];
  private brambleZones: Array<{ x: number; y: number; radius: number }> = [];
  private blastGates: Array<{ sprite: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }> = [];
  private smokeClouds: Array<{ sprite: Phaser.GameObjects.Image; expiresAt: number; x: number; y: number }> = [];

  // New Sector 6 Obstacle & Strategic Turnover Collections
  private electrifiedPuddles: ElectrifiedPuddle[] = [];
  private sporePods: ToxicSporePod[] = [];
  private hydraulicGates: HydraulicGate[] = [];
  private shockMines: ShockMineEntity[] = [];
  private decoys: DecoyEntity[] = [];

  // Exploration & Strategic Turnover State
  private isCamouflaged: boolean = false;
  private activeConsumable: ConsumableType | null = null;
  private slot1Consumable: ConsumableType | null = null;
  private slot2Consumable: ConsumableType | null = null;
  private heldRelicCore: boolean = false;
  private mobileMoveVector = { dx: 0, dy: 0 };
  private isMobileMoveActive: boolean = false;
  private repairedTerminalsCount: number = 0;
  private depositedRelicsCount: number = 0;
  private radioScanExpiresAt: number = 0;
  private blastGateUnlocked: boolean = false;
  private channelStartTime: number = 0;
  private lastRetributionPulseTime: number = 0;
  private lastAmbushTime: number = 0;
  private camoCloakExpiresAt: number = 0;

  // UI Overlays & Juicy VFX
  private debugText!: Phaser.GameObjects.Text;
  private notificationText!: Phaser.GameObjects.Text;
  private whisperText!: Phaser.GameObjects.Text;
  private hudContainer!: Phaser.GameObjects.Container;
  private ability1Text!: Phaser.GameObjects.Text;
  private ability2Text!: Phaser.GameObjects.Text;
  private ability3Text!: Phaser.GameObjects.Text;
  private ability4Text!: Phaser.GameObjects.Text;
  private roundTimerText!: Phaser.GameObjects.Text;
  private myMarkBadgeText!: Phaser.GameObjects.Text;
  private vengeancePanelText!: Phaser.GameObjects.Text;
  private revivePromptText!: Phaser.GameObjects.Text;
  private modeTrackerText!: Phaser.GameObjects.Text;
  private weatherTrackerText!: Phaser.GameObjects.Text;
  private interactionPromptText!: Phaser.GameObjects.Text;
  private consumableSlotText!: Phaser.GameObjects.Text;
  private consumableSlot2Text!: Phaser.GameObjects.Text;
  private heartbeatOverlay!: Phaser.GameObjects.Rectangle;

  private pingMs: number = 22;
  private lastPingCheck: number = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    const mapW = GAME_CONSTANTS.MAP_WIDTH;
    const mapH = GAME_CONSTANTS.MAP_HEIGHT;

    // Set world physics bounds (80x80 tiles @ 32px = 2560x2560)
    this.physics.world.setBounds(0, 0, mapW, mapH);
    this.cameras.main.setBounds(0, 0, mapW, mapH);

    // 1. Build Farm Map Background
    for (let x = 0; x < mapW; x += 32) {
      for (let y = 0; y < mapH; y += 32) {
        if (x >= 416 && x <= 512) {
          this.add.image(x + 16, y + 16, 'tile_water');
        } else if (x >= 704 && x <= 928 && y >= 704 && y <= 928) {
          this.add.image(x + 16, y + 16, 'tile_mud');
        } else {
          this.add.image(x + 16, y + 16, 'tile_grass');
        }
      }
    }

    // 2. Fences (Perimeter and paddocks)
    for (let x = 0; x < mapW; x += 32) {
      this.add.image(x + 16, 16, 'tile_fence');
      this.add.image(x + 16, mapH - 16, 'tile_fence');
    }
    for (let y = 32; y < mapH - 32; y += 32) {
      this.add.image(16, y + 16, 'tile_fence');
      this.add.image(mapW - 16, y + 16, 'tile_fence');
    }

    // 3. Barn Structure (Top Right Farmstead - Slaughter Outpost)
    const barn = this.add.rectangle(1900, 400, 380, 260, 0x78350f);
    barn.setStrokeStyle(6, 0x451a03);
    this.add.text(1900, 390, 'THE SLAUGHTER BARN', {
      fontSize: '22px',
      color: '#fef08a',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // ==========================================
    // SECTOR 6 MAP EXPANSION: OBSTACLES & POIS
    // ==========================================

    // Zone 1: North Silo Compound (Storage & Communications)
    this.add.image(440, 380, 'tile_silo').setScale(1.2).setDepth(20);
    this.add.image(530, 380, 'tile_silo').setScale(1.2).setDepth(20);
    this.add.image(485, 300, 'sector6_sign').setDepth(21);

    // Terminal #1 (North Silo Radio Terminal)
    const term1Sprite = this.add.image(485, 470, 'tile_generator').setScale(1.2).setDepth(25);
    const term1Label = this.add.text(485, 435, '📻 TERMINAL #1 [SILO]\n[HOLD E TO REPAIR]', {
      fontSize: '9px',
      color: '#38bdf8',
      fontStyle: 'bold',
      align: 'center',
      backgroundColor: '#0f172acc',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(26);
    this.sectorTerminals.push({
      id: 'term_1',
      name: 'North Silo Terminal',
      x: 485,
      y: 470,
      sprite: term1Sprite,
      label: term1Label,
      repaired: false,
      progress: 0,
      zoneDesc: 'North Grain Silo',
    });

    // Zone 2: Hydroponic Greenhouse & Bramble Garden (South-West)
    const greenhouse = this.add.rectangle(360, 1950, 320, 220, 0x14532d, 0.45);
    greenhouse.setStrokeStyle(4, 0x059669);
    this.add.text(360, 1940, 'HYDROPONIC GREENHOUSE', {
      fontSize: '16px',
      color: '#34d399',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // Terminal #2 (Greenhouse Power Station)
    const term2Sprite = this.add.image(360, 2030, 'tile_generator').setScale(1.2).setDepth(25);
    const term2Label = this.add.text(360, 1995, '⚡ TERMINAL #2 [GREENHOUSE]\n[HOLD E TO REPAIR]', {
      fontSize: '9px',
      color: '#38bdf8',
      fontStyle: 'bold',
      align: 'center',
      backgroundColor: '#0f172acc',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(26);
    this.sectorTerminals.push({
      id: 'term_2',
      name: 'Greenhouse Terminal',
      x: 360,
      y: 2030,
      sprite: term2Sprite,
      label: term2Label,
      repaired: false,
      progress: 0,
      zoneDesc: 'South-West Greenhouse',
    });

    // Zone 3: Decontamination Drainage Culvert (Mid-West canal)
    const culvertSprite = this.add.image(470, 1250, 'tile_pipe_culvert').setScale(1.3).setDepth(20);
    this.add.text(470, 1215, '☣️ TOXIC CULVERT DRAIN', {
      fontSize: '10px',
      color: '#a3e635',
      fontStyle: 'bold',
      backgroundColor: '#14532dcc',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(21);

    // Terminal #3 (Culvert Drainage Capacitor)
    const term3Sprite = this.add.image(540, 1250, 'tile_generator').setScale(1.2).setDepth(25);
    const term3Label = this.add.text(540, 1215, '🔌 TERMINAL #3 [CULVERT]\n[HOLD E TO REPAIR]', {
      fontSize: '9px',
      color: '#38bdf8',
      fontStyle: 'bold',
      align: 'center',
      backgroundColor: '#0f172acc',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5).setDepth(26);
    this.sectorTerminals.push({
      id: 'term_3',
      name: 'Culvert Terminal',
      x: 540,
      y: 1250,
      sprite: term3Sprite,
      label: term3Label,
      repaired: false,
      progress: 0,
      zoneDesc: 'Mid-West Culvert Canal',
    });

    // Zone 4: Scrap Compound & Boneyard (South-East)
    this.add.image(1950, 1950, 'tile_tractor').setScale(1.3).setDepth(20);
    this.add.image(720, 420, 'tile_tractor').setScale(1.2).setDepth(20);
    this.add.image(1950, 1880, 'sector6_sign').setDepth(21);

    // Barbed Wire Barricades at Chokepoints
    const wirePositions = [
      { x: 380, y: 460 },
      { x: 410, y: 460 },
      { x: 1720, y: 400 },
      { x: 1720, y: 430 },
      { x: 1720, y: 460 },
      { x: 1800, y: 1950 },
      { x: 1830, y: 1950 },
      { x: 1150, y: 1280 },
      { x: 1410, y: 1280 },
    ];
    for (const wp of wirePositions) {
      this.add.image(wp.x, wp.y, 'tile_barbed_wire').setScale(1.1).setDepth(20);
    }

    // Dense Bramble / Camo Bush Patches (Stealth Hideouts)
    const brambleCoords = [
      { x: 260, y: 1880 },
      { x: 460, y: 1920 },
      { x: 320, y: 2080 },
      { x: 620, y: 920 },
      { x: 1480, y: 550 },
      { x: 1680, y: 1450 },
      { x: 880, y: 1850 },
      { x: 2150, y: 850 },
    ];
    for (const bp of brambleCoords) {
      this.add.image(bp.x, bp.y, 'tile_bramble').setScale(1.3).setDepth(22);
      this.brambleZones.push({ x: bp.x, y: bp.y, radius: 36 });
    }

    // Hay Bales (Decorative Cover)
    const hayCoords = [
      { x: 1100, y: 650 },
      { x: 1600, y: 680 },
      { x: 1020, y: 1450 },
      { x: 1540, y: 1550 },
      { x: 2100, y: 1850 },
    ];
    for (const hp of hayCoords) {
      this.add.image(hp.x, hp.y, 'tile_haystack').setScale(1.2).setDepth(21);
      this.brambleZones.push({ x: hp.x, y: hp.y, radius: 28 });
    }

    // Zone 5: South Blast Evacuation Gate (x: 1280, y: 2510)
    const gateSprite = this.add.image(1280, 2515, 'tile_blast_gate').setScale(1.3).setDepth(25);
    const gateLabel = this.add.text(1280, 2480, '🔒 SOUTH BLAST GATE [SEALED]\n[REPAIR 3 TERMINALS TO OPEN]', {
      fontSize: '11px',
      color: '#ef4444',
      fontStyle: 'bold',
      align: 'center',
      backgroundColor: '#18181bcc',
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(26);
    this.blastGates.push({ sprite: gateSprite, label: gateLabel });

    // 12 Sector 6 Supply Crates (Lootable Consumables with Diverse Strategic Items)
    const crateConfigs: Array<{ x: number; y: number; item: ConsumableType }> = [
      { x: 1050, y: 800, item: 'shock_mine' },
      { x: 1550, y: 850, item: 'decoy' },
      { x: 1280, y: 1650, item: 'medkit' },
      { x: 380, y: 350, item: 'camo_cloak' },
      { x: 240, y: 2020, item: 'adrenaline' },
      { x: 620, y: 1250, item: 'smokebomb' },
      { x: 2120, y: 1980, item: 'saltward' },
      { x: 1850, y: 550, item: 'flare' },
      { x: 920, y: 1350, item: 'shock_mine' },
      { x: 1420, y: 1950, item: 'medkit' },
      { x: 800, y: 650, item: 'decoy' },
      { x: 1900, y: 1250, item: 'camo_cloak' },
    ];

    for (let i = 0; i < crateConfigs.length; i++) {
      const cfg = crateConfigs[i];
      const cSprite = this.add.image(cfg.x, cfg.y, 'tile_crate').setScale(1.5).setDepth(20);
      const cLabel = this.add.text(cfg.x, cfg.y - 28, '📦 CRATE [E]', {
        fontSize: '9px',
        color: '#f59e0b',
        fontStyle: 'bold',
        backgroundColor: '#0c0a09dd',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setDepth(21);

      this.sectorCrates.push({
        id: `crate_${i}`,
        x: cfg.x,
        y: cfg.y,
        sprite: cSprite,
        label: cLabel,
        looted: false,
        itemType: cfg.item,
      });
    }

    // 4 Electrified Water Puddles (Strategic Hazards)
    const puddleSpawns = [
      { x: 580, y: 1250 },
      { x: 1450, y: 550 },
      { x: 1100, y: 1750 },
      { x: 2150, y: 1750 },
    ];
    for (let i = 0; i < puddleSpawns.length; i++) {
      const p = puddleSpawns[i];
      const pSpr = this.add.image(p.x, p.y, 'tile_puddle_electric').setScale(1.2).setDepth(18);
      this.tweens.add({
        targets: pSpr,
        alpha: 0.65,
        scale: 1.3,
        yoyo: true,
        repeat: -1,
        duration: 900,
      });
      this.electrifiedPuddles.push({
        id: `puddle_${i}`,
        x: p.x,
        y: p.y,
        sprite: pSpr,
        lastShockTime: 0,
      });
    }

    // 6 Toxic Spore Bloom Pods (Explosive Bio-Hazards)
    const sporeSpawns = [
      { x: 920, y: 500 },
      { x: 1750, y: 820 },
      { x: 780, y: 1550 },
      { x: 1650, y: 1750 },
      { x: 350, y: 1050 },
      { x: 2200, y: 1350 },
    ];
    for (let i = 0; i < sporeSpawns.length; i++) {
      const sp = sporeSpawns[i];
      const spr = this.add.image(sp.x, sp.y, 'tile_spore_pod').setScale(1.2).setDepth(20);
      this.tweens.add({
        targets: spr,
        scaleY: 1.35,
        yoyo: true,
        repeat: -1,
        duration: 1100,
        ease: 'Sine.easeInOut',
      });
      this.sporePods.push({
        id: `spore_${i}`,
        x: sp.x,
        y: sp.y,
        sprite: spr,
        popped: false,
        respawnAt: 0,
      });
    }

    // 2 Hydraulic Chokepoint Blast Gates with Switch Levers (Strategic Trap Turnovers)
    const gateConfigs = [
      {
        id: 'hgate_north',
        gateX: 1680,
        gateY: 420,
        leverX: 1630,
        leverY: 420,
      },
      {
        id: 'hgate_south',
        gateX: 520,
        gateY: 1650,
        leverX: 470,
        leverY: 1650,
      },
    ];
    for (const gc of gateConfigs) {
      const gSprite = this.add.image(gc.gateX, gc.gateY, 'tile_hydraulic_gate').setDepth(25).setAlpha(0.25);
      const lSprite = this.add.image(gc.leverX, gc.leverY, 'tile_lever_switch').setDepth(26);
      const lLabel = this.add.text(gc.leverX, gc.leverY - 24, '🕹️ LEVER [E]', {
        fontSize: '9px',
        color: '#22c55e',
        fontStyle: 'bold',
        backgroundColor: '#0c0a09e6',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setDepth(27);

      this.hydraulicGates.push({
        id: gc.id,
        gateX: gc.gateX,
        gateY: gc.gateY,
        leverX: gc.leverX,
        leverY: gc.leverY,
        gateSprite: gSprite,
        leverSprite: lSprite,
        leverLabel: lLabel,
        isClosed: false,
        closedUntil: 0,
      });
    }

    // 4 Glowing Bio-Cores (Relics for Altar Overdrive mode or bonuses)
    const relicSpawns = [
      { x: 440, y: 520 },
      { x: 420, y: 2080 },
      { x: 500, y: 1180 },
      { x: 2040, y: 1900 },
    ];
    for (let i = 0; i < relicSpawns.length; i++) {
      const rp = relicSpawns[i];
      const rSprite = this.add.image(rp.x, rp.y, 'item_relic').setScale(1.2).setDepth(22);
      this.tweens.add({
        targets: rSprite,
        y: rp.y - 6,
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      const rLabel = this.add.text(rp.x, rp.y - 24, '🔮 BIO-CORE [E]', {
        fontSize: '9px',
        color: '#c084fc',
        fontStyle: 'bold',
        backgroundColor: '#2e1065cc',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setDepth(23);

      this.sectorRelics.push({
        id: `relic_${i}`,
        x: rp.x,
        y: rp.y,
        sprite: rSprite,
        label: rLabel,
        collected: false,
      });
    }

    // Central Sacrificial Altar
    const altar = this.add.image(
      GAME_CONSTANTS.ALTAR_POSITION.x,
      GAME_CONSTANTS.ALTAR_POSITION.y,
      'altar_base'
    );
    this.tweens.add({
      targets: altar,
      scaleX: 1.06,
      scaleY: 1.06,
      alpha: 0.85,
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });

    this.add.text(
      GAME_CONSTANTS.ALTAR_POSITION.x,
      GAME_CONSTANTS.ALTAR_POSITION.y + 75,
      'SACRIFICIAL ALTAR',
      {
        fontSize: '14px',
        color: '#f87171',
        fontStyle: 'bold',
        backgroundColor: '#18181bcc',
        padding: { x: 8, y: 4 },
      }
    ).setOrigin(0.5);

    // Initialize Environmental Weather Engine
    this.weatherSystem = new WeatherSystem(this, (def, isWarning) => {
      this.handleWeatherUpdate(def, isWarning);
    });

    // Initialize Voice & Species Communication Engine
    this.voiceComms = new VoiceCommsEngine(
      () => this.handleSilencePenalty(),
      (animal) => this.handleBarnyardChorus(animal)
    );

    // Setup Engagement Hub Callbacks
    engagementHubModal.setCallbacks(
      (granted) => {
        this.voiceComms.setVoiceConsent(granted);
        this.showAnnouncement(granted ? '🎙️ Animal Voice Chat Enabled!' : '🔇 Voice Chat Disabled', '#38bdf8');
      },
      (sentence) => {
        this.customParrotSentence = sentence;
        this.showAnnouncement(`🦜 Parrot broadcast updated: "${sentence}"`, '#10b981');
      }
    );

    // Vision Vignette / Darkness Mask (depth 180)
    this.visionMask = this.add.graphics().setDepth(180);

    // Setup Keyboard Controls (WASD, Arrows, Q, E, R, F, SPACE, M, K, 1)
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        keyQ: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
        keyE: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
        keyR: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
        keyF: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F),
        keySpace: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
        keyL: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L),
        keyB: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B),
        keyM: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M),
        keyK: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K),
        key1: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
        key2: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
        keyV: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V),
        keyC: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C),
        keyT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T),
        keyG: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G),
        keyY: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Y),
        keyH: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H),
      };

      // V: Push-to-Talk / Species Sound Call
      this.wasd.keyV.on('down', () => {
        this.handleVoicePTTDown();
      });
      this.wasd.keyV.on('up', () => {
        this.handleVoicePTTUp();
      });

      // C: Toggle Mute
      this.wasd.keyC.on('down', () => {
        this.handleToggleMute();
      });

      // T: Emote Wheel Toggle
      this.wasd.keyT.on('down', () => {
        this.handleToggleEmoteWheel();
      });

      // G: Headbutt Physical Comedy
      this.wasd.keyG.on('down', () => {
        this.handleHeadbutt();
      });

      // Y: Trigger Instant Replay
      this.wasd.keyY.on('down', () => {
        this.handleInstantReplay();
      });

      // H: Engagement & Comms Hub Modal
      this.wasd.keyH.on('down', () => {
        this.handleToggleEngagementHub();
      });

      // M: Open Game Modes & Weather UI
      this.wasd.keyM.on('down', () => {
        this.toggleGameModeModal();
      });

      // 1 & 2: Use Scavenged Consumable Items
      this.wasd.key1.on('down', () => {
        this.useActiveConsumable(1);
      });
      this.wasd.key2.on('down', () => {
        this.useActiveConsumable(2);
      });

      // L: Toggle Leaderboards Modal
      this.wasd.keyL.on('down', () => {
        leaderboardModal.toggle();
      });

      // Q: Primary or Cleaver
      this.wasd.keyQ.on('down', () => {
        this.handleQKey();
      });

      // E: Betrayal / Revive or Interact (hold for terminal)
      this.wasd.keyE.on('down', () => {
        this.handleEKey();
      });

      // SPACE: Butcher Snare
      this.wasd.keySpace.on('down', () => {
        this.handleSpaceKey();
      });

      // F: Butcher Dog Whistle or Surprise Ambush Tackle
      this.wasd.keyF.on('down', () => {
        this.handleFKey();
      });

      // R: Free Reroll in Lobby
      this.wasd.keyR.on('down', () => {
        if (this.currentRoom && this.currentRoom.state?.phase === 'lobby') {
          this.currentRoom.send(NETWORK_MESSAGES.REROLL_ANIMAL);
        }
      });
    }

    // Mobile On-Screen Controls Event Wireup
    window.addEventListener('MOBILE_MOVE_UPDATE', (e: any) => {
      const { dx, dy } = e.detail;
      this.mobileMoveVector.dx = dx;
      this.mobileMoveVector.dy = dy;
      this.isMobileMoveActive = Math.abs(dx) > 0.04 || Math.abs(dy) > 0.04;
    });

    window.addEventListener('MOBILE_ACTION_Q', () => {
      this.handleQKey();
    });

    window.addEventListener('MOBILE_ACTION_E', () => {
      this.handleEKey();
    });

    window.addEventListener('MOBILE_ACTION_SPACE', () => {
      this.handleSpaceKey();
    });

    window.addEventListener('MOBILE_ACTION_V_DOWN', () => {
      this.handleVoicePTTDown();
    });

    window.addEventListener('MOBILE_ACTION_V_UP', () => {
      this.handleVoicePTTUp();
    });

    window.addEventListener('MOBILE_ACTION_T', () => {
      this.handleToggleEmoteWheel();
    });

    window.addEventListener('MOBILE_ACTION_G', () => {
      this.handleHeadbutt();
    });

    window.addEventListener('MOBILE_ACTION_ITEM_1', () => {
      this.useActiveConsumable(1);
    });

    window.addEventListener('MOBILE_ACTION_ITEM_2', () => {
      this.useActiveConsumable(2);
    });

    // Global Event Listeners from Home Menu & HUD buttons
    window.addEventListener('TOGGLE_GAME_MODES_MODAL', () => {
      this.toggleGameModeModal();
    });

    window.addEventListener('START_SOLO_MODE', (e: any) => {
      const selectedAnimal = e.detail?.animal;
      if (selectedAnimal) {
        const p = getCachedActivePlayer();
        p.last_animal = selectedAnimal;
        saveCachedActivePlayer(p);
      }
      this.initLocalMode();
      this.showAnnouncement(`🌾 Solo Survival Started! You are playing as ${selectedAnimal?.toUpperCase() || 'PIG'}.`, '#22c55e');
    });

    window.addEventListener('START_LIVE_MODE', (e: any) => {
      const selectedAnimal = e.detail?.animal;
      if (selectedAnimal) {
        const p = getCachedActivePlayer();
        p.last_animal = selectedAnimal;
        saveCachedActivePlayer(p);
      }
      this.showAnnouncement('📡 Connecting to Live Colyseus Farm Server...', '#38bdf8');
      this.connectColyseus();
    });

    // Centered Camera
    this.cameras.main.centerOn(GAME_CONSTANTS.ALTAR_POSITION.x, GAME_CONSTANTS.ALTAR_POSITION.y);
    this.cameras.main.setZoom(1.15);

    // Create HUD & Debug Overlays
    this.createHudOverlay();

    // Connect to Colyseus Server
    this.connectColyseus();
  }

  private createHudOverlay() {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // 0. Low Health & Adrenaline Heartbeat Vignette Overlay
    this.heartbeatOverlay = this.add
      .rectangle(screenW / 2, screenH / 2, screenW, screenH, 0xef4444, 0)
      .setScrollFactor(0)
      .setDepth(185);

    // 1. Debug Overlay (Hidden in production gameplay)
    this.debugText = this.add.text(18, 18, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#4ade80',
      backgroundColor: '#0c0a09e6',
      padding: { x: 12, y: 10 },
      lineSpacing: 4,
    }).setScrollFactor(0).setDepth(200).setVisible(false);

    // 2. Center Banner Notifications
    this.notificationText = this.add.text(screenW / 2, 85, '', {
      fontSize: '18px',
      color: '#facc15',
      fontStyle: 'bold',
      backgroundColor: '#1c1917f2',
      padding: { x: 18, y: 8 },
      stroke: '#000000',
      strokeThickness: 3,
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5).setAlpha(0);

    // 3. Transformation Whisper Text Overlay (Dramatic Center)
    this.whisperText = this.add.text(screenW / 2, screenH / 2 - 40, '', {
      fontSize: '28px',
      color: '#ef4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
    }).setScrollFactor(0).setDepth(300).setOrigin(0.5).setAlpha(0);

    // 4. Revive Prompt (Floating above HUD)
    this.revivePromptText = this.add.text(screenW / 2, screenH - 125, '', {
      fontSize: '14px',
      color: '#4ade80',
      fontStyle: 'bold',
      backgroundColor: '#064e3bcc',
      padding: { x: 16, y: 6 },
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5).setAlpha(0);

    // 5. Vengeance Log Panel (Top-Right)
    this.vengeancePanelText = this.add.text(screenW - 20, 18, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#fca5a5',
      backgroundColor: '#450a0acc',
      padding: { x: 12, y: 8 },
      align: 'right',
    }).setScrollFactor(0).setDepth(200).setOrigin(1, 0).setAlpha(0);

    // 6. Bottom Ability Bar HUD with Dual Item Slots
    this.hudContainer = this.add.container(screenW / 2, screenH - 55);
    this.hudContainer.setScrollFactor(0).setDepth(200);

    const bgBar = this.add.rectangle(0, 0, 940, 72, 0x1c1917, 0.95);
    bgBar.setStrokeStyle(2, 0x44403c);

    this.myMarkBadgeText = this.add.text(-405, -10, 'YOUR MARK: 0\n[CLEAN]', {
      fontSize: '12px',
      color: '#22c55e',
      align: 'center',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.ability1Text = this.add.text(-270, -10, '[Q] Ability 1\nReady', {
      fontSize: '11px',
      color: '#38bdf8',
      align: 'center',
    }).setOrigin(0.5);

    this.ability2Text = this.add.text(-135, -10, '[E] Ability 2\nReady', {
      fontSize: '11px',
      color: '#f87171',
      align: 'center',
    }).setOrigin(0.5);

    this.ability3Text = this.add.text(-5, -10, '[SPACE] Snare\nLocked', {
      fontSize: '11px',
      color: '#a8a29e',
      align: 'center',
    }).setOrigin(0.5);

    this.ability4Text = this.add.text(120, -10, '[F] Counter/Whistle\nReady', {
      fontSize: '11px',
      color: '#a855f7',
      align: 'center',
    }).setOrigin(0.5);

    this.consumableSlotText = this.add.text(250, -10, '[1] SLOT 1\n[Empty]', {
      fontSize: '11px',
      color: '#f59e0b',
      align: 'center',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.consumableSlot2Text = this.add.text(375, -10, '[2] SLOT 2\n[Empty]', {
      fontSize: '11px',
      color: '#38bdf8',
      align: 'center',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.roundTimerText = this.add.text(0, 22, 'LOBBY WAITING FOR PLAYERS', {
      fontSize: '11px',
      color: '#a8a29e',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.hudContainer.add([
      bgBar,
      this.myMarkBadgeText,
      this.ability1Text,
      this.ability2Text,
      this.ability3Text,
      this.ability4Text,
      this.consumableSlotText,
      this.consumableSlot2Text,
      this.roundTimerText,
    ]);

    // 7. Top Sector 6 Tracker (Game Mode & Objectives)
    this.modeTrackerText = this.add.text(screenW / 2 - 180, 24, '', {
      fontSize: '11px',
      color: '#38bdf8',
      fontStyle: 'bold',
      backgroundColor: '#0c0a09e6',
      padding: { x: 10, y: 5 },
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5, 0);

    // 8. Top Weather Tracker
    this.weatherTrackerText = this.add.text(screenW / 2 + 180, 24, '', {
      fontSize: '11px',
      color: '#84cc16',
      fontStyle: 'bold',
      backgroundColor: '#0c0a09e6',
      padding: { x: 10, y: 5 },
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5, 0);

    // 9. Interactive Action Prompt (Centered above player HUD)
    this.interactionPromptText = this.add.text(screenW / 2, screenH - 120, '', {
      fontSize: '13px',
      color: '#facc15',
      fontStyle: 'bold',
      backgroundColor: '#1c1917f2',
      padding: { x: 14, y: 6 },
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(210).setOrigin(0.5).setAlpha(0);

    // 10. Silence of Suspicion Tracker (Top HUD)
    this.silenceTrackerText = this.add.text(screenW / 2, 58, '🤫 SILENCE: 30s', {
      fontSize: '11px',
      color: '#22c55e',
      fontStyle: 'bold',
      backgroundColor: '#0c0a09e6',
      padding: { x: 10, y: 4 },
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(200).setOrigin(0.5, 0);

    // 11. Push-To-Talk and Audio State Bar (Above Ability Bar)
    this.pttIndicatorText = this.add.text(screenW / 2, screenH - 102, '🎙️ [V] CALL SPECIES SOUND • [C] MUTE • [T] EMOTES • [H] ENGAGEMENT HUB', {
      fontSize: '10px',
      color: '#94a3b8',
      backgroundColor: '#0f172aee',
      padding: { x: 12, y: 3 },
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(205).setOrigin(0.5);

    // 12. 4-Minute Round Micro-Narrative Act Header (Top-most Center)
    this.narrativeActText = this.add.text(screenW / 2, 6, 'ACT I: THE GRAZING', {
      fontSize: '11px',
      color: '#38bdf8',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    }).setScrollFactor(0).setDepth(205).setOrigin(0.5, 0);

    // 13. Paranoia Mark 5-Phase Vignette (Screen border glow, depth 188)
    this.paranoiaVignette = this.add.graphics().setScrollFactor(0).setDepth(188);

    // 14. Cinematic Replay Overlays
    this.createReplayOverlay(screenW, screenH);

    // 15. Emote Wheel Overlay (Radial quick-picker, depth 250)
    this.createEmoteWheel(screenW, screenH);
  }

  private showAnnouncement(text: string, color: string = '#facc15') {
    this.notificationText.setText(text);
    this.notificationText.setColor(color);
    this.notificationText.setAlpha(1);

    this.tweens.killTweensOf(this.notificationText);
    this.tweens.add({
      targets: this.notificationText,
      alpha: 0,
      duration: 800,
      delay: 2500,
    });
  }

  // ==============================================================
  // VOICE & SPECIES COMMUNICATION SYSTEM
  // ==============================================================

  private handleVoicePTTDown() {
    if (!this.voiceComms.hasVoiceConsent()) {
      voiceConsentModal.open((granted) => {
        this.voiceComms.setVoiceConsent(granted);
        if (granted) {
          this.showAnnouncement('🎙️ Microphone & Animal Voice Enabled!', '#38bdf8');
          this.executeVoiceCall();
        } else {
          this.showAnnouncement('🔇 Using Manual Species Sounds', '#a8a29e');
          this.executeVoiceCall();
        }
      });
      return;
    }
    this.executeVoiceCall();
  }

  private executeVoiceCall() {
    let myId = 'local_player';
    let myUsername = 'You';
    let myAnimal: AnimalType = 'pig';
    let myX = 1280;
    let myY = 1200;

    if (this.isOfflineMode && this.localPlayer) {
      myId = this.localPlayer.id;
      myUsername = this.localPlayer.username;
      myAnimal = this.localPlayer.animal;
      myX = this.localPlayer.x;
      myY = this.localPlayer.y;
    } else if (this.currentRoom?.state?.players) {
      const p = this.currentRoom.state.players.get(this.currentRoom.sessionId);
      if (p) {
        myId = p.sessionId;
        myUsername = p.username;
        myAnimal = p.animal;
        myX = p.x;
        myY = p.y;
      }
    }

    const isRainOrFog = this.weatherSystem?.currentWeather === 'acid_rain' || this.weatherSystem?.currentWeather === 'toxic_fog';
    const ev = this.voiceComms.makeSpeciesCall(
      myId,
      myUsername,
      myAnimal,
      myX,
      myY,
      isRainOrFog,
      this.customParrotSentence
    );

    if (ev) {
      this.broadcastSpeciesSound(ev);
      this.pttIndicatorText.setText(`🎙️ [V] TRANSMITTING: "${ev.text}"`).setColor('#38bdf8');
    }
  }

  private handleVoicePTTUp() {
    this.voiceComms.stopPTT();
    this.pttIndicatorText
      .setText('🎙️ [V] CALL SPECIES SOUND • [C] MUTE • [T] EMOTES • [H] ENGAGEMENT HUB')
      .setColor('#94a3b8');
  }

  private handleToggleMute() {
    const muted = this.voiceComms.toggleMute();
    this.showAnnouncement(muted ? '🔇 Audio Muted [C]' : '🔊 Audio Unmuted [C]', muted ? '#f87171' : '#4ade80');
    this.pttIndicatorText.setColor(muted ? '#ef4444' : '#94a3b8');
  }

  private handleToggleEmoteWheel() {
    this.isEmoteWheelOpen = !this.isEmoteWheelOpen;
    this.tweens.add({
      targets: this.emoteWheelContainer,
      alpha: this.isEmoteWheelOpen ? 1 : 0,
      scaleX: this.isEmoteWheelOpen ? 1 : 0.8,
      scaleY: this.isEmoteWheelOpen ? 1 : 0.8,
      duration: 180,
      ease: 'Back.easeOut',
    });
  }

  private handleHeadbutt() {
    let p = this.isOfflineMode ? this.localPlayer : this.currentRoom?.state?.players?.get(this.currentRoom?.sessionId);
    if (!p || p.isDowned || p.isStunned) return;

    soundFx.playHeadbuttBonk();
    const vis = this.players.get(p.sessionId || 'local_player');
    if (vis) {
      // Forward spring impulse
      this.tweens.add({
        targets: vis.container,
        y: vis.container.y - 35,
        duration: 90,
        yoyo: true,
        ease: 'Cubic.easeOut',
      });
    }

    // Check collision with other bots or players
    const targets = this.isOfflineMode ? Array.from(this.localBots.values()) : [];
    for (const target of targets) {
      const d = Math.hypot(target.x - p.x, target.y - p.y);
      if (d <= 65) {
        target.x += (target.x - p.x) * 0.5;
        target.y += (target.y - p.y) * 0.5;
        this.spawnSparkBurst(target.x, target.y);
        this.showAnnouncement(`💥 HEADBUTT IMPACT on ${target.username}!`, '#facc15');
        this.lastDramaticEvent = `Comedic Headbutt on ${target.username}`;
        engagementEngine.addHighlight({
          id: Date.now().toString(),
          title: 'Comic Headbutt',
          desc: `Staggered ${target.username} with a blunt headbutt`,
          icon: '💥',
          tag: 'comedy',
        });
        break;
      }
    }
  }

  private handleInstantReplay() {
    if (this.isInstantReplayActive) return;
    this.isInstantReplayActive = true;
    soundFx.playNearMiss();

    // Cinematic letterbox slide-in
    this.tweens.add({
      targets: this.replayLetterboxTop,
      y: 40,
      duration: 350,
      ease: 'Cubic.easeOut',
    });
    this.tweens.add({
      targets: this.replayLetterboxBottom,
      y: window.innerHeight - 40,
      duration: 350,
      ease: 'Cubic.easeOut',
    });

    this.replayBannerText.setText(`🎬 INSTANT REPLAY: ${this.lastDramaticEvent.toUpperCase()}`).setAlpha(1);

    // Zoom camera slightly
    this.cameras.main.zoomTo(1.4, 400);

    setTimeout(() => {
      this.cameras.main.zoomTo(1.2, 400);
      this.tweens.add({
        targets: this.replayLetterboxTop,
        y: -60,
        duration: 350,
      });
      this.tweens.add({
        targets: this.replayLetterboxBottom,
        y: window.innerHeight + 60,
        duration: 350,
        onComplete: () => {
          this.isInstantReplayActive = false;
          this.replayBannerText.setAlpha(0);
        },
      });
    }, 2400);
  }

  private handleToggleEngagementHub() {
    engagementHubModal.toggle();
  }

  private handleSilencePenalty() {
    soundFx.playSuspicionStinger();
    this.cameras.main.flash(500, 245, 158, 11); // Amber flash
    this.showAnnouncement('🤫 SILENCE OF SUSPICION! Staying silent for 30s grants +1 Mark!', '#f59e0b');

    if (this.isOfflineMode && this.localPlayer) {
      this.localPlayer.mark += 1;
    } else if (this.currentRoom) {
      this.currentRoom.send(NETWORK_MESSAGES.MARK_PENALTY, { penalty: 'silence' });
    }
  }

  private handleBarnyardChorus(animal: AnimalType) {
    this.showAnnouncement(`🎶 BARNYARD CHORUS! 3+ ${animal.toUpperCase()}S UNITE! +5% SPEED BUFF!`, '#38bdf8');
    this.cameras.main.flash(400, 56, 189, 248);

    if (this.isOfflineMode && this.localPlayer) {
      const origSpeed = this.localPlayer.speed;
      this.localPlayer.speed = Math.round(origSpeed * 1.05);
      setTimeout(() => {
        if (this.localPlayer) this.localPlayer.speed = origSpeed;
      }, 4000);
    }

    engagementEngine.addHighlight({
      id: Date.now().toString(),
      title: 'Barnyard Chorus',
      desc: `Synchronized herd chorus granted +5% speed`,
      icon: '🎶',
      tag: 'chorus',
    });
    this.lastDramaticEvent = `${animal.toUpperCase()} Barnyard Chorus`;
  }

  private broadcastSpeciesSound(ev: ISpeciesSoundEvent) {
    // 1. Expanding visual sound wave ripple
    const ripple = this.add.image(ev.x, ev.y, 'fx_sound_wave').setScale(0.2).setAlpha(0.9).setDepth(115);
    const targetScale = ev.radius / 24; // 48px base texture
    this.tweens.add({
      targets: ripple,
      scaleX: targetScale,
      scaleY: targetScale,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => ripple.destroy(),
    });

    // 2. Display speech bubble above animal
    this.displaySpeechBubble(ev.senderId, ev.text, ev.isParrotSentence, ev.isGarbled);

    // 3. Sound ping warning to Butcher if in range
    const isButcher = this.isOfflineMode
      ? this.localPlayer?.role === 'butcher'
      : this.currentRoom?.state?.players?.get(this.currentRoom?.sessionId)?.role === 'butcher';

    if (isButcher && ev.senderId !== (this.isOfflineMode ? 'local_player' : this.currentRoom?.sessionId)) {
      const myX = this.isOfflineMode ? this.localPlayer?.x ?? 0 : 0;
      const myY = this.isOfflineMode ? this.localPlayer?.y ?? 0 : 0;
      const dist = Math.hypot(ev.x - myX, ev.y - myY);

      if (dist <= ev.radius) {
        // Faint audio ping on butcher's radar
        const ping = this.add.circle(ev.x, ev.y, 16, 0xef4444, 0.7).setDepth(130);
        this.tweens.add({
          targets: ping,
          radius: 64,
          alpha: 0,
          duration: 1200,
          onComplete: () => ping.destroy(),
        });
        this.showAnnouncement(`👂 SOUND HEARD: [${ev.animal.toUpperCase()}] Nearby!`, '#ef4444');
      }
    }
  }

  private displaySpeechBubble(sessionId: string, text: string, isParrot?: boolean, isGarbled?: boolean) {
    const visual = this.players.get(sessionId);
    if (!visual) return;

    if (visual.speechBubble) {
      visual.speechBubble.destroy();
    }

    const bubble = this.add.container(0, isParrot ? -68 : -54);
    bubble.setDepth(150);

    const isGarbledParrot = isParrot && isGarbled;
    const bgColor = isGarbledParrot ? 0x7f1d1d : isParrot ? 0x064e3b : 0x18181b;
    const strokeColor = isGarbledParrot ? 0xef4444 : isParrot ? 0x10b981 : 0xfacc15;
    const textColor = isGarbledParrot ? '#fca5a5' : isParrot ? '#a7f3d0' : '#fef08a';

    const paddingX = 10;
    const textObj = this.add
      .text(0, 0, text, {
        fontSize: isParrot ? '11px' : '12px',
        color: textColor,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 180 },
      })
      .setOrigin(0.5);

    const boxW = Math.max(50, textObj.width + paddingX * 2);
    const boxH = Math.max(26, textObj.height + 10);

    const bgRect = this.add.rectangle(0, 0, boxW, boxH, bgColor, 0.95);
    bgRect.setStrokeStyle(2, strokeColor);

    bubble.add([bgRect, textObj]);
    visual.container.add(bubble);
    visual.speechBubble = bubble;

    // Pop-in bounce tween
    bubble.setScale(0.5);
    this.tweens.add({
      targets: bubble,
      scaleX: 1,
      scaleY: 1,
      duration: 150,
      ease: 'Back.easeOut',
    });

    const lifespan = isParrot ? 3800 : 1600;
    this.time.delayedCall(lifespan, () => {
      if (bubble && bubble.active) {
        this.tweens.add({
          targets: bubble,
          alpha: 0,
          y: bubble.y - 12,
          duration: 300,
          onComplete: () => bubble.destroy(),
        });
      }
    });
  }

  private triggerEmote(sessionId: string, emote: EmoteType) {
    const visual = this.players.get(sessionId);
    if (!visual) return;

    soundFx.playEmoteSound(emote);

    if (emote === 'dance') {
      // Joyful 360 spin and bob
      this.tweens.add({
        targets: visual.container,
        angle: 360,
        duration: 650,
        ease: 'Cubic.easeInOut',
        onComplete: () => visual.container.setAngle(0),
      });
      for (let i = 0; i < 4; i++) {
        const note = this.add.image(visual.container.x + (i - 2) * 12, visual.container.y - 25, 'fx_note').setDepth(140);
        this.tweens.add({
          targets: note,
          y: note.y - 30,
          alpha: 0,
          duration: 800 + i * 100,
          onComplete: () => note.destroy(),
        });
      }
    } else if (emote === 'taunt') {
      // Cheeky wiggle
      this.tweens.add({
        targets: visual.container,
        x: visual.container.x + 12,
        yoyo: true,
        repeat: 3,
        duration: 80,
      });
      this.displaySpeechBubble(sessionId, '😛 NA-NA-NA!');
    } else if (emote === 'fear') {
      // Shiver jitter
      this.tweens.add({
        targets: visual.container,
        x: visual.container.x + 4,
        yoyo: true,
        repeat: 6,
        duration: 45,
      });
      for (let i = 0; i < 3; i++) {
        const drop = this.add.image(visual.container.x + (i - 1) * 10, visual.container.y - 30, 'fx_sweat_drop').setDepth(140);
        this.tweens.add({
          targets: drop,
          y: drop.y + 20,
          alpha: 0,
          duration: 600,
          onComplete: () => drop.destroy(),
        });
      }
    } else if (emote === 'sleep') {
      // Lie down with Zzz bubbles
      visual.container.setAngle(90);
      for (let i = 0; i < 3; i++) {
        const zzz = this.add.image(visual.container.x + 10 + i * 8, visual.container.y - 20 - i * 12, 'fx_zzz').setDepth(140);
        this.tweens.add({
          targets: zzz,
          y: zzz.y - 25,
          alpha: 0,
          duration: 1200 + i * 200,
          onComplete: () => {
            zzz.destroy();
            visual.container.setAngle(0);
          },
        });
      }
    } else if (emote === 'headbutt') {
      this.handleHeadbutt();
    }
  }

  private checkNearMissSlowMo(attackerX: number, attackerY: number) {
    const preyList = this.isOfflineMode
      ? [this.localPlayer, ...Array.from(this.localBots.values())].filter((p) => p && !p.isDowned && p.role !== 'butcher')
      : [];

    for (const prey of preyList) {
      const d = Math.hypot(prey.x - attackerX, prey.y - attackerY);
      // Cleaver hits at 85px. Near-miss window is 86-125px
      if (d > 85 && d <= 125) {
        soundFx.playNearMiss();
        this.nearMissSlowMoUntil = Date.now() + 650;
        this.cameras.main.flash(300, 56, 189, 248);
        this.showAnnouncement('⚡ NEAR-MISS! SLOW-MO EVASION!', '#38bdf8');
        this.lastDramaticEvent = 'Near-Miss Cleaver Evaded!';
        engagementEngine.addHighlight({
          id: Date.now().toString(),
          title: 'Clutch Near-Miss',
          desc: 'Evaded the Butcher cleaver by a hairline split-second',
          icon: '⚡',
          tag: 'evasion',
        });
        break;
      }
    }
  }

  private checkMudSlip(x: number, y: number) {
    const now = Date.now();
    if (now < this.mudSlipCooldownUntil) return;

    // Check if on mud
    const tileX = Math.floor(x / 32);
    const tileY = Math.floor(y / 32);
    // Mud pit coords check (centered around pond and creek banks)
    const isNearMud = (x >= 350 && x <= 650 && y >= 1100 && y <= 1350) || (x >= 1400 && x <= 1650 && y >= 1400 && y <= 1650);

    const isTuesday = new Date().getDay() === 2;
    const slipChance = isTuesday ? 0.015 : 0.005;

    if (isNearMud && Math.random() < slipChance) {
      this.mudSlipCooldownUntil = now + 5000;
      soundFx.playMudSlip();

      const vis = this.players.get('local_player');
      if (vis) {
        this.tweens.add({
          targets: vis.container,
          angle: 360,
          duration: 400,
          onComplete: () => vis.container.setAngle(0),
        });
      }

      this.showAnnouncement('🍌 WHOOPS! MUD SLIP!', '#facc15');
      this.lastDramaticEvent = 'Hilarious Mud Slip';
    }
  }

  private createReplayOverlay(screenW: number, screenH: number) {
    this.replayLetterboxTop = this.add
      .rectangle(screenW / 2, -60, screenW, 80, 0x000000, 0.95)
      .setScrollFactor(0)
      .setDepth(295);

    this.replayLetterboxBottom = this.add
      .rectangle(screenW / 2, screenH + 60, screenW, 80, 0x000000, 0.95)
      .setScrollFactor(0)
      .setDepth(295);

    this.replayBannerText = this.add
      .text(screenW / 2, 36, '🎬 INSTANT REPLAY', {
        fontSize: '13px',
        color: '#facc15',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(296)
      .setOrigin(0.5)
      .setAlpha(0);
  }

  private createEmoteWheel(screenW: number, screenH: number) {
    this.emoteWheelContainer = this.add.container(screenW / 2, screenH / 2);
    this.emoteWheelContainer.setScrollFactor(0).setDepth(260).setAlpha(0);

    const bg = this.add.rectangle(0, 0, 360, 240, 0x1c1917, 0.96);
    bg.setStrokeStyle(2, 0x57534e);

    const title = this.add
      .text(0, -92, '🎭 BARNYARD EMOTE WHEEL', {
        fontSize: '13px',
        color: '#facc15',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const emotes: Array<{ label: string; key: EmoteType; y: number }> = [
      { label: '[1] 💃 Dance (Spin & Chime)', key: 'dance', y: -50 },
      { label: '[2] 😛 Taunt (Raspberry Wiggle)', key: 'taunt', y: -15 },
      { label: '[3] 😨 Fear (Shiver & Sweat)', key: 'fear', y: 20 },
      { label: '[4] 💤 Sleep (Lullaby Zzz)', key: 'sleep', y: 55 },
      { label: '[G] 💥 Headbutt (Bonk Slam)', key: 'headbutt', y: 90 },
    ];

    const elements: Phaser.GameObjects.GameObject[] = [bg, title];

    emotes.forEach((e) => {
      const btnBg = this.add.rectangle(0, e.y, 300, 28, 0x292524, 0.9).setInteractive({ cursor: 'pointer' });
      btnBg.setStrokeStyle(1, 0x44403c);
      const btnText = this.add
        .text(0, e.y, e.label, {
          fontSize: '11px',
          color: '#e7e5e4',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      btnBg.on('pointerover', () => {
        btnBg.setFillStyle(0x44403c, 1);
        btnText.setColor('#facc15');
      });
      btnBg.on('pointerout', () => {
        btnBg.setFillStyle(0x292524, 0.9);
        btnText.setColor('#e7e5e4');
      });
      btnBg.on('pointerdown', () => {
        this.triggerEmote('local_player', e.key);
        this.handleToggleEmoteWheel();
      });

      elements.push(btnBg, btnText);
    });

    this.emoteWheelContainer.add(elements);
  }

  private updateParanoiaVignette(mark: number) {
    this.paranoiaVignette.clear();
    const phase = engagementEngine.getParanoiaPhase(mark);
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    if (phase.phase === 0) return; // Clean

    if (phase.phase === 1) {
      // Soft whispers blue halo
      this.paranoiaVignette.lineStyle(8, 0x38bdf8, 0.25);
      this.paranoiaVignette.strokeRect(4, 4, screenW - 8, screenH - 8);
    } else if (phase.phase === 2) {
      // Yellow pulsing border
      const pulse = 0.3 + 0.2 * Math.sin(Date.now() / 300);
      this.paranoiaVignette.lineStyle(14, 0xfacc15, pulse);
      this.paranoiaVignette.strokeRect(6, 6, screenW - 12, screenH - 12);
    } else if (phase.phase === 3) {
      // Condemned red warning border
      const pulse = 0.45 + 0.35 * Math.sin(Date.now() / 200);
      this.paranoiaVignette.lineStyle(20, 0xef4444, pulse);
      this.paranoiaVignette.strokeRect(8, 8, screenW - 16, screenH - 16);
    } else if (phase.phase === 4) {
      // Sacrificial Target: Blaring crimson edge + flashing corners
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 120);
      this.paranoiaVignette.lineStyle(26, 0xdc2626, pulse);
      this.paranoiaVignette.strokeRect(10, 10, screenW - 20, screenH - 20);
    }
  }

  private handleQKey() {
    if (this.isOfflineMode) {
      this.handleLocalQKey();
      return;
    }
    if (!this.currentRoom || this.isFrozen) return;
    const myPlayer = this.currentRoom.state?.players?.get(this.currentRoom.sessionId);
    if (!myPlayer || myPlayer.isDowned || myPlayer.isStunned) return;

    if (myPlayer.role === 'butcher') {
      this.currentRoom.send(NETWORK_MESSAGES.USE_BUTCHER_ABILITY, { ability: 'cleaver' });
      soundFx.playCleaverSlash();
    } else {
      this.currentRoom.send(NETWORK_MESSAGES.USE_ABILITY, { isBetrayal: false });
    }
  }

  private handleEKey() {
    if (this.isOfflineMode) {
      this.handleLocalEKey();
      return;
    }
    if (!this.currentRoom || this.isFrozen) return;
    const myPlayer = this.currentRoom.state?.players?.get(this.currentRoom.sessionId);
    if (!myPlayer || myPlayer.isDowned || myPlayer.isStunned) return;

    // Check if near downed ally to revive
    const downedAlly = this.getNearestDownedAlly(myPlayer);
    if (downedAlly) {
      this.currentRoom.send(NETWORK_MESSAGES.REVIVE_ALLY, { targetSessionId: downedAlly.sessionId });
      soundFx.playReviveSound();
      return;
    }

    // Check if near Sector 6 POIs (Crates, Relics, Altar, Terminal)
    if (this.trySectorInteraction(myPlayer.x, myPlayer.y)) {
      return;
    }

    if (myPlayer.role === 'butcher') {
      this.currentRoom.send(NETWORK_MESSAGES.USE_BUTCHER_ABILITY, { ability: 'lantern' });
    } else {
      this.currentRoom.send(NETWORK_MESSAGES.USE_ABILITY, { isBetrayal: true });
    }
  }

  private handleSpaceKey() {
    if (this.isOfflineMode) {
      this.handleLocalSpaceKey();
      return;
    }
    if (!this.currentRoom || this.isFrozen) return;
    const myPlayer = this.currentRoom.state?.players?.get(this.currentRoom.sessionId);
    if (!myPlayer || myPlayer.role !== 'butcher' || myPlayer.isStunned) return;

    this.currentRoom.send(NETWORK_MESSAGES.USE_BUTCHER_ABILITY, { ability: 'snare' });
    soundFx.playSnareSnap();
  }

  private getNearestDownedAlly(myPlayer: any): any | null {
    let nearest: any = null;
    let minDist = 75;

    if (this.isOfflineMode) {
      for (const [id, bot] of this.localBots.entries()) {
        if (bot.isDowned && bot.role !== 'butcher') {
          const dist = Math.hypot(bot.x - myPlayer.x, bot.y - myPlayer.y);
          if (dist <= minDist) {
            minDist = dist;
            nearest = bot;
          }
        }
      }
      return nearest;
    }

    if (!this.currentRoom?.state?.players) return null;

    this.currentRoom.state.players.forEach((other: any) => {
      if (other.sessionId !== myPlayer.sessionId && other.isDowned && other.role !== 'butcher') {
        const dist = Math.hypot(other.x - myPlayer.x, other.y - myPlayer.y);
        if (dist <= minDist) {
          minDist = dist;
          nearest = other;
        }
      }
    });
    return nearest;
  }

  private async connectColyseus() {
    try {
      const activePlayer = getCachedActivePlayer();
      const room = await colyseusNetwork.joinFarmRoom({
        username: activePlayer.username,
        profileId: activePlayer.user_id,
      });
      this.currentRoom = room;

      // Handle server announcements
      room.onMessage(NETWORK_MESSAGES.ANNOUNCEMENT, (msg: any) => {
        this.showAnnouncement(msg.text || '');
      });

      // Handle Mark Changed event (Screen flash + sound)
      room.onMessage(NETWORK_MESSAGES.MARK_CHANGED, (msg: any) => {
        if (msg.sessionId === room.sessionId) {
          const increased = msg.delta > 0;
          soundFx.playMarkSound(increased);
          // Camera screen flash (Crimson if increased, Emerald if decreased)
          this.cameras.main.flash(400, increased ? 220 : 34, increased ? 38 : 197, increased ? 38 : 94);
        }
      });

      // Handle Transformation Event (Phases 4-5 core sequence)
      room.onMessage(NETWORK_MESSAGES.TRANSFORMATION, (msg: any) => {
        this.executeTransformationSequence(msg);
      });

      // Handle Vengeance Log for Butcher
      room.onMessage(NETWORK_MESSAGES.VENGEANCE_LOG, (msg: any) => {
        this.localVengeanceLog = msg.vengeanceList || [];
        this.updateVengeancePanel();
      });

      // Handle Player Downed event
      room.onMessage(NETWORK_MESSAGES.PLAYER_DOWNED, (msg: any) => {
        soundFx.playCleaverSlash();
        this.showAnnouncement(`💀 ${msg.victimUsername} was struck down by the Butcher!`, '#ef4444');
      });

      // Handle Round Ended (Victory/Defeat summary & Leaderboard update)
      room.onMessage(NETWORK_MESSAGES.ROUND_ENDED, (msg: any) => {
        window.dispatchEvent(new CustomEvent('SET_MATCH_ACTIVE', { detail: { active: false } }));
        const isAnimalsWin = msg.winner === 'animals';
        this.showAnnouncement(
          isAnimalsWin ? '🏆 SURVIVORS ESCAPED! PREY VICTORY!' : '🩸 THE BUTCHER SLAUGHTERED ALL PREY!',
          isAnimalsWin ? '#22c55e' : '#ef4444'
        );

        // Find local player in match summary
        const mySummary = msg?.summary?.players?.find(
          (p: any) => p.profileId === room.sessionId
        );
        if (mySummary) {
          recordPersonalMatch(
            mySummary.score || 0,
            mySummary.kills || 0,
            0,
            Boolean(mySummary.survived),
            msg?.summary?.roundDuration || 240
          );
        }

        // Automatically open Leaderboards after 2.5s
        setTimeout(() => {
          leaderboardModal.open('all-time');
        }, 2500);
      });

      // Synchronize player, trap, and hound additions & updates
      const syncFromState = (state: any) => {
        if (!state) return;

        // Players sync
        if (state.players) {
          const currentSessions = new Set<string>();
          state.players.forEach((serverPlayer: any, sessionId: string) => {
            currentSessions.add(sessionId);
            if (!this.players.has(sessionId)) {
              this.addPlayerVisual(serverPlayer, sessionId);
            }
          });

          // Clean up disconnected players
          for (const [sessionId, visual] of this.players.entries()) {
            if (!currentSessions.has(sessionId)) {
              visual.container.destroy();
              this.players.delete(sessionId);
            }
          }
        }

        // Traps sync
        if (state.traps) {
          const currentTraps = new Set<string>();
          state.traps.forEach((trap: any, trapId: string) => {
            currentTraps.add(trapId);
            if (!this.traps.has(trapId)) {
              const trapImg = this.add.image(trap.x, trap.y, 'trap_snare').setDepth(50);
              this.traps.set(trapId, trapImg);
            }
          });
          for (const [trapId, img] of this.traps.entries()) {
            if (!currentTraps.has(trapId)) {
              img.destroy();
              this.traps.delete(trapId);
            }
          }
        }

        // Hounds sync
        if (state.hounds) {
          const currentHounds = new Set<string>();
          state.hounds.forEach((hound: any, houndId: string) => {
            currentHounds.add(houndId);
            if (!this.hounds.has(houndId)) {
              const houndImg = this.add.image(hound.x, hound.y, 'hound_sprite').setDepth(60);
              this.hounds.set(houndId, houndImg);
            }
          });
          for (const [houndId, img] of this.hounds.entries()) {
            if (!currentHounds.has(houndId)) {
              img.destroy();
              this.hounds.delete(houndId);
            }
          }
        }
      };

      room.onStateChange((state: any) => {
        syncFromState(state);
        if (state?.phase === 'in-round') {
          window.dispatchEvent(new CustomEvent('SET_MATCH_ACTIVE', { detail: { active: true } }));
        } else if (state?.phase === 'lobby' || state?.phase === 'ended') {
          window.dispatchEvent(new CustomEvent('SET_MATCH_ACTIVE', { detail: { active: false } }));
        }
      });

      if (room.state) {
        syncFromState(room.state);
      }

      this.showAnnouncement('⚔️ Connected to Live Farm Server!', '#22c55e');
    } catch (err) {
      console.warn('[GameScene] Live server unreachable, starting Solo Practice Mode:', err);
      this.initLocalMode();
    }
  }

  private executeTransformationSequence(msg: any) {
    soundFx.playTransformationSound();

    // 1. Freeze all players for 1s
    this.isFrozen = true;
    setTimeout(() => {
      this.isFrozen = false;
    }, 1000);

    // 2. Screen desaturates 0.5s via fade overlay
    const desatOverlay = this.add.rectangle(
      window.innerWidth / 2,
      window.innerHeight / 2,
      window.innerWidth * 2,
      window.innerHeight * 2,
      0x000000,
      0.65
    ).setScrollFactor(0).setDepth(290);

    this.tweens.add({
      targets: desatOverlay,
      alpha: 0,
      duration: 500,
      onComplete: () => desatOverlay.destroy(),
    });

    const isLocalButcher = msg.butcherSessionId === this.currentRoom?.sessionId;

    if (isLocalButcher) {
      // Screen flashes red
      this.cameras.main.flash(800, 220, 38, 38);
      // Whisper text overlay
      this.whisperText.setText("The butcher's blade finds you.");
      this.whisperText.setAlpha(1);
      this.tweens.add({
        targets: this.whisperText,
        alpha: 0,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 2500,
        delay: 500,
      });
    } else {
      // Red ping ripple at transformation location
      const ping = this.add.circle(msg.x, msg.y, 20, 0xef4444, 0.6);
      ping.setStrokeStyle(4, 0xffffff);
      this.tweens.add({
        targets: ping,
        radius: 180,
        alpha: 0,
        duration: 1500,
        ease: 'Cubic.easeOut',
        onComplete: () => ping.destroy(),
      });
    }

    // Morph sprite of the Butcher over 1.5s
    const butcherVisual = this.players.get(msg.butcherSessionId);
    if (butcherVisual) {
      butcherVisual.sprite.setTexture('sprite_butcher');
      butcherVisual.roleTag.setText('[BUTCHER]').setColor('#ef4444');
      this.tweens.add({
        targets: butcherVisual.container,
        scaleX: 1.35,
        scaleY: 1.35,
        duration: 750,
        yoyo: true,
      });
    }
  }

  private updateVengeancePanel() {
    if (this.localVengeanceLog.length === 0) {
      this.vengeancePanelText.setAlpha(0);
      return;
    }
    const lines = [
      '🩸 VENGEANCE LIST (+25 BONUS)',
      '━━━━━━━━━━━━━━━━━━━━━━',
      ...this.localVengeanceLog.map((v) => `• ${v.targetUsername} (${v.reason})`),
    ];
    this.vengeancePanelText.setText(lines);
    this.vengeancePanelText.setAlpha(1);
  }

  private addPlayerVisual(player: any, sessionId: string) {
    if (this.players.has(sessionId)) return;

    const isLocal = sessionId === (this.currentRoom?.sessionId || 'local_player');
    const container = this.add.container(player.x, player.y);
    container.setDepth(isLocal ? 120 : 100);

    const spriteKey = player.role === 'butcher' ? 'sprite_butcher' : `sprite_${player.animal || 'pig'}`;
    const sprite = this.add.image(0, 0, spriteKey);

    const emoji = ANIMAL_EMOJIS[player.animal as AnimalType] || '🐾';
    const nameTag = this.add.text(0, -32, `${emoji} ${player.username}`, {
      fontSize: '11px',
      color: player.isBot ? '#cbd5e1' : '#fef08a',
      backgroundColor: '#00000099',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5);

    const roleTag = this.add.text(0, -18, `[${player.role.toUpperCase()}]`, {
      fontSize: '9px',
      color: player.role === 'butcher' ? '#ef4444' : '#4ade80',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const markBadge = this.add.text(0, 24, 'MARK: CLEAN', {
      fontSize: '9px',
      color: '#22c55e',
      backgroundColor: '#000000bb',
      padding: { x: 3, y: 1 },
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const statusBadge = this.add.text(0, 38, '', {
      fontSize: '9px',
      color: '#ef4444',
      backgroundColor: '#000000dd',
      padding: { x: 4, y: 1 },
      fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0);

    const hpBar = this.add.graphics();
    this.renderHpBar(hpBar, player.hp, player.maxHp);

    container.add([sprite, nameTag, roleTag, markBadge, statusBadge, hpBar]);

    const visual: VisualPlayer = {
      container,
      sprite,
      nameTag,
      roleTag,
      markBadge,
      statusBadge,
      hpBar,
      targetX: player.x,
      targetY: player.y,
      animal: player.animal,
      isBot: Boolean(player.isBot),
      role: player.role,
    };

    this.players.set(sessionId, visual);

    if (isLocal) {
      this.cameras.main.startFollow(container, true, 0.1, 0.1);
      this.cameras.main.setZoom(1.2);
    }
  }

  private initLocalMode() {
    this.isOfflineMode = true;
    this.localButcherId = null;
    const activePlayer = getCachedActivePlayer();
    const chosenAnimal = (activePlayer.last_animal || 'pig') as AnimalType;

    // Clean up existing player visuals to prevent ghost duplicates
    this.players.forEach((vis) => {
      vis.container.destroy();
    });
    this.players.clear();

    this.localPlayer = {
      id: 'local_player',
      sessionId: 'local_player',
      username: activePlayer.username || 'You',
      animal: chosenAnimal,
      role: 'prey',
      x: 1280,
      y: 1200,
      hp: 1,
      maxHp: 1,
      speed: 195,
      mark: 0,
      markTier: 'clean',
      isDowned: false,
      isStealthed: false,
      isStunned: false,
      isBot: false,
      hasRerolled: false,
      score: 0,
      kills: 0,
      primaryCdExpiresAt: 0,
      betrayalCdExpiresAt: 0,
      utilityCdExpiresAt: 0,
      specialCdExpiresAt: 0,
      buffExpiresAt: 0,
    };

    this.addPlayerVisual(this.localPlayer, 'local_player');

    // Add 5 Local Bot Animals
    const botConfigs = [
      { id: 'bot_1', username: 'Barnaby', animal: 'chicken' as AnimalType, x: 1100, y: 1150 },
      { id: 'bot_2', username: 'Daisy', animal: 'cow' as AnimalType, x: 1450, y: 1250 },
      { id: 'bot_3', username: 'Billy', animal: 'goat' as AnimalType, x: 1180, y: 1400 },
      { id: 'bot_4', username: 'Wooly', animal: 'sheep' as AnimalType, x: 1400, y: 1100 },
      { id: 'bot_5', username: 'Quackers', animal: 'duck' as AnimalType, x: 480, y: 750 },
    ];

    this.localBots = new Map();
    for (const b of botConfigs) {
      const botObj = {
        ...b,
        sessionId: b.id,
        role: 'prey',
        hp: 1,
        maxHp: 1,
        speed: 175,
        mark: 0,
        markTier: 'clean',
        isDowned: false,
        isStealthed: false,
        isStunned: false,
        isBot: true,
        score: 0,
        kills: 0,
        targetX: b.x,
        targetY: b.y,
        nextMoveTime: 0,
      };
      this.localBots.set(b.id, botObj);
      this.addPlayerVisual(botObj, b.id);
    }

    this.localPhase = 'in-round';
    this.localPhaseTimer = 120;
    window.dispatchEvent(new CustomEvent('SET_MATCH_ACTIVE', { detail: { active: true } }));
    this.showAnnouncement('🎮 Solo Practice Mode Active — Use on-screen controls or WASD to survive!', '#38bdf8');
  }

  private triggerLocalTransformation() {
    if (this.localButcherId) return;

    // Pick a bot or local player based on mark or random
    const candidates = ['bot_1', 'bot_2', 'bot_3', 'bot_4', 'bot_5'];
    const chosenButcherId = candidates[Phaser.Math.Between(0, candidates.length - 1)];
    this.localButcherId = chosenButcherId;

    const butcherBot = this.localBots.get(chosenButcherId);
    if (butcherBot) {
      butcherBot.role = 'butcher';
      butcherBot.hp = 3;
      butcherBot.maxHp = 3;
      butcherBot.speed = 225;
    }

    this.executeTransformationSequence({
      butcherSessionId: chosenButcherId,
      x: butcherBot ? butcherBot.x : 1280,
      y: butcherBot ? butcherBot.y : 1200,
    });

    this.showAnnouncement('🩸 AN ANIMAL TRANSFORMED INTO THE BUTCHER! RUN!', '#ef4444');
  }

  private handleLocalQKey() {
    if (!this.localPlayer || this.isFrozen || this.localPlayer.isDowned || this.localPlayer.isStunned) return;
    const now = Date.now();
    if (this.localPlayer.primaryCdExpiresAt > now) return;

    if (this.localPlayer.role === 'butcher') {
      this.localPlayer.primaryCdExpiresAt = now + 4000;
      soundFx.playCleaverSlash();
      // Hit any prey within 85px
      for (const [id, bot] of this.localBots.entries()) {
        if (!bot.isDowned && Math.hypot(bot.x - this.localPlayer.x, bot.y - this.localPlayer.y) <= 85) {
          bot.isDowned = true;
          bot.hp = 0;
          this.localPlayer.kills += 1;
          this.localPlayer.score += 50;
          this.showAnnouncement(`💀 You struck down ${bot.username}!`, '#ef4444');
        }
      }
    } else {
      const kit = ANIMAL_ABILITIES[this.localPlayer.animal as AnimalType];
      const cd = kit?.primary.cooldownMs ?? 8000;
      this.localPlayer.primaryCdExpiresAt = now + cd;
      this.localPlayer.buffExpiresAt = now + 2500;
      soundFx.playDashSound();
      this.showAnnouncement(`✨ Used ${kit?.primary.name || 'Dash Burst'}!`, '#38bdf8');
    }
  }

  private handleLocalEKey() {
    if (!this.localPlayer || this.isFrozen || this.localPlayer.isDowned || this.localPlayer.isStunned) return;
    const now = Date.now();

    // Check if near downed bot to revive
    const downedBot = this.getNearestDownedAlly(this.localPlayer);
    if (downedBot && this.localPlayer.role !== 'butcher') {
      downedBot.isDowned = false;
      downedBot.hp = downedBot.maxHp;
      this.localPlayer.score += 40;
      this.localPlayer.mark = Math.max(0, this.localPlayer.mark - 1);
      soundFx.playReviveSound();
      this.showAnnouncement(`💖 Revived ${downedBot.username}! (-1 Mark)`, '#22c55e');
      return;
    }

    // Check if near Sector 6 POIs (Crates, Relics, Altar, Terminal)
    if (this.trySectorInteraction(this.localPlayer.x, this.localPlayer.y)) {
      return;
    }

    if (this.localPlayer.betrayalCdExpiresAt > now) return;

    if (this.localPlayer.role === 'butcher') {
      this.localPlayer.betrayalCdExpiresAt = now + 12000;
      soundFx.playMarkSound(true);
      this.showAnnouncement('🏮 Lantern of the Damned revealed all prey!', '#f59e0b');
    } else {
      const kit = ANIMAL_ABILITIES[this.localPlayer.animal as AnimalType];
      const cd = kit?.betrayal.cooldownMs ?? 15000;
      this.localPlayer.betrayalCdExpiresAt = now + cd;
      this.localPlayer.mark += 1;
      this.localPlayer.score += 25;
      soundFx.playMarkSound(true);
      this.showAnnouncement(`🩸 Used Betrayal: ${kit?.betrayal.name} (+1 Mark)!`, '#f87171');
    }
  }

  private handleLocalSpaceKey() {
    if (!this.localPlayer || this.localPlayer.role !== 'butcher' || this.isFrozen) return;
    const now = Date.now();
    if (this.localPlayer.utilityCdExpiresAt > now) return;
    this.localPlayer.utilityCdExpiresAt = now + 10000;

    const trapId = `local_trap_${Date.now()}`;
    const trapImg = this.add.image(this.localPlayer.x, this.localPlayer.y, 'trap_snare').setDepth(50);
    this.traps.set(trapId, trapImg);
    soundFx.playSnareSnap();
    this.showAnnouncement('⚙️ Placed Rust Snare!', '#38bdf8');
  }

  private handleLocalFKey() {
    if (!this.localPlayer || this.localPlayer.role !== 'butcher' || this.isFrozen) return;
    const now = Date.now();
    if (this.localPlayer.specialCdExpiresAt > now) return;
    this.localPlayer.specialCdExpiresAt = now + 20000;

    const houndId = `local_hound_${Date.now()}`;
    const houndImg = this.add.image(this.localPlayer.x, this.localPlayer.y, 'hound_sprite').setDepth(60);
    this.hounds.set(houndId, houndImg);
    soundFx.playHoundBark();
    this.showAnnouncement('🐕 Unleashed Hunting Hound!', '#a855f7');
  }

  private updateLocalMode(time: number, delta: number) {
    if (!this.localPlayer) return;

    // Movement
    let dx = 0;
    let dy = 0;
    if (!this.isFrozen && !this.localPlayer.isDowned && !this.localPlayer.isStunned) {
      if (this.wasd?.left?.isDown || this.cursors?.left?.isDown) dx -= 1;
      if (this.wasd?.right?.isDown || this.cursors?.right?.isDown) dx += 1;
      if (this.wasd?.up?.isDown || this.cursors?.up?.isDown) dy -= 1;
      if (this.wasd?.down?.isDown || this.cursors?.down?.isDown) dy += 1;

      if (this.isMobileMoveActive) {
        dx += this.mobileMoveVector.dx;
        dy += this.mobileMoveVector.dy;
      }
    }

    const len = Math.hypot(dx, dy);
    let speed = this.localPlayer.speed;
    if (this.localPlayer.buffExpiresAt > Date.now()) speed *= 1.4;

    // Creek slow
    if (this.localPlayer.x >= 416 && this.localPlayer.x <= 512 && this.localPlayer.animal !== 'duck' && this.localPlayer.role !== 'butcher') {
      speed *= 0.6;
    }

    if (len > 0) {
      this.localPlayer.x += (dx / len) * speed * (delta / 1000);
      this.localPlayer.y += (dy / len) * speed * (delta / 1000);
      this.localPlayer.x = Phaser.Math.Clamp(this.localPlayer.x, 32, GAME_CONSTANTS.MAP_WIDTH - 32);
      this.localPlayer.y = Phaser.Math.Clamp(this.localPlayer.y, 32, GAME_CONSTANTS.MAP_HEIGHT - 32);

      // Juicy walk tilt & bobbing
      const walkBob = Math.sin(time * 0.016) * 3;
      const walkTilt = Math.sin(time * 0.016) * 6;
      const pVisual = this.players.get('local_player');
      if (pVisual) {
        pVisual.sprite.setY(walkBob);
        pVisual.sprite.setAngle(walkTilt);
      }

      // Intermittent movement dust
      if (Math.random() < 0.12) {
        this.spawnDustPuff(this.localPlayer.x, this.localPlayer.y + 14);
      }
    } else {
      const pVisual = this.players.get('local_player');
      if (pVisual) {
        pVisual.sprite.setY(0);
        pVisual.sprite.setAngle(0);
      }
    }

    // Update player visual
    const pVisual = this.players.get('local_player');
    if (pVisual) {
      pVisual.container.x = this.localPlayer.x;
      pVisual.container.y = this.localPlayer.y;
      this.renderHpBar(pVisual.hpBar, this.localPlayer.hp, this.localPlayer.maxHp);
      pVisual.markBadge.setText(`MARK: ${this.localPlayer.mark}`);
      pVisual.container.setAlpha(this.isCamouflaged ? 0.45 : 1);
    }

    // Update Sector 6 environmental systems
    this.weatherSystem.update(delta / 1000, this.localPlayer.x, this.localPlayer.y);
    this.checkSectorProximities(this.localPlayer.x, this.localPlayer.y, delta / 1000);
    this.renderVisionVignette(this.localPlayer.x, this.localPlayer.y);

    // Second timer
    if (time - this.localLastSecondCheck > 1000) {
      this.localLastSecondCheck = time;
      if (this.localPhaseTimer > 0) {
        this.localPhaseTimer -= 1;
        if (this.localPhaseTimer <= 0 && this.localPhase === 'in-round') {
          this.localPhase = 'ended';
          window.dispatchEvent(new CustomEvent('SET_MATCH_ACTIVE', { detail: { active: false } }));
          this.showAnnouncement('🌾 SOLO SURVIVAL COMPLETE! YOU SURVIVED THE SHIFT!', '#22c55e');
        }
      }
      if (this.localPhaseTimer <= 60 && !this.localButcherId) {
        this.triggerLocalTransformation();
      }
    }

    // Bots logic
    for (const [botId, bot] of this.localBots.entries()) {
      const bVisual = this.players.get(botId);
      if (!bVisual) continue;

      if (!bot.isDowned && !bot.isStunned) {
        if (bot.role === 'butcher') {
          // Hunt nearest prey
          let huntTarget: { x: number; y: number; id: string } | null = null;
          let minDist = 9999;
          if (!this.localPlayer.isDowned) {
            const dist = Math.hypot(this.localPlayer.x - bot.x, this.localPlayer.y - bot.y);
            huntTarget = { x: this.localPlayer.x, y: this.localPlayer.y, id: 'local_player' };
            minDist = dist;
          }
          for (const [otherId, otherBot] of this.localBots.entries()) {
            if (otherId !== botId && !otherBot.isDowned) {
              const d = Math.hypot(otherBot.x - bot.x, otherBot.y - bot.y);
              if (d < minDist) {
                minDist = d;
                huntTarget = { x: otherBot.x, y: otherBot.y, id: otherId };
              }
            }
          }

          if (huntTarget) {
            const tdx = huntTarget.x - bot.x;
            const tdy = huntTarget.y - bot.y;
            const tDist = Math.hypot(tdx, tdy);
            if (tDist > 40) {
              bot.x += (tdx / tDist) * bot.speed * (delta / 1000);
              bot.y += (tdy / tDist) * bot.speed * (delta / 1000);
            } else if (tDist <= 45) {
              // Butcher strikes target
              if (huntTarget.id === 'local_player' && !this.localPlayer.isDowned) {
                this.localPlayer.isDowned = true;
                this.localPlayer.hp = 0;
                soundFx.playCleaverSlash();
                this.cameras.main.flash(500, 220, 38, 38);
                this.shakeCamera(280, 0.024);
                this.spawnBloodSplatter(this.localPlayer.x, this.localPlayer.y);
                this.spawnFloatingText(this.localPlayer.x, this.localPlayer.y, '🩸 CLEAVER STRIKE!', '#ef4444', '15px');
                this.showAnnouncement('💀 You were struck down by the Butcher!', '#ef4444');
                const vis = this.players.get('local_player');
                if (vis) {
                  vis.ragdollActive = true;
                  vis.ragdollVx = (this.localPlayer.x - bot.x) * 4.5;
                  vis.ragdollVy = (this.localPlayer.y - bot.y) * 4.5;
                  vis.ragdollRotSpeed = 16;
                }
                this.lastDramaticEvent = 'Butcher Struck You Down';
              } else {
                const targetBot = this.localBots.get(huntTarget.id);
                if (targetBot && !targetBot.isDowned) {
                  targetBot.isDowned = true;
                  targetBot.hp = 0;
                  soundFx.playCleaverSlash();
                  this.shakeCamera(200, 0.016);
                  this.spawnBloodSplatter(targetBot.x, targetBot.y);
                  this.spawnFloatingText(targetBot.x, targetBot.y, '🩸 CLEAVER STRIKE!', '#ef4444', '15px');
                  this.showAnnouncement(`💀 ${targetBot.username} was struck down!`, '#ef4444');
                  const vis = this.players.get(huntTarget.id);
                  if (vis) {
                    vis.ragdollActive = true;
                    vis.ragdollVx = (targetBot.x - bot.x) * 4.5;
                    vis.ragdollVy = (targetBot.y - bot.y) * 4.5;
                    vis.ragdollRotSpeed = 16;
                  }
                  this.lastDramaticEvent = `Butcher Struck ${targetBot.username}`;
                }
              }
            } else if (tDist > 45 && tDist <= 110 && huntTarget.id === 'local_player' && !this.localPlayer.isDowned) {
              if (Math.random() < 0.04) {
                this.checkNearMissSlowMo(bot.x, bot.y);
              }
            }
          }
        } else {
          // Regular prey bot wandering
          if (Math.random() < 0.002) {
            const ev = this.voiceComms.makeSpeciesCall(
              botId,
              bot.username,
              bot.animal,
              bot.x,
              bot.y,
              this.weatherSystem?.currentWeather === 'acid_rain' || this.weatherSystem?.currentWeather === 'toxic_fog'
            );
            if (ev) {
              this.broadcastSpeciesSound(ev);
            }
          }
          if (time > bot.nextMoveTime) {
            bot.nextMoveTime = time + Phaser.Math.Between(2000, 4500);
            bot.targetX = Phaser.Math.Clamp(bot.x + Phaser.Math.Between(-140, 140), 64, GAME_CONSTANTS.MAP_WIDTH - 64);
            bot.targetY = Phaser.Math.Clamp(bot.y + Phaser.Math.Between(-140, 140), 64, GAME_CONSTANTS.MAP_HEIGHT - 64);
          }
          const bdx = bot.targetX - bot.x;
          const bdy = bot.targetY - bot.y;
          const bDist = Math.hypot(bdx, bdy);
          if (bDist > 8) {
            bot.x += (bdx / bDist) * bot.speed * 0.55 * (delta / 1000);
            bot.y += (bdy / bDist) * bot.speed * 0.55 * (delta / 1000);
          }
        }
      }

      bVisual.container.x = bot.x;
      bVisual.container.y = bot.y;
      this.renderHpBar(bVisual.hpBar, bot.hp, bot.maxHp);

      if (bot.isDowned) {
        bVisual.statusBadge.setText('DOWNED').setColor('#ef4444').setAlpha(1);
        bVisual.container.setAngle(90);
      } else {
        bVisual.statusBadge.setAlpha(0);
        bVisual.container.setAngle(0);
      }
    }
  }

  private renderHpBar(graphics: Phaser.GameObjects.Graphics, hp: number, maxHp: number) {
    graphics.clear();
    const w = 24;
    const h = 4;
    graphics.fillStyle(0x000000, 0.7);
    graphics.fillRect(-w / 2, 14, w, h);

    const healthPct = Math.max(0, Math.min(1, hp / (maxHp || 1)));
    graphics.fillStyle(hp > 1 ? 0xf59e0b : 0x22c55e, 1);
    graphics.fillRect(-w / 2, 14, w * healthPct, h);
  }

  private updateCommsAndEngagement(time: number, delta: number) {
    const dtSec = delta / 1000;
    // 1. Voice Comms Engine update
    this.voiceComms.update(dtSec);

    // 2. Silence of Suspicion Tracker text
    const silenceSecs = Math.max(0, Math.ceil(this.voiceComms.getSilenceTimerRemaining()));
    const isMuted = this.voiceComms.getIsMuted();
    this.silenceTrackerText.setText(`🤫 SILENCE: ${silenceSecs}s ${isMuted ? '[MUTED]' : '[V: SPEAK]'}`);
    if (silenceSecs <= 5) {
      this.silenceTrackerText.setColor('#ef4444');
      this.silenceTrackerText.setScale(1 + Math.sin(time * 0.01) * 0.06);
    } else if (silenceSecs <= 12) {
      this.silenceTrackerText.setColor('#facc15');
      this.silenceTrackerText.setScale(1);
    } else {
      this.silenceTrackerText.setColor('#22c55e');
      this.silenceTrackerText.setScale(1);
    }

    // 3. 4-Minute Round Micro-Narrative Act
    const timeRemaining = this.isOfflineMode ? this.localPhaseTimer : (this.currentRoom?.state?.phaseTimeRemaining ?? 240);
    const elapsedSecs = Math.max(0, 240 - timeRemaining);
    const actInfo = engagementEngine.getRoundNarrativeAct(elapsedSecs);
    this.narrativeActText.setText(`ACT ${actInfo.actNumber}: ${actInfo.actName.toUpperCase()} — ${actInfo.subtitle}`);
    this.narrativeActText.setColor(actInfo.atmosphereColor);

    // 4. Paranoia Mark 5-Phase Vignette
    const markVal = this.isOfflineMode
      ? (this.localPlayer?.mark ?? 0)
      : (this.currentRoom?.state?.players?.get(this.currentRoom?.sessionId)?.mark ?? 0);
    this.updateParanoiaVignette(markVal);

    // 5. Ragdoll tumble physics for downed players
    this.players.forEach((vis) => {
      if (vis.ragdollActive && vis.ragdollVx !== undefined && vis.ragdollVy !== undefined) {
        vis.container.x += vis.ragdollVx * dtSec;
        vis.container.y += vis.ragdollVy * dtSec;
        vis.container.angle += (vis.ragdollRotSpeed ?? 12) * dtSec * 35;
        vis.ragdollVx *= 0.92;
        vis.ragdollVy *= 0.92;
        if (Math.hypot(vis.ragdollVx, vis.ragdollVy) < 6) {
          vis.ragdollActive = false;
          vis.container.setAngle(90);
        }
      }
    });

    // 6. Near-Miss Slow Mo camera punch
    if (Date.now() < this.nearMissSlowMoUntil) {
      this.cameras.main.setZoom(1.3);
    } else if (!this.isInstantReplayActive) {
      this.cameras.main.setZoom(1.2);
    }
  }

  update(time: number, delta: number) {
    this.updateCommsAndEngagement(time, delta);

    if (this.isOfflineMode) {
      this.updateLocalMode(time, delta);
      this.updateDebugAndHudText(time);
      return;
    }

    // 1. Movement Inputs
    let dx = 0;
    let dy = 0;

    if (!this.isFrozen) {
      if (this.wasd?.left?.isDown || this.cursors?.left?.isDown) dx -= 1;
      if (this.wasd?.right?.isDown || this.cursors?.right?.isDown) dx += 1;
      if (this.wasd?.up?.isDown || this.cursors?.up?.isDown) dy -= 1;
      if (this.wasd?.down?.isDown || this.cursors?.down?.isDown) dy += 1;

      if (this.isMobileMoveActive) {
        dx += this.mobileMoveVector.dx;
        dy += this.mobileMoveVector.dy;
      }
    }

    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    if (time - this.lastInputSend > 1000 / 60 && this.currentRoom) {
      this.lastInputSend = time;
      this.currentRoom.send(NETWORK_MESSAGES.PLAYER_INPUT, { dx, dy });
    }

    // 2. Interpolate Players & Update Mark Badges
    if (this.currentRoom && this.currentRoom.state?.players) {
      const isRevealingExactMarks = (this.currentRoom.state?.revealMarksUntil ?? 0) > Date.now();

      this.currentRoom.state.players.forEach((serverPlayer: any, sessionId: string) => {
        let visual = this.players.get(sessionId);
        if (!visual) {
          this.addPlayerVisual(serverPlayer, sessionId);
          visual = this.players.get(sessionId);
        }

        if (visual) {
          visual.container.x = Phaser.Math.Linear(visual.container.x, serverPlayer.x, 0.25);
          visual.container.y = Phaser.Math.Linear(visual.container.y, serverPlayer.y, 0.25);
          this.renderHpBar(visual.hpBar, serverPlayer.hp, serverPlayer.maxHp);

          // Update texture on role/animal change
          if (serverPlayer.role === 'butcher' && visual.role !== 'butcher') {
            visual.role = 'butcher';
            visual.sprite.setTexture('sprite_butcher');
            visual.roleTag.setText('[BUTCHER]').setColor('#ef4444');
          } else if (visual.animal !== serverPlayer.animal) {
            visual.animal = serverPlayer.animal;
            visual.sprite.setTexture(`sprite_${serverPlayer.animal}`);
            const emoji = ANIMAL_EMOJIS[serverPlayer.animal as AnimalType] || '🐾';
            visual.nameTag.setText(`${emoji} ${serverPlayer.username}`);
          }

          // Mark Display:
          // Local player always sees exact Mark. Others show tier UNLESS 50% reveal is active!
          const isLocal = sessionId === this.currentRoom.sessionId;
          const mark = serverPlayer.mark;
          const tier = serverPlayer.markTier || (mark <= 2 ? 'clean' : mark <= 5 ? 'tainted' : 'marked');

          if (isLocal || isRevealingExactMarks) {
            visual.markBadge.setText(`MARK: ${mark}`);
          } else {
            visual.markBadge.setText(tier.toUpperCase());
          }

          // Tier colors: Clean (green), Tainted (yellow), Marked (red)
          if (tier === 'clean') visual.markBadge.setColor('#22c55e');
          else if (tier === 'tainted') visual.markBadge.setColor('#facc15');
          else visual.markBadge.setColor('#ef4444');

          // Status Badge: Downed / Stunned / Stealthed
          if (serverPlayer.isDowned) {
            visual.statusBadge.setText('DOWNED').setColor('#ef4444').setAlpha(1);
            visual.container.setAngle(90);
          } else if (serverPlayer.isStunned) {
            visual.statusBadge.setText('STUNNED').setColor('#facc15').setAlpha(1);
            visual.container.setAngle(0);
          } else {
            visual.statusBadge.setAlpha(0);
            visual.container.setAngle(0);
          }

          // Stealth transparency
          visual.container.setAlpha(serverPlayer.isStealthed ? 0.35 : 1);
        }
      });

      // Update Hounds position
      if (this.currentRoom.state?.hounds) {
        this.currentRoom.state.hounds.forEach((serverHound: any, houndId: string) => {
          let houndImg = this.hounds.get(houndId);
          if (!houndImg) {
            houndImg = this.add.image(serverHound.x, serverHound.y, 'hound_sprite').setDepth(60);
            this.hounds.set(houndId, houndImg);
          }
          houndImg.x = Phaser.Math.Linear(houndImg.x, serverHound.x, 0.3);
          houndImg.y = Phaser.Math.Linear(houndImg.y, serverHound.y, 0.3);
        });
      }
    }

    // Update Sector 6 environmental systems for online mode
    let px = 1280;
    let py = 1280;
    if (this.currentRoom && this.currentRoom.state?.players) {
      const myPlayer = this.currentRoom.state.players.get(this.currentRoom.sessionId);
      if (myPlayer) {
        px = myPlayer.x;
        py = myPlayer.y;
        this.checkSectorProximities(myPlayer.x, myPlayer.y, delta / 1000);
        this.renderVisionVignette(myPlayer.x, myPlayer.y);
      }
    }
    this.weatherSystem.update(delta / 1000, px, py);

    // 3. Update HUD & Debug Info
    this.updateDebugAndHudText(time);
  }

  private updateDebugAndHudText(time: number) {
    const fps = Math.round(this.game.loop.actualFps);
    const now = Date.now();

    if (time - this.lastPingCheck > 2000) {
      this.lastPingCheck = time;
      this.pingMs = Math.round(18 + Math.random() * 8);
    }

    if (this.isOfflineMode) {
      const butcherText = this.localButcherId
        ? `• Butcher:     ${this.localBots.get(this.localButcherId)?.username || 'Active Bot'}`
        : `• Butcher:     Pending Transformation (${Math.max(0, this.localPhaseTimer - 60)}s)`;

      this.debugText.setText([
        `⚡ FARM FATALE (PRACTICE ENGINE)`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `• Mode:        Solo AI Simulation`,
        `• Client FPS:  ${fps} fps`,
        `• Players:     1 Human | 5 Bots (6/12)`,
        `• Phase:       IN-ROUND (${this.localPhaseTimer}s)`,
        butcherText,
        `• Press [B]:   Force Butcher Transformation`,
      ]);

      if (this.localPlayer) {
        this.myMarkBadgeText.setText(`YOUR MARK: ${this.localPlayer.mark}\n[${this.localPlayer.mark <= 2 ? 'CLEAN' : 'TAINTED'}]`);
        this.myMarkBadgeText.setColor(this.localPlayer.mark <= 2 ? '#22c55e' : '#ef4444');

        const downedAlly = this.getNearestDownedAlly(this.localPlayer);
        if (downedAlly && !this.localPlayer.isDowned) {
          this.revivePromptText.setText(`[E] PRESS TO REVIVE ${downedAlly.username} (-1 MARK, +40 PTS)`);
          this.revivePromptText.setAlpha(1);
        } else {
          this.revivePromptText.setAlpha(0);
        }

        const kit = ANIMAL_ABILITIES[this.localPlayer.animal as AnimalType];
        if (kit) {
          const pRemaining = Math.max(0, Math.ceil((this.localPlayer.primaryCdExpiresAt - now) / 1000));
          this.ability1Text.setText(`[Q] ${kit.primary.name}\n${pRemaining > 0 ? `${pRemaining}s CD` : 'READY'}`);
          this.ability1Text.setColor(pRemaining > 0 ? '#64748b' : '#38bdf8');

          const bRemaining = Math.max(0, Math.ceil((this.localPlayer.betrayalCdExpiresAt - now) / 1000));
          this.ability2Text.setText(`[E] ${kit.betrayal.name}\n${bRemaining > 0 ? `${bRemaining}s CD` : 'READY (+1 MARK)'}`);
          this.ability2Text.setColor(bRemaining > 0 ? '#64748b' : '#f87171');

          if (this.localPlayer.role === 'butcher') {
            const sRemaining = Math.max(0, Math.ceil((this.localPlayer.utilityCdExpiresAt - now) / 1000));
            this.ability3Text.setText(`[SPACE] Rust Snare\n${sRemaining > 0 ? `${sRemaining}s CD` : 'READY'}`);
            this.ability3Text.setColor(sRemaining > 0 ? '#64748b' : '#38bdf8');

            const wRemaining = Math.max(0, Math.ceil((this.localPlayer.specialCdExpiresAt - now) / 1000));
            this.ability4Text.setText(`[F] Hound Whistle\n${wRemaining > 0 ? `${wRemaining}s CD` : 'READY'}`);
            this.ability4Text.setColor(wRemaining > 0 ? '#64748b' : '#a855f7');
          } else {
            this.ability3Text.setText('[SPACE] Dash\nREADY');
            this.ability3Text.setColor('#38bdf8');

            this.ability4Text.setText('ROLE: PREY\nSURVIVE');
            this.ability4Text.setColor('#4ade80');
          }
        }

        if (this.localPhaseTimer > 120 && !this.localButcherId) {
          this.roundTimerText.setText(`TIME TO TRANSFORMATION: ${this.localPhaseTimer - 120}s (ROUND TIME: ${this.localPhaseTimer}s)`);
          this.roundTimerText.setColor('#facc15');
        } else {
          this.roundTimerText.setText(`ROUND TIME REMAINING: ${this.localPhaseTimer}s — SURVIVE!`);
          this.roundTimerText.setColor(this.localPhaseTimer > 30 ? '#facc15' : '#ef4444');
        }
      }
      return;
    }

    const state = this.currentRoom?.state;
    const humanCount = state?.humanPlayersCount ?? 1;
    const botCount = state?.botPlayersCount ?? 0;
    const phase = state?.phase ?? 'lobby';
    const timeRemaining = state?.phaseTimeRemaining ?? 240;

    const butcherText = state?.butcherSessionId
      ? `• Butcher:     ${state?.players?.get(state.butcherSessionId)?.username ?? 'Active'}`
      : `• Butcher:     Unassigned (Transforms at 120s)`;

    this.debugText.setText([
      `⚡ FARM FATALE ASYMMETRIC ENGINE`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `• Ping:        ${this.pingMs} ms`,
      `• Tick Rate:   60Hz Sim / 20Hz Broadcast`,
      `• Client FPS:  ${fps} fps`,
      `• Players:     ${humanCount} Humans | ${botCount} Bots (${humanCount + botCount}/12)`,
      `• Phase:       ${phase.toUpperCase()} (${timeRemaining}s)`,
      butcherText,
      `• Altar:       ${state?.altar?.sacrificesCount ?? 0}/${state?.altar?.demand ?? 1} Sacrifices`,
    ]);

    const myPlayer = this.currentRoom ? state?.players?.get(this.currentRoom.sessionId) : null;

    if (myPlayer) {
      // 1. My Mark Badge Display
      const markVal = myPlayer.mark;
      const markTier = myPlayer.markTier.toUpperCase();
      this.myMarkBadgeText.setText(`YOUR MARK: ${markVal}\n[${markTier}]`);
      if (myPlayer.markTier === 'clean') this.myMarkBadgeText.setColor('#22c55e');
      else if (myPlayer.markTier === 'tainted') this.myMarkBadgeText.setColor('#facc15');
      else this.myMarkBadgeText.setColor('#ef4444');

      // 2. Check if near downed ally to show Revive Prompt
      if (myPlayer.role !== 'butcher' && !myPlayer.isDowned) {
        const downedAlly = this.getNearestDownedAlly(myPlayer);
        if (downedAlly) {
          this.revivePromptText.setText(`[E] HOLD TO REVIVE ${downedAlly.username} (-1 MARK, +40 PTS)`);
          this.revivePromptText.setAlpha(1);
        } else {
          this.revivePromptText.setAlpha(0);
        }
      } else {
        this.revivePromptText.setAlpha(0);
      }

      // 3. Ability Bar Layout (Butcher vs Animal)
      if (myPlayer.role === 'butcher') {
        // Cleaver
        const cRemaining = Math.max(0, Math.ceil((myPlayer.primaryCdExpiresAt - now) / 1000));
        this.ability1Text.setText(`[Q] Cleaver Swing\n${cRemaining > 0 ? `${cRemaining}s CD` : 'READY (1-HIT)'}`);
        this.ability1Text.setColor(cRemaining > 0 ? '#64748b' : '#ef4444');

        // Lantern
        const lRemaining = Math.max(0, Math.ceil((myPlayer.betrayalCdExpiresAt - now) / 1000));
        this.ability2Text.setText(`[E] Lantern of Damned\n${lRemaining > 0 ? `${lRemaining}s CD` : 'READY (REVEAL)'}`);
        this.ability2Text.setColor(lRemaining > 0 ? '#64748b' : '#f59e0b');

        // Snare
        const sRemaining = Math.max(0, Math.ceil((myPlayer.utilityCdExpiresAt - now) / 1000));
        this.ability3Text.setText(`[SPACE] Rust Snare\n${sRemaining > 0 ? `${sRemaining}s CD` : 'READY (TRAP)'}`);
        this.ability3Text.setColor(sRemaining > 0 ? '#64748b' : '#38bdf8');

        // Whistle
        const wRemaining = Math.max(0, Math.ceil((myPlayer.specialCdExpiresAt - now) / 1000));
        this.ability4Text.setText(`[F] Hound Whistle\n${wRemaining > 0 ? `${wRemaining}s CD` : 'READY (HOUND)'}`);
        this.ability4Text.setColor(wRemaining > 0 ? '#64748b' : '#a855f7');
      } else {
        const kit = ANIMAL_ABILITIES[myPlayer.animal as AnimalType];
        if (kit) {
          const pRemaining = Math.max(0, Math.ceil((myPlayer.primaryCdExpiresAt - now) / 1000));
          this.ability1Text.setText(`[Q] ${kit.primary.name}\n${pRemaining > 0 ? `${pRemaining}s CD` : 'READY'}`);
          this.ability1Text.setColor(pRemaining > 0 ? '#64748b' : '#38bdf8');

          const bRemaining = Math.max(0, Math.ceil((myPlayer.betrayalCdExpiresAt - now) / 1000));
          this.ability2Text.setText(`[E] ${kit.betrayal.name}\n${bRemaining > 0 ? `${bRemaining}s CD` : 'READY (+1 MARK)'}`);
          this.ability2Text.setColor(bRemaining > 0 ? '#64748b' : '#f87171');

          this.ability3Text.setText(`[R] Free Reroll\n${myPlayer.hasRerolled || phase !== 'lobby' ? 'LOCKED' : 'AVAILABLE'}`);
          this.ability3Text.setColor(myPlayer.hasRerolled || phase !== 'lobby' ? '#64748b' : '#facc15');

          this.ability4Text.setText('ROLE: PREY\nSURVIVE');
          this.ability4Text.setColor('#4ade80');
        }
      }

      // 4. Timer text
      if (phase === 'lobby') {
        const lobbyTime = state?.lobbyTimeRemaining ?? 30;
        this.roundTimerText.setText(`LOBBY: Waiting for 6+ players (${lobbyTime}s until AI fill)`);
      } else if (phase === 'countdown') {
        this.roundTimerText.setText(`ROUND STARTING IN ${timeRemaining}s... WATCH YOUR BACK!`);
        this.roundTimerText.setColor('#f59e0b');
      } else if (phase === 'in-round') {
        if (!state?.butcherSessionId) {
          this.roundTimerText.setText(`TIME TO TRANSFORMATION: ${timeRemaining - 120}s (ROUND TIME: ${timeRemaining}s)`);
          this.roundTimerText.setColor('#facc15');
        } else {
          this.roundTimerText.setText(`ROUND TIME REMAINING: ${timeRemaining}s - SURVIVE!`);
          this.roundTimerText.setColor('#ef4444');
        }
      } else {
        this.roundTimerText.setText(`ROUND CONCLUDED`);
        this.roundTimerText.setColor('#a8a29e');
      }
    }

    // Update Mode Tracker
    const mode = GAME_MODES[this.activeGameMode] || GAME_MODES.classic;
    let modeStatus = '';
    if (this.activeGameMode === 'lockdown_escape') {
      modeStatus = `Terminals: ${this.repairedTerminalsCount}/3 | Gate: ${this.blastGateUnlocked ? 'UNLOCKED' : 'SEALED'}`;
    } else if (this.activeGameMode === 'altar_overdrive') {
      modeStatus = `Bio-Cores: ${this.depositedRelicsCount}/4 Deposited`;
    } else if (this.activeGameMode === 'blood_fog') {
      modeStatus = 'Zero Visibility Miasma';
    } else if (this.activeGameMode === 'contagion') {
      modeStatus = 'Downed Animals Rise as Thralls';
    } else {
      modeStatus = this.isCamouflaged ? 'CLOAKED IN BRAMBLES' : 'Objective: Survive & Outsmart';
    }
    this.modeTrackerText.setText(`MODE: ${mode.name.toUpperCase()}\n[${modeStatus}]`);

    // Update Weather Tracker with Full Visual Loop Timeline
    if (this.weatherSystem) {
      const loopStatus = this.weatherSystem.getLoopStatus();
      const loopIcons: Record<WeatherType, string> = {
        twilight: '🌒',
        acid_rain: '🌧️',
        toxic_fog: '🌫️',
        gale_storm: '💨',
        blood_moon: '🩸',
      };
      const loopLine = loopStatus.loop
        .map((t) => (t === loopStatus.currentWeather ? `【${loopIcons[t]}】` : loopIcons[t]))
        .join(' ➔ ');
      this.weatherTrackerText.setText(
        `WEATHER LOOP: ${loopLine}\nACTIVE: ${loopStatus.currentDef.icon} ${loopStatus.currentDef.name.toUpperCase()} (${loopStatus.timeRemaining}s) | NEXT: ${loopStatus.nextDef.icon} ${loopStatus.nextDef.name}`
      );
    }

    // Update Consumable Slots HUD
    const slot1Name = this.slot1Consumable ? this.slot1Consumable.replace('_', ' ').toUpperCase() : 'EMPTY';
    const slot2Name = this.slot2Consumable ? this.slot2Consumable.replace('_', ' ').toUpperCase() : 'EMPTY';
    this.consumableSlotText
      .setText(`[1] ${slot1Name}\n[KEY 1]`)
      .setColor(this.slot1Consumable ? '#f59e0b' : '#64748b');
    this.consumableSlot2Text
      .setText(`[2] ${slot2Name}\n[KEY 2]`)
      .setColor(this.slot2Consumable ? '#38bdf8' : '#64748b');

    // Update Low Health Heartbeat Vignette
    let currentHp = 100;
    if (this.isOfflineMode && this.localPlayer) {
      currentHp = this.localPlayer.hp;
    } else if (this.currentRoom) {
      const p = this.currentRoom.state?.players?.get(this.currentRoom.sessionId);
      if (p) currentHp = p.hp;
    }

    if (currentHp <= 35 && currentHp > 0) {
      const heartbeatFreq = currentHp <= 15 ? 0.012 : 0.007;
      const pulse = (Math.sin(this.time.now * heartbeatFreq) + 1) * 0.18;
      this.heartbeatOverlay.setAlpha(0.12 + pulse);
    } else {
      this.heartbeatOverlay.setAlpha(0);
    }

    // Update Active Hydraulic Gates Timer
    for (const gate of this.hydraulicGates) {
      if (gate.isClosed && now >= gate.closedUntil) {
        gate.isClosed = false;
        gate.gateSprite.setAlpha(0.25).setTint(0xffffff);
        gate.leverLabel.setText('🕹️ LEVER [E]').setColor('#22c55e');
      }
    }

    // Respawn Popped Spore Bloom Pods
    for (const pod of this.sporePods) {
      if (pod.popped && now >= pod.respawnAt) {
        pod.popped = false;
        pod.sprite.setAlpha(1);
        this.spawnSporeBurst(pod.x, pod.y);
      }
    }

    // Check Active Shock Mines Detonation
    this.checkShockMines();
  }

  private toggleGameModeModal() {
    const curWeather = this.weatherSystem ? this.weatherSystem.currentWeather : 'twilight';
    gameModeModal.open(
      this.activeGameMode,
      curWeather,
      (modeId) => this.setGameMode(modeId),
      (weatherType) => this.weatherSystem.setWeather(weatherType)
    );
  }

  private setGameMode(modeId: GameModeId) {
    this.activeGameMode = modeId;
    const modeDef = GAME_MODES[modeId];
    this.showAnnouncement(`🎮 Mode Activated: ${modeDef.name.toUpperCase()}`, '#38bdf8');
    soundFx.playItemPickupSound();
  }

  private handleWeatherUpdate(def: IWeatherDef, isWarning: boolean) {
    if (isWarning) {
      this.showAnnouncement(`⚠️ WEATHER ALERT: ${def.name.toUpperCase()} IN 10s! PREPARE!`, '#f59e0b');
    } else {
      this.showAnnouncement(`${def.icon} WEATHER EVENT: ${def.name.toUpperCase()}!\n${def.effectSummary}`, '#38bdf8');
      if (def.id === 'blood_moon') {
        this.cameras.main.flash(450, 180, 20, 20);
        this.shakeCamera(300, 0.02);
      } else if (def.id === 'gale_storm') {
        this.cameras.main.flash(250, 56, 189, 248);
      }
    }
  }

  // --- Visual Feedback & Particle Juice Helpers ---
  public spawnFloatingText(x: number, y: number, text: string, color: string = '#facc15', fontSize: string = '13px') {
    const fText = this.add.text(x, y - 10, text, {
      fontSize,
      color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(195);

    this.tweens.add({
      targets: fText,
      y: y - 48,
      scaleX: 1.15,
      scaleY: 1.15,
      alpha: 0,
      duration: 1000,
      ease: 'Cubic.easeOut',
      onComplete: () => fText.destroy(),
    });
  }

  public shakeCamera(duration: number = 200, intensity: number = 0.015) {
    this.cameras.main.shake(duration, intensity);
  }

  public spawnDustPuff(x: number, y: number) {
    const puff = this.add.image(x + Phaser.Math.Between(-6, 6), y + Phaser.Math.Between(-4, 4), 'fx_dust_puff');
    puff.setDepth(15).setScale(Phaser.Math.FloatBetween(0.8, 1.2)).setAlpha(0.5);
    this.tweens.add({
      targets: puff,
      y: puff.y - 12,
      alpha: 0,
      scale: 0.4,
      duration: 400,
      ease: 'Quad.easeOut',
      onComplete: () => puff.destroy(),
    });
  }

  public spawnBloodSplatter(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const b = this.add.image(x, y, 'fx_blood_splat');
      b.setDepth(16).setScale(Phaser.Math.FloatBetween(0.7, 1.3));
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(15, 45);
      this.tweens.add({
        targets: b,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0.3,
        duration: 600,
        onComplete: () => {
          this.time.delayedCall(4000, () => b.destroy());
        },
      });
    }
  }

  public spawnSparkBurst(x: number, y: number, count: number = 10) {
    for (let i = 0; i < count; i++) {
      const sp = this.add.image(x, y, 'fx_spark');
      sp.setDepth(30).setScale(Phaser.Math.FloatBetween(0.8, 1.4));
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(20, 60);
      this.tweens.add({
        targets: sp,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.3,
        duration: 350,
        ease: 'Quad.easeOut',
        onComplete: () => sp.destroy(),
      });
    }
  }

  public spawnShockwave(x: number, y: number, maxRadius: number = 240, colorTint: number = 0x38bdf8) {
    const ring = this.add.image(x, y, 'fx_shockwave_ring');
    ring.setDepth(28).setScale(0.2).setTint(colorTint).setAlpha(0.95);
    this.tweens.add({
      targets: ring,
      scale: maxRadius / 32,
      alpha: 0,
      duration: 550,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  public spawnSporeBurst(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const sp = this.add.image(x, y, 'fx_spore');
      sp.setDepth(25).setScale(Phaser.Math.FloatBetween(0.9, 1.5)).setAlpha(0.85);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(25, 75);
      this.tweens.add({
        targets: sp,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 900,
        ease: 'Sine.easeOut',
        onComplete: () => sp.destroy(),
      });
    }
  }

  // --- Consumable Management (Dual Slot Execution) ---
  private useActiveConsumable(slotNum: 1 | 2 = 1) {
    const item = slotNum === 1 ? this.slot1Consumable : this.slot2Consumable;
    if (!item) {
      this.showAnnouncement(`⚠️ Slot [${slotNum}] is empty! Loot yellow Supply Crates around Sector 6.`, '#e2e8f0');
      return;
    }

    if (slotNum === 1) this.slot1Consumable = null;
    else this.slot2Consumable = null;

    let px = 1280;
    let py = 1280;
    if (this.isOfflineMode && this.localPlayer) {
      px = this.localPlayer.x;
      py = this.localPlayer.y;
    } else if (this.currentRoom) {
      const p = this.currentRoom.state?.players?.get(this.currentRoom.sessionId);
      if (p) {
        px = p.x;
        py = p.y;
      }
    }

    soundFx.playItemPickupSound();

    switch (item) {
      case 'adrenaline': {
        if (this.isOfflineMode && this.localPlayer) {
          this.localPlayer.buffExpiresAt = Date.now() + 5500;
        }
        this.cameras.main.flash(300, 56, 189, 248);
        this.spawnFloatingText(px, py, '⚡ ADRENALINE SURGE (+65% SPD)!', '#38bdf8', '14px');
        this.showAnnouncement('⚡ ADRENALINE INJECTED! +65% Speed Burst for 5.5s!', '#38bdf8');
        break;
      }
      case 'smokebomb': {
        const cloud = this.add.image(px, py, 'tile_smoke_cloud').setScale(1.8).setDepth(45);
        this.smokeClouds.push({
          sprite: cloud,
          expiresAt: Date.now() + 7000,
          x: px,
          y: py,
        });
        this.tweens.add({
          targets: cloud,
          alpha: { from: 0.9, to: 0.3 },
          scaleX: 2.2,
          scaleY: 2.2,
          duration: 7000,
          onComplete: () => cloud.destroy(),
        });
        this.spawnFloatingText(px, py, '💨 SMOKE VEIL DEPLOYED!', '#94a3b8');
        this.showAnnouncement('💨 SMOKE BOMB DEPLOYED! Thick veil active for 7s!', '#94a3b8');
        break;
      }
      case 'saltward': {
        const ward = this.add.image(px, py, 'tile_salt_ring').setScale(1.4).setDepth(40);
        this.tweens.add({
          targets: ward,
          angle: 360,
          duration: 15000,
          repeat: -1,
        });
        this.time.delayedCall(15000, () => ward.destroy());
        this.spawnFloatingText(px, py, '🧂 PROTECTIVE WARD!', '#fef08a');
        this.showAnnouncement('🧂 PROTECTIVE SALT WARD INSCRIBED! Repels Hounds for 15s!', '#fef08a');
        break;
      }
      case 'flare': {
        this.radioScanExpiresAt = Date.now() + 12000;
        this.cameras.main.flash(500, 255, 230, 150);
        this.spawnFloatingText(px, py, '🔥 SECTOR FULLY ILLUMINATED!', '#f97316');
        this.showAnnouncement('🔥 SIGNAL FLARE FIRED! Sector 6 fully illuminated for 12s!', '#f97316');
        break;
      }
      case 'shock_mine': {
        const mineSprite = this.add.image(px, py, 'item_shock_mine').setScale(1.3).setDepth(24);
        this.shockMines.push({
          id: `mine_${Date.now()}`,
          x: px,
          y: py,
          sprite: mineSprite,
          ownerId: this.isOfflineMode ? 'local_player' : (this.currentRoom?.sessionId || ''),
        });
        this.spawnFloatingText(px, py, '⚡ SHOCK MINE ARMED!', '#38bdf8');
        this.showAnnouncement('⚡ SHOCK MINE PLACED! Detonates when Butcher or threat approaches!', '#38bdf8');
        break;
      }
      case 'decoy': {
        const decoySprite = this.add.image(px, py, 'item_decoy').setScale(1.3).setDepth(24);
        this.decoys.push({
          id: `decoy_${Date.now()}`,
          x: px,
          y: py,
          sprite: decoySprite,
          expiresAt: Date.now() + 10000,
        });
        soundFx.playDecoyActive();
        this.spawnFloatingText(px, py, '📻 DECOY BROADCASTING!', '#f59e0b');
        this.showAnnouncement('📻 DECOY NOISE-MAKER ACTIVE! Emitting false heartbeat & footsteps for 10s!', '#f59e0b');
        this.time.delayedCall(10000, () => decoySprite.destroy());
        break;
      }
      case 'medkit': {
        soundFx.playMedkitHeal();
        if (this.isOfflineMode && this.localPlayer) {
          this.localPlayer.isDowned = false;
          this.localPlayer.hp = Math.min(this.localPlayer.maxHp, this.localPlayer.hp + 45);
        }
        this.spawnFloatingText(px, py, '❤️ +45 HP RECOVERED!', '#22c55e', '14px');
        this.cameras.main.flash(250, 34, 197, 94);
        this.showAnnouncement('🩹 SURVIVAL MEDKIT CONSUMED! +45 HP Restored!', '#22c55e');
        break;
      }
      case 'camo_cloak': {
        this.camoCloakExpiresAt = Date.now() + 8000;
        this.spawnFloatingText(px, py, '🕶️ CAMOUFLAGE CLOAK ACTIVE!', '#a855f7', '14px');
        this.showAnnouncement('🕶️ CAMOUFLAGE CLOAK ACTIVE! Near invisible & muffled footsteps for 8s!', '#a855f7');
        break;
      }
    }
  }

  // Check Detonation of Armed Shock Mines
  private checkShockMines() {
    if (this.shockMines.length === 0) return;

    let butcherPos: { x: number; y: number } | null = null;
    if (this.isOfflineMode) {
      if (this.localButcherId && this.localButcherId !== 'local_player') {
        const b = this.localBots.get(this.localButcherId);
        if (b && !b.isDowned) butcherPos = { x: b.x, y: b.y };
      }
    } else if (this.currentRoom && this.currentRoom.state?.players) {
      const bId = this.currentRoom.state.butcherSessionId;
      if (bId) {
        const bp = this.currentRoom.state.players.get(bId);
        if (bp && !bp.isDowned) butcherPos = { x: bp.x, y: bp.y };
      }
    }

    if (!butcherPos) return;

    for (let i = this.shockMines.length - 1; i >= 0; i--) {
      const mine = this.shockMines[i];
      if (Math.hypot(mine.x - butcherPos.x, mine.y - butcherPos.y) <= 50) {
        // DETONATE!
        mine.sprite.destroy();
        this.shockMines.splice(i, 1);

        soundFx.playStunShock();
        this.shakeCamera(300, 0.022);
        this.spawnShockwave(mine.x, mine.y, 180, 0x38bdf8);
        this.spawnSparkBurst(mine.x, mine.y, 16);
        this.spawnFloatingText(mine.x, mine.y, '💥 SHOCK MINE DETONATED! STUNNED 3s!', '#38bdf8', '15px');
        this.showAnnouncement('⚡ STRATEGIC TURNOVER! Shock Mine detonated and stunned the Butcher for 3s!', '#38bdf8');

        if (this.isOfflineMode && this.localButcherId) {
          const b = this.localBots.get(this.localButcherId);
          if (b) {
            b.isStunned = true;
            this.time.delayedCall(3000, () => {
              if (b) b.isStunned = false;
            });
          }
        }
      }
    }
  }

  // Surprise Ambush Tackle or Butcher Special
  private handleFKey() {
    let isButcher = false;
    let px = 1280;
    let py = 1280;

    if (this.isOfflineMode && this.localPlayer) {
      isButcher = this.localPlayer.role === 'butcher';
      px = this.localPlayer.x;
      py = this.localPlayer.y;
    } else if (this.currentRoom) {
      const p = this.currentRoom.state?.players?.get(this.currentRoom.sessionId);
      if (p) {
        isButcher = p.role === 'butcher';
        px = p.x;
        py = p.y;
      }
    }

    if (isButcher) {
      this.handleSpaceKey();
      return;
    }

    // Prey Ambush Turnover: If Camouflaged in Bramble or Haystack
    if (!this.isCamouflaged) {
      this.showAnnouncement('⚠️ Ambush Tackle can only be launched while hidden in Brambles or Hay Bales!', '#e2e8f0');
      return;
    }

    const now = Date.now();
    if (now - this.lastAmbushTime < 12000) {
      const rem = Math.ceil((12000 - (now - this.lastAmbushTime)) / 1000);
      this.showAnnouncement(`⏳ Ambush Tackle on cooldown (${rem}s remaining)`, '#f59e0b');
      return;
    }

    // Find nearest Butcher within 95px
    let nearButcher = false;
    let bx = 0;
    let by = 0;
    if (this.isOfflineMode && this.localButcherId) {
      const b = this.localBots.get(this.localButcherId);
      if (b && !b.isDowned && Math.hypot(b.x - px, b.y - py) <= 95) {
        nearButcher = true;
        bx = b.x;
        by = b.y;
        b.isStunned = true;
        this.time.delayedCall(2800, () => {
          if (b) b.isStunned = false;
        });
      }
    } else if (this.currentRoom && this.currentRoom.state?.players) {
      const bId = this.currentRoom.state.butcherSessionId;
      if (bId) {
        const bp = this.currentRoom.state.players.get(bId);
        if (bp && !bp.isDowned && Math.hypot(bp.x - px, bp.y - py) <= 95) {
          nearButcher = true;
          bx = bp.x;
          by = bp.y;
        }
      }
    }

    if (!nearButcher) {
      this.showAnnouncement('⚠️ No Butcher within Ambush range (must be within 95px of hiding spot)!', '#e2e8f0');
      return;
    }

    // Execute Surprise Ambush Tackle!
    this.lastAmbushTime = now;
    soundFx.playAmbushTackle();
    this.shakeCamera(320, 0.022);
    this.spawnFloatingText(px, py, '💥 SURPRISE AMBUSH TACKLE! STUNNED 2.8s!', '#22c55e', '15px');
    this.spawnDustPuff(px, py);
    this.spawnDustPuff(bx, by);

    if (this.isOfflineMode && this.localPlayer) {
      this.localPlayer.buffExpiresAt = now + 4000; // Speed burst escape
    }
    this.showAnnouncement('💥 STRATEGIC AMBUSH SUCCESS! Tackled the Butcher & stunned them for 2.8s! RUN!', '#22c55e');
  }

  private trySectorInteraction(px: number, py: number): boolean {
    const now = Date.now();

    // 1. Check Hydraulic Gate Levers
    for (const gate of this.hydraulicGates) {
      if (Math.hypot(gate.leverX - px, gate.leverY - py) <= 60) {
        if (!gate.isClosed) {
          gate.isClosed = true;
          gate.closedUntil = now + 7000;
          gate.gateSprite.setAlpha(1).setTint(0xef4444);
          gate.leverLabel.setText('🔒 SLAMMED [7s]').setColor('#ef4444');

          soundFx.playGateSlam();
          this.shakeCamera(260, 0.02);
          this.spawnDustPuff(gate.gateX, gate.gateY);
          this.spawnFloatingText(gate.gateX, gate.gateY, '💥 HYDRAULIC GATE SLAMMED!', '#ef4444', '14px');

          // Check if Butcher was caught directly in the gateway
          let butcherHit = false;
          if (this.isOfflineMode && this.localButcherId) {
            const b = this.localBots.get(this.localButcherId);
            if (b && Math.hypot(b.x - gate.gateX, b.y - gate.gateY) <= 55) {
              b.isStunned = true;
              butcherHit = true;
              this.time.delayedCall(3200, () => {
                if (b) b.isStunned = false;
              });
            }
          }

          if (butcherHit) {
            soundFx.playStunShock();
            this.spawnSparkBurst(gate.gateX, gate.gateY, 15);
            this.spawnFloatingText(gate.gateX, gate.gateY, '💥 BLAST DOOR CRUSH STUN!', '#facc15', '16px');
            this.showAnnouncement('💥 STRATEGIC TURNOVER! Butcher crushed in Hydraulic Blast Door for 3.2s!', '#4ade80');
          } else {
            this.showAnnouncement('🛡️ Hydraulic Blast Door sealed for 7s! Chokepoint blocked!', '#38bdf8');
          }
          return true;
        }
      }
    }

    // 2. Check Sacrificial Altar Sacrificial Retribution Pulse
    if (Math.hypot(GAME_CONSTANTS.ALTAR_POSITION.x - px, GAME_CONSTANTS.ALTAR_POSITION.y - py) <= 130) {
      // If player has bio core, deposit it
      if (this.heldRelicCore) {
        this.heldRelicCore = false;
        this.depositedRelicsCount++;
        if (this.isOfflineMode && this.localPlayer) {
          this.localPlayer.score += 150;
          this.localPlayer.buffExpiresAt = now + 6000;
        }
        this.cameras.main.flash(400, 192, 132, 252);
        this.showAnnouncement(`🔥 BIO-CORE DEPOSITED! Altar Powered (${this.depositedRelicsCount}/4)! +Speed Boost!`, '#c084fc');
        return true;
      }

      // Check Retribution Pulse capability
      if (now - this.lastRetributionPulseTime >= 35000 && (this.depositedRelicsCount >= 1 || this.hasAnyDownedAlly())) {
        this.lastRetributionPulseTime = now;
        soundFx.playRetributionPulse();
        this.shakeCamera(420, 0.026);
        this.cameras.main.flash(500, 250, 204, 21);
        this.spawnShockwave(GAME_CONSTANTS.ALTAR_POSITION.x, GAME_CONSTANTS.ALTAR_POSITION.y, 650, 0xfacc15);

        // Stun Butcher if in range
        if (this.isOfflineMode && this.localButcherId) {
          const b = this.localBots.get(this.localButcherId);
          if (b && Math.hypot(b.x - 1280, b.y - 1280) <= 650) {
            b.isStunned = true;
            this.spawnFloatingText(b.x, b.y, '⚡ RETRIBUTION STUN 3.5s!', '#facc15', '16px');
            this.time.delayedCall(3500, () => {
              if (b) b.isStunned = false;
            });
          }
          // Revive all downed bots in range
          for (const [, otherBot] of this.localBots.entries()) {
            if (otherBot.isDowned && Math.hypot(otherBot.x - 1280, otherBot.y - 1280) <= 650) {
              otherBot.isDowned = false;
              otherBot.hp = 35;
              this.spawnFloatingText(otherBot.x, otherBot.y, '💖 REVIVED BY ALTAR!', '#22c55e', '14px');
            }
          }
        }

        this.showAnnouncement('⚡ SACRIFICIAL RETRIBUTION PULSE! Butcher Stunned & Downed Allies Revived!', '#facc15');
        return true;
      }
    }

    // 3. Check Supply Crates (Loot into Slot 1 or Slot 2)
    for (const crate of this.sectorCrates) {
      if (!crate.looted && Math.hypot(crate.x - px, crate.y - py) <= 75) {
        crate.looted = true;
        crate.sprite.setAlpha(0.35);
        crate.label.setText('📦 [EMPTY]');

        if (!this.slot1Consumable) {
          this.slot1Consumable = crate.itemType;
        } else if (!this.slot2Consumable) {
          this.slot2Consumable = crate.itemType;
        } else {
          this.slot1Consumable = crate.itemType; // replace slot 1
        }

        const itemName = crate.itemType.replace('_', ' ').toUpperCase();
        soundFx.playItemPickupSound();
        this.showAnnouncement(`🎒 Found ${itemName}! Stored in Tactical Inventory.`, '#facc15');
        return true;
      }
    }

    // 4. Check Bio-Cores / Relics
    for (const relic of this.sectorRelics) {
      if (!relic.collected && Math.hypot(relic.x - px, relic.y - py) <= 75) {
        relic.collected = true;
        relic.sprite.setVisible(false);
        relic.label.setVisible(false);
        this.heldRelicCore = true;
        soundFx.playItemPickupSound();
        this.showAnnouncement('🔮 BIO-CORE ACQUIRED! Deliver it to the Central Altar!', '#c084fc');
        return true;
      }
    }

    // 5. Instant trigger for Terminal if pressed E
    for (const term of this.sectorTerminals) {
      if (!term.repaired && Math.hypot(term.x - px, term.y - py) <= 80) {
        term.progress = Math.min(100, term.progress + 25);
        soundFx.playItemPickupSound();
        if (term.progress >= 100) {
          this.completeTerminalRepair(term);
        } else {
          term.label.setText(`⚡ ${term.name}\n[HOLD E: ${Math.round(term.progress)}%]`);
          this.showAnnouncement(`🔧 Calibrating ${term.name}: ${Math.round(term.progress)}%`, '#38bdf8');
        }
        return true;
      }
    }

    return false;
  }

  private hasAnyDownedAlly(): boolean {
    if (this.isOfflineMode) {
      if (this.localPlayer?.isDowned) return true;
      for (const [, b] of this.localBots.entries()) {
        if (b.isDowned) return true;
      }
    }
    return false;
  }

  private completeTerminalRepair(term: SectorTerminal) {
    term.repaired = true;
    term.progress = 100;
    term.sprite.setTint(0x22c55e);
    term.label.setText(`⚡ ${term.name.toUpperCase()}\n[ONLINE 100%]`).setColor('#22c55e');
    this.repairedTerminalsCount++;
    this.cameras.main.flash(300, 34, 197, 94);
    this.spawnSparkBurst(term.x, term.y, 14);
    soundFx.playItemPickupSound();
    this.showAnnouncement(`⚡ ${term.name} ONLINE! (${this.repairedTerminalsCount}/3 Terminals Repaired)`, '#22c55e');

    if (this.repairedTerminalsCount >= 3 && !this.blastGateUnlocked) {
      this.blastGateUnlocked = true;
      for (const bg of this.blastGates) {
        bg.sprite.setTint(0x22c55e);
        bg.label.setText('🔓 SOUTH BLAST GATE [OPEN]\n[EVACUATION ZONE READY]').setColor('#22c55e');
      }
      this.showAnnouncement('🚨 ALL TERMINALS ONLINE! SOUTH BLAST GATE IS UNLOCKED! RUN TO ESCAPE!', '#22c55e');
    }
  }

  private checkSectorProximities(px: number, py: number, deltaSec: number) {
    const now = Date.now();

    // 1. Check Bramble / Haystack Camouflage or Camo Cloak
    let inCover = false;
    for (const b of this.brambleZones) {
      if (Math.hypot(b.x - px, b.y - py) <= b.radius) {
        inCover = true;
        break;
      }
    }
    this.isCamouflaged = inCover || this.camoCloakExpiresAt > now;

    // 2. Check Electrified Puddle Stepping Hazard
    for (const puddle of this.electrifiedPuddles) {
      if (Math.hypot(puddle.x - px, puddle.y - py) <= 42) {
        if (now - puddle.lastShockTime > 2500) {
          puddle.lastShockTime = now;
          soundFx.playStunShock();
          this.spawnSparkBurst(px, py, 10);
          this.spawnFloatingText(px, py, '⚡ SHOCKED (-35% SPD)!', '#38bdf8');
          if (this.isOfflineMode && this.localPlayer) {
            this.localPlayer.buffExpiresAt = now - 1000; // Cancel speed buffs
          }
        }
      }
    }

    // 3. Check Toxic Spore Pod Triggers
    for (const pod of this.sporePods) {
      if (!pod.popped && Math.hypot(pod.x - px, pod.y - py) <= 36) {
        pod.popped = true;
        pod.respawnAt = now + 20000;
        pod.sprite.setAlpha(0.25);
        soundFx.playSporeBurst();
        this.shakeCamera(180, 0.012);
        this.spawnSporeBurst(pod.x, pod.y);
        this.spawnFloatingText(px, py, '🍄 SPORE BURST! VISION REDUCED!', '#c084fc');
      }
    }

    // 4. Interactive Prompts & Channels
    let nearInteractable = false;
    let promptMsg = '';

    // Check Hydraulic Gate Lever
    for (const gate of this.hydraulicGates) {
      if (Math.hypot(gate.leverX - px, gate.leverY - py) <= 60) {
        nearInteractable = true;
        promptMsg = gate.isClosed ? '🔒 GATE IS CURRENTLY SEALED' : '🕹️ [PRESS E] SLAM HYDRAULIC BLAST GATE';
        break;
      }
    }

    // Check Altar
    if (!nearInteractable && Math.hypot(GAME_CONSTANTS.ALTAR_POSITION.x - px, GAME_CONSTANTS.ALTAR_POSITION.y - py) <= 130) {
      if (this.heldRelicCore) {
        nearInteractable = true;
        promptMsg = '🔥 [PRESS E] DEPOSIT BIO-CORE INTO SACRIFICIAL ALTAR';
      } else if (now - this.lastRetributionPulseTime >= 35000 && (this.depositedRelicsCount >= 1 || this.hasAnyDownedAlly())) {
        nearInteractable = true;
        promptMsg = '⚡ [PRESS E] UNLEASH SACRIFICIAL RETRIBUTION PULSE!';
      }
    }

    // Check Terminals
    if (!nearInteractable) {
      for (const term of this.sectorTerminals) {
        if (!term.repaired && Math.hypot(term.x - px, term.y - py) <= 80) {
          nearInteractable = true;
          promptMsg = `[HOLD E] REPAIR ${term.name.toUpperCase()} (${Math.round(term.progress)}%)`;
          if (this.wasd?.keyE?.isDown) {
            term.progress = Math.min(100, term.progress + deltaSec * 35);
            term.label.setText(`⚡ ${term.name}\n[REPAIRING: ${Math.round(term.progress)}%]`);
            if (term.progress >= 100) {
              this.completeTerminalRepair(term);
            }
          }
          break;
        }
      }
    }

    // Check Supply Crates
    if (!nearInteractable) {
      for (const crate of this.sectorCrates) {
        if (!crate.looted && Math.hypot(crate.x - px, crate.y - py) <= 75) {
          nearInteractable = true;
          promptMsg = `[PRESS E] LOOT SUPPLY CRATE (${crate.itemType.replace('_', ' ').toUpperCase()})`;
          break;
        }
      }
    }

    // Check Bio-Core Relics
    if (!nearInteractable) {
      for (const relic of this.sectorRelics) {
        if (!relic.collected && Math.hypot(relic.x - px, relic.y - py) <= 75) {
          nearInteractable = true;
          promptMsg = `[PRESS E] RETRIEVE BIO-CORE RELIC`;
          break;
        }
      }
    }

    // Check Surprise Ambush Readiness when Hidden
    if (this.isCamouflaged) {
      let butcherDist = 9999;
      if (this.isOfflineMode && this.localButcherId) {
        const b = this.localBots.get(this.localButcherId);
        if (b && !b.isDowned) butcherDist = Math.hypot(b.x - px, b.y - py);
      }
      if (butcherDist <= 95) {
        nearInteractable = true;
        promptMsg = '💥 [PRESS F] SURPRISE AMBUSH TACKLE!';
      }
    }

    // Check Blast Gate Evacuation
    if (this.blastGateUnlocked && py >= 2460 && Math.abs(px - 1280) <= 90) {
      this.showAnnouncement('🏆 YOU SAFELY EVACUATED SECTOR 6! EXTRAORDINARY SURVIVOR VICTORY!', '#22c55e');
    }

    // Display interaction prompt
    if (nearInteractable && promptMsg) {
      this.interactionPromptText.setText(promptMsg).setAlpha(1);
    } else {
      this.interactionPromptText.setAlpha(0);
    }
  }

  private renderVisionVignette(px: number, py: number) {
    if (!this.visionMask) return;
    this.visionMask.clear();

    const curWeather = this.weatherSystem ? this.weatherSystem.currentWeather : 'twilight';
    const isFlareActive = this.radioScanExpiresAt > Date.now();

    // If flare active or twilight, no darkness mask needed
    if (isFlareActive || curWeather === 'twilight') {
      return;
    }

    const cam = this.cameras.main;
    const viewL = cam.worldView.x - 50;
    const viewT = cam.worldView.y - 50;
    const viewW = cam.worldView.width + 100;
    const viewH = cam.worldView.height + 100;

    let maskColor = 0x050505;
    let maskAlpha = 0.55;
    let radius = 220;

    if (curWeather === 'toxic_fog') {
      maskColor = 0x1e293b;
      maskAlpha = 0.72;
      radius = 160;
    } else if (curWeather === 'acid_rain') {
      maskColor = 0x052e16;
      maskAlpha = 0.45;
      radius = 240;
    } else if (curWeather === 'blood_moon') {
      maskColor = 0x3b0712;
      maskAlpha = 0.60;
      radius = 220;
    } else if (curWeather === 'gale_storm') {
      maskColor = 0x0f172a;
      maskAlpha = 0.50;
      radius = 250;
    }

    this.visionMask.fillStyle(maskColor, maskAlpha);
    this.visionMask.fillRect(viewL, viewT, viewW, viewH);

    // Spotlight around player
    this.visionMask.fillStyle(0x000000, 0);
    this.visionMask.fillCircle(px, py, radius);
  }
}
