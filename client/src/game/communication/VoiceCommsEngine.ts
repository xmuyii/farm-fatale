import { AnimalType, ISpeciesSoundEvent, SpeciesSoundConfig } from '@shared/types.ts';
import { soundFx } from '../audio.ts';

export const SPECIES_SOUND_CONFIGS: Record<AnimalType, SpeciesSoundConfig> = {
  chicken: { soundText: 'Bawk!', baseRadius: 160, maxPerSec: 2 },
  pig: { soundText: 'Oink!', baseRadius: 130, maxPerSec: 2 },
  goat: { soundText: 'Maaa!', baseRadius: 250, maxPerSec: 2 },
  sheep: { soundText: 'Baaa!', baseRadius: 190, maxPerSec: 2 },
  cow: { soundText: 'Mooo!', baseRadius: 380, maxPerSec: 2 },
  horse: { soundText: 'Neigh!', baseRadius: 320, maxPerSec: 2 },
  duck: { soundText: 'Quack!', baseRadius: 160, maxPerSec: 2 },
  parrot: { soundText: 'Squawk!', baseRadius: 640, maxPerSec: 0.2 }, // 1 per 5s
};

export interface ChorusTracker {
  animal: AnimalType;
  soundText: string;
  timestamps: number[];
  senderIds: Set<string>;
}

export class VoiceCommsEngine {
  // Silence suspicion tracker (No sound for 30s = +1 Mark)
  private lastSoundMadeTimestamp: number = Date.now();
  private silenceTimerMs: number = 30000;
  private onSilencePenaltyCallback?: () => void;

  // Rate limiting (max 2/sec per animal, Parrot 1/5s)
  private lastCallTime: number = 0;

  // Barnyard chorus tracking (3+ animals same sound within 3s)
  private recentCalls: Array<{ senderId: string; animal: AnimalType; soundText: string; time: number }> = [];
  private onChorusTriggeredCallback?: (animal: AnimalType) => void;

  // Push-to-talk and Web Audio Mic State (Consent required)
  private micStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micLevel: number = 0;
  private isMuted: boolean = false;
  private isPTTActive: boolean = false;
  private voiceConsentGranted: boolean = false;
  private pttIntervalId: number | null = null;

  constructor(
    onSilencePenalty?: () => void,
    onChorusTriggered?: (animal: AnimalType) => void
  ) {
    this.onSilencePenaltyCallback = onSilencePenalty;
    this.onChorusTriggeredCallback = onChorusTriggered;
    this.lastSoundMadeTimestamp = Date.now();
  }

  // Update loop called every frame in GameScene
  update(deltaSeconds: number): { silenceTimeRemaining: number; micLevel: number } {
    const now = Date.now();

    // Check Silence of Suspicion penalty (30s rule)
    const elapsedSinceSound = now - this.lastSoundMadeTimestamp;
    const silenceTimeRemaining = Math.max(0, Math.ceil((this.silenceTimerMs - elapsedSinceSound) / 1000));

    if (elapsedSinceSound >= this.silenceTimerMs) {
      this.lastSoundMadeTimestamp = now; // reset
      if (this.onSilencePenaltyCallback) {
        this.onSilencePenaltyCallback();
      }
    }

    // Clean old chorus calls older than 3 seconds
    this.recentCalls = this.recentCalls.filter((c) => now - c.time <= 3000);

    // Read mic audio level if active
    if (this.analyser && this.isPTTActive && !this.isMuted) {
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      this.micLevel = Math.min(100, Math.round((sum / dataArray.length) * 1.6));
    } else {
      this.micLevel = 0;
    }

    return { silenceTimeRemaining, micLevel: this.micLevel };
  }

