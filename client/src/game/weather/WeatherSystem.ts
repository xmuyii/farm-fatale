import Phaser from 'phaser';
import { soundFx } from '../audio.ts';

export type WeatherType = 'twilight' | 'acid_rain' | 'toxic_fog' | 'gale_storm' | 'blood_moon';

export const WEATHER_LOOP: WeatherType[] = [
  'twilight',
  'acid_rain',
  'toxic_fog',
  'gale_storm',
  'blood_moon',
];

export interface IWeatherDef {
  id: WeatherType;
  name: string;
  icon: string;
  color: string;
  ambientTint: number;
  ambientAlpha: number;
  description: string;
  effectSummary: string;
}

export const WEATHER_TYPES: Record<WeatherType, IWeatherDef> = {
  twilight: {
    id: 'twilight',
    name: 'Sector 6 Twilight',
    icon: '🌒',
    color: '#94a3b8',
    ambientTint: 0x0f172a,
    ambientAlpha: 0.15,
    description: 'Cold, stagnant dawn over the slaughter grounds. Clear visibility.',
    effectSummary: 'Standard visibility & baseline movement speeds.',
  },
  acid_rain: {
    id: 'acid_rain',
    name: 'Chemical Drizzle (Acid Rain)',
    icon: '🌧️',
    color: '#84cc16',
    ambientTint: 0x365314,
    ambientAlpha: 0.35,
    description: 'Corrosive chemical precipitation falls from the containment dome.',
    effectSummary: 'Outdoor speed -12%. Barn & Greenhouse provide shelter. Ducks gain +25% sprint.',
  },
  toxic_fog: {
    id: 'toxic_fog',
    name: 'Dense Sector Fog',
    icon: '🌫️',
    color: '#a1a1aa',
    ambientTint: 0x27272a,
    ambientAlpha: 0.6,
    description: 'Toxic mist rolls in from the drainage culvert, smothering vision.',
    effectSummary: 'Vision clamped to 260px. Bramble & hay hiding grants 100% stealth.',
  },
  gale_storm: {
    id: 'gale_storm',
    name: 'EMP Gale (High Winds)',
    icon: '💨',
    color: '#38bdf8',
    ambientTint: 0x1e293b,
    ambientAlpha: 0.25,
    description: 'Severe gale-force winds sweep across Sector 6 with static discharge.',
    effectSummary: 'Wind pushes +35px/s East, -25px/s West. Disrupts Hound tracking. CDs tick 15% faster.',
  },
  blood_moon: {
    id: 'blood_moon',
    name: 'Blood Moon Eclipse',
    icon: '🩸',
    color: '#ef4444',
    ambientTint: 0x7f1d1d,
    ambientAlpha: 0.45,
    description: 'The sky turns a suffocating crimson. Occult slaughter energy surges.',
    effectSummary: 'Butcher speed +12%, Cleaver CD -20%. Prey gain +18% panic burst near Butcher.',
  },
};

export class WeatherSystem {
  private scene: Phaser.Scene;
  public currentWeather: WeatherType = 'twilight';
  public loopDuration: number = 50;
  public timeUntilNextWeather: number = 50;
  public nextWeatherType: WeatherType = 'acid_rain';
  private warningGiven: boolean = false;

  // Visual Overlays & Particle Layers
  private tintOverlay!: Phaser.GameObjects.Rectangle;
  private flashOverlay!: Phaser.GameObjects.Rectangle;
  private rainDrops: Phaser.GameObjects.Image[] = [];
  private fogPuffs: Phaser.GameObjects.Image[] = [];
  private windStreaks: Phaser.GameObjects.Rectangle[] = [];
  private fireflies: Phaser.GameObjects.Image[] = [];
  private embers: Phaser.GameObjects.Image[] = [];
  private toxicSpores: Phaser.GameObjects.Image[] = [];
  private lastThunderTime: number = 0;

  // Notification Callback
  private onWeatherChange?: (weather: IWeatherDef, isWarning: boolean) => void;

  constructor(scene: Phaser.Scene, onWeatherChange?: (weather: IWeatherDef, isWarning: boolean) => void) {
    this.scene = scene;
    this.onWeatherChange = onWeatherChange;
    this.createVisuals();
  }

  private createVisuals() {
    const screenW = 2560;
    const screenH = 2560;

    // 1. Ambient Lighting Tint Overlay (depth 140, below HUD)
    this.tintOverlay = this.scene.add
      .rectangle(1280, 1280, screenW, screenH, 0x0f172a, 0.15)
      .setDepth(140);

    // 2. Fullscreen Thunder/Lightning Flash Overlay (depth 190)
    this.flashOverlay = this.scene.add
      .rectangle(1280, 1280, screenW, screenH, 0xffffff, 0)
      .setDepth(190);

    // 3. Pre-create 60 raindrop images
    for (let i = 0; i < 60; i++) {
      const drop = this.scene.add.image(0, 0, 'fx_raindrop');
      drop.setDepth(145).setAlpha(0);
      this.rainDrops.push(drop);
    }

    // 4. Pre-create 20 fog clouds
    for (let i = 0; i < 20; i++) {
      const fog = this.scene.add.image(
        Phaser.Math.Between(0, 2560),
        Phaser.Math.Between(0, 2560),
        'fx_fog_cloud'
      );
      fog.setDepth(142).setAlpha(0).setScale(Phaser.Math.FloatBetween(1.2, 2.5));
      this.fogPuffs.push(fog);
    }

    // 5. Pre-create 30 wind streak lines
    for (let i = 0; i < 30; i++) {
      const streak = this.scene.add.rectangle(0, 0, Phaser.Math.Between(40, 90), 2, 0xe2e8f0, 0.4);
      streak.setDepth(144).setAlpha(0);
      this.windStreaks.push(streak);
    }

    // 6. Pre-create 25 glowing fireflies for Twilight
    for (let i = 0; i < 25; i++) {
      const ff = this.scene.add.image(
        Phaser.Math.Between(0, 2560),
        Phaser.Math.Between(0, 2560),
        'fx_firefly'
      );
      ff.setDepth(143).setAlpha(0);
      this.fireflies.push(ff);
    }

    // 7. Pre-create 25 floating embers for Blood Moon
    for (let i = 0; i < 25; i++) {
      const emb = this.scene.add.image(
        Phaser.Math.Between(0, 2560),
        Phaser.Math.Between(0, 2560),
        'fx_ember'
      );
      emb.setDepth(146).setAlpha(0);
      this.embers.push(emb);
    }

    // 8. Pre-create 15 toxic spores for Fog
    for (let i = 0; i < 15; i++) {
      const sp = this.scene.add.image(
        Phaser.Math.Between(0, 2560),
        Phaser.Math.Between(0, 2560),
        'fx_spore'
      );
      sp.setDepth(143).setAlpha(0);
      this.toxicSpores.push(sp);
    }
  }

  public setWeather(type: WeatherType) {
    this.currentWeather = type;
    this.timeUntilNextWeather = this.loopDuration;
    this.warningGiven = false;

    // Advance to next weather in cyclic loop
    const curIdx = WEATHER_LOOP.indexOf(type);
    const nextIdx = (curIdx + 1) % WEATHER_LOOP.length;
    this.nextWeatherType = WEATHER_LOOP[nextIdx];

    const def = WEATHER_TYPES[type];

    // Update Ambient Lighting Overlay
    this.scene.tweens.add({
      targets: this.tintOverlay,
      fillColor: def.ambientTint,
      fillAlpha: def.ambientAlpha,
      duration: 1000,
    });

    // Audio cue based on weather
    if (type === 'blood_moon') {
      soundFx.playThunder();
      this.triggerLightningFlash();
    } else if (type === 'gale_storm') {
      soundFx.playWindGust();
    } else if (type === 'acid_rain') {
      soundFx.playDashSound();
    } else {
      soundFx.playReviveSound();
    }

    if (this.onWeatherChange) {
      this.onWeatherChange(def, false);
    }
  }

  public cycleWeather() {
    const curIdx = WEATHER_LOOP.indexOf(this.currentWeather);
    const nextIdx = (curIdx + 1) % WEATHER_LOOP.length;
    this.setWeather(WEATHER_LOOP[nextIdx]);
  }

  public triggerLightningFlash() {
    this.flashOverlay.setFillStyle(0xffffff, 0.85);
    this.scene.tweens.add({
      targets: this.flashOverlay,
      fillAlpha: 0,
      duration: 350,
      ease: 'Quad.easeOut',
    });
    // Camera shudder
    this.scene.cameras.main.shake(250, 0.012);
  }