  // Triggered when local or bot animal makes a call
  makeSpeciesCall(
    senderId: string,
    username: string,
    animal: AnimalType,
    x: number,
    y: number,
    isRainOrFog: boolean,
    customParrotSentence?: string
  ): ISpeciesSoundEvent | null {
    const now = Date.now();
    const config = SPECIES_SOUND_CONFIGS[animal] || SPECIES_SOUND_CONFIGS.chicken;
    const minIntervalMs = 1000 / config.maxPerSec;

    if (now - this.lastCallTime < minIntervalMs) {
      return null; // rate-limited
    }

    this.lastCallTime = now;
    this.lastSoundMadeTimestamp = now; // Reset silence suspicion timer!

    // Calculate effective radius (rain or fog halves sound travel distance!)
    let radius = config.baseRadius;
    if (isRainOrFog) {
      radius = Math.round(radius * 0.5);
    }

    let soundText = config.soundText;
    let isGarbled = false;
    let isParrotSentence = false;

    if (animal === 'parrot') {
      isParrotSentence = true;
      if (customParrotSentence && customParrotSentence.trim().length > 0) {
        soundText = customParrotSentence.slice(0, 60);
      } else {
        const defaultPhrases = [
          'Watch out! Butcher is near the Silos!',
          'Hurry to the Sacrificial Altar!',
          'Hide in the Brambles quickly!',
          'Repair the radio terminal!',
          'Behind you! Run for the blast gate!',
          'Need help! Someone revive me!',
        ];
        soundText = defaultPhrases[Math.floor(Math.random() * defaultPhrases.length)];
      }

      // Comedy Requirement: 10% chance to garble into random letters/squawks
      if (Math.random() < 0.1) {
        isGarbled = true;
        const garbles = [
          'SQWAAAK! B-R-R-K *kzzzt* SQUAWK!',
          'SKREEEE?! *bzzzt* POL-L-Y CRACK-ERRR!',
          'SQUAWWWWK! KKK-ZZT BLA-A-RT!',
          'KRRR-KAAAW! *chirp-hiss* SQUAWK!',
        ];
        soundText = garbles[Math.floor(Math.random() * garbles.length)];
      }
    }

    // Play synthesized procedural audio with 10+ variations
    soundFx.playAnimalVoice(animal, undefined, isGarbled);

    // Track for Barnyard Chorus (3+ animals making the same sound within 3s)
    this.recentCalls.push({ senderId, animal, soundText, time: now });
    const sameSoundRecent = this.recentCalls.filter((c) => c.animal === animal && now - c.time <= 3000);
    const uniqueSenders = new Set(sameSoundRecent.map((c) => c.senderId));

    if (uniqueSenders.size >= 3) {
      soundFx.playBarnyardChorus();
      if (this.onChorusTriggeredCallback) {
        this.onChorusTriggeredCallback(animal);
      }
      this.recentCalls = []; // reset chorus after triggering
    }

    return {
      senderId,
      username,
      animal,
      x,
      y,
      text: soundText,
      radius,
      timestamp: now,
      isGarbled,
      isParrotSentence,
    };
  }

  // Push-to-Talk (PTT) management with explicit consent
  setVoiceConsent(granted: boolean) {
    this.voiceConsentGranted = granted;
  }

  hasVoiceConsent(): boolean {
    return this.voiceConsentGranted;
  }

  async startPTT(
    localId: string,
    username: string,
    animal: AnimalType,
    x: number,
    y: number,
    isRainOrFog: boolean,
    onCallEmitted?: (ev: ISpeciesSoundEvent) => void
  ): Promise<boolean> {
    if (this.isMuted) return false;
    this.isPTTActive = true;

    // Trigger immediate animal sound
    const ev = this.makeSpeciesCall(localId, username, animal, x, y, isRainOrFog);
    if (ev && onCallEmitted) {
      onCallEmitted(ev);
    }

    // If Web Audio microphone is permitted, initialize stream
    if (this.voiceConsentGranted && !this.micStream && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioCtx();
        const source = this.audioCtx.createMediaStreamSource(this.micStream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 64;
        source.connect(this.analyser);
      } catch (err) {
        console.warn('[VoiceComms] Mic access declined or unavailable:', err);
      }
    }

    return true;
  }

  stopPTT() {
    this.isPTTActive = false;
    this.micLevel = 0;
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopPTT();
    }
    return this.isMuted;
  }

  getIsMuted(): boolean {
    return this.isMuted;
  }

  getSilenceTimerRemaining(): number {
    const elapsed = Date.now() - this.lastSoundMadeTimestamp;
    return Math.max(0, (this.silenceTimerMs - elapsed) / 1000);
  }

  getIsPTTActive(): boolean {
    return this.isPTTActive;
  }

  resetSilenceTimer() {
    this.lastSoundMadeTimestamp = Date.now();
  }
}