  public getLoopStatus() {
    const curIdx = WEATHER_LOOP.indexOf(this.currentWeather);
    const nextIdx = (curIdx + 1) % WEATHER_LOOP.length;
    const timeRemaining = Math.max(0, Math.ceil(this.timeUntilNextWeather));
    const progressRatio = Phaser.Math.Clamp(1 - this.timeUntilNextWeather / this.loopDuration, 0, 1);

    return {
      loop: WEATHER_LOOP,
      currentIndex: curIdx,
      currentWeather: this.currentWeather,
      currentDef: WEATHER_TYPES[this.currentWeather],
      nextWeather: WEATHER_LOOP[nextIdx],
      nextDef: WEATHER_TYPES[WEATHER_LOOP[nextIdx]],
      timeRemaining,
      totalDuration: this.loopDuration,
      progressRatio,
    };
  }

  public update(deltaSec: number, cameraX: number, cameraY: number) {
    this.timeUntilNextWeather -= deltaSec;

    // 10s Early Warning
    if (this.timeUntilNextWeather <= 10 && !this.warningGiven) {
      this.warningGiven = true;
      soundFx.playAlarmSiren();
      if (this.onWeatherChange) {
        this.onWeatherChange(WEATHER_TYPES[this.nextWeatherType], true);
      }
    }

    // Auto switch weather when timer hits 0 in strict sequential loop
    if (this.timeUntilNextWeather <= 0) {
      this.setWeather(this.nextWeatherType);
    }

    // Keep ambient tint and flash centered around camera
    this.tintOverlay.x = cameraX;
    this.tintOverlay.y = cameraY;
    this.flashOverlay.x = cameraX;
    this.flashOverlay.y = cameraY;

    // Update particles based on active weather
    if (this.currentWeather === 'twilight') {
      this.updateFireflies(deltaSec, cameraX, cameraY);
    } else {
      this.hideFireflies();
    }

    if (this.currentWeather === 'acid_rain') {
      this.updateRain(deltaSec, cameraX, cameraY);
    } else {
      this.hideRain();
    }

    if (this.currentWeather === 'toxic_fog') {
      this.updateFog(deltaSec, cameraX, cameraY);
    } else {
      this.hideFog();
    }

    if (this.currentWeather === 'gale_storm') {
      this.updateWind(deltaSec, cameraX, cameraY);
    } else {
      this.hideWind();
    }

    if (this.currentWeather === 'blood_moon') {
      this.updateEmbers(deltaSec, cameraX, cameraY);
      const now = Date.now();
      if (now - this.lastThunderTime > 14000) {
        this.lastThunderTime = now;
        soundFx.playThunder();
        this.triggerLightningFlash();
      }
    } else {
      this.hideEmbers();
    }
  }

  private updateFireflies(deltaSec: number, cameraX: number, cameraY: number) {
    const time = this.scene.time.now;
    for (let i = 0; i < this.fireflies.length; i++) {
      const ff = this.fireflies[i];
      if (ff.alpha < 0.2) {
        ff.setAlpha(Phaser.Math.FloatBetween(0.4, 0.85));
        ff.x = cameraX + Phaser.Math.Between(-700, 700);
        ff.y = cameraY + Phaser.Math.Between(-500, 500);
      }
      // Floating sinusoidal motion
      ff.x += Math.cos(time * 0.002 + i) * 20 * deltaSec;
      ff.y += Math.sin(time * 0.003 + i) * 15 * deltaSec - 8 * deltaSec;
      ff.setAlpha(0.5 + Math.sin(time * 0.004 + i) * 0.35);

      if (Math.hypot(ff.x - cameraX, ff.y - cameraY) > 850) {
        ff.x = cameraX + Phaser.Math.Between(-650, 650);
        ff.y = cameraY + Phaser.Math.Between(-450, 450);
      }
    }
  }

  private hideFireflies() {
    for (const ff of this.fireflies) {
      if (ff.alpha > 0) ff.setAlpha(0);
    }
  }

  private updateRain(_deltaSec: number, cameraX: number, cameraY: number) {
    for (const drop of this.rainDrops) {
      if (drop.alpha < 0.6) {
        drop.setAlpha(Phaser.Math.FloatBetween(0.5, 0.8));
        drop.x = cameraX + Phaser.Math.Between(-700, 700);
        drop.y = cameraY + Phaser.Math.Between(-500, 500);
      }
      drop.y += 18;
      drop.x -= 3;
      if (drop.y > cameraY + 500 || drop.x < cameraX - 700) {
        drop.x = cameraX + Phaser.Math.Between(-700, 700);
        drop.y = cameraY - 500;
      }
    }
  }

  private hideRain() {
    for (const drop of this.rainDrops) {
      if (drop.alpha > 0) drop.setAlpha(0);
    }
  }

  private updateFog(deltaSec: number, cameraX: number, cameraY: number) {
    for (const fog of this.fogPuffs) {
      if (fog.alpha < 0.3) {
        fog.setAlpha(Phaser.Math.FloatBetween(0.2, 0.45));
      }
      fog.x += 12 * deltaSec;
      if (fog.x > 2560) fog.x = 0;
      if (Math.hypot(fog.x - cameraX, fog.y - cameraY) > 900) {
        fog.x = cameraX + Phaser.Math.Between(-800, 800);
        fog.y = cameraY + Phaser.Math.Between(-800, 800);
      }
    }

    for (let i = 0; i < this.toxicSpores.length; i++) {
      const sp = this.toxicSpores[i];
      if (sp.alpha < 0.3) {
        sp.setAlpha(Phaser.Math.FloatBetween(0.4, 0.7));
        sp.x = cameraX + Phaser.Math.Between(-700, 700);
        sp.y = cameraY + Phaser.Math.Between(-500, 500);
      }
      sp.y += Math.sin(this.scene.time.now * 0.003 + i) * 10 * deltaSec - 5 * deltaSec;
      sp.x += 10 * deltaSec;
      if (Math.hypot(sp.x - cameraX, sp.y - cameraY) > 850) {
        sp.x = cameraX + Phaser.Math.Between(-700, 700);
        sp.y = cameraY + Phaser.Math.Between(-500, 500);
      }
    }
  }

  private hideFog() {
    for (const fog of this.fogPuffs) {
      if (fog.alpha > 0) fog.setAlpha(0);
    }
    for (const sp of this.toxicSpores) {
      if (sp.alpha > 0) sp.setAlpha(0);
    }
  }

  private updateWind(_deltaSec: number, cameraX: number, cameraY: number) {
    for (const streak of this.windStreaks) {
      if (streak.alpha < 0.4) {
        streak.setAlpha(Phaser.Math.FloatBetween(0.3, 0.6));
        streak.x = cameraX + Phaser.Math.Between(-700, 700);
        streak.y = cameraY + Phaser.Math.Between(-500, 500);
      }
      streak.x += 24;
      if (streak.x > cameraX + 700) {
        streak.x = cameraX - 700;
        streak.y = cameraY + Phaser.Math.Between(-500, 500);
      }
    }
  }

  private hideWind() {
    for (const streak of this.windStreaks) {
      if (streak.alpha > 0) streak.setAlpha(0);
    }
  }

  private updateEmbers(deltaSec: number, cameraX: number, cameraY: number) {
    const time = this.scene.time.now;
    for (let i = 0; i < this.embers.length; i++) {
      const emb = this.embers[i];
      if (emb.alpha < 0.2) {
        emb.setAlpha(Phaser.Math.FloatBetween(0.5, 0.9));
        emb.x = cameraX + Phaser.Math.Between(-700, 700);
        emb.y = cameraY + Phaser.Math.Between(100, 500);
      }
      // Floating upwards like burning ash
      emb.y -= 35 * deltaSec;
      emb.x += Math.sin(time * 0.003 + i) * 20 * deltaSec;
      if (emb.y < cameraY - 500 || Math.hypot(emb.x - cameraX, emb.y - cameraY) > 850) {
        emb.x = cameraX + Phaser.Math.Between(-700, 700);
        emb.y = cameraY + Phaser.Math.Between(200, 500);
      }
    }
  }

  private hideEmbers() {
    for (const emb of this.embers) {
      if (emb.alpha > 0) emb.setAlpha(0);
    }
  }

  // Physical Game Modifier Helpers
  public getSpeedModifier(
    _x: number,
    _y: number,
    animal: string,
    isButcher: boolean,
    isSheltered: boolean
  ): number {
    let mod = 1.0;

    if (this.currentWeather === 'acid_rain') {
      if (!isSheltered && !isButcher) {
        mod *= animal === 'duck' ? 1.25 : 0.88; // Acid rain slows land animals, boosts ducks
      }
    } else if (this.currentWeather === 'blood_moon') {
      if (isButcher) {
        mod *= 1.12; // Butcher frenzy
      }
    }

    return mod;
  }

  public getWindPush(): { x: number; y: number } {
    if (this.currentWeather === 'gale_storm') {
      return { x: 35, y: 0 }; // 35px/s eastward push
    }
    return { x: 0, y: 0 };
  }

  public isVisionClamped(): boolean {
    return this.currentWeather === 'toxic_fog';
  }
}
