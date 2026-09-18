import { AnimalType } from '@shared/types.ts';
import { getCachedActivePlayer, saveCachedActivePlayer, PlayerProfile } from '../network/supabase.ts';
import { soundFx } from '../game/audio.ts';
import { leaderboardModal } from './LeaderboardModal.ts';
import { gameModeModal } from './GameModeModal.ts';
import { engagementHubModal } from './EngagementHubModal.ts';

export class HomeMenuModal {
  private container: HTMLDivElement | null = null;
  private isOpen: boolean = true;
  private onStartSoloCallback?: (animal: AnimalType) => void;
  private onStartLiveCallback?: (animal: AnimalType) => void;
  private currentAnimal: AnimalType = 'pig';
  private activeTab: 'play' | 'manual' = 'play';
  private isMatchActive: boolean = false;
  private statusMessage: string | null = null;

  constructor() {
    const cached = getCachedActivePlayer();
    if (cached.last_animal) {
      this.currentAnimal = cached.last_animal as AnimalType;
    }
    this.createDom();

    // Listen for match state updates from GameScene
    window.addEventListener('SET_MATCH_ACTIVE', (e: any) => {
      this.isMatchActive = !!e.detail?.active;
      this.render();
    });
  }

  public setMatchActive(active: boolean) {
    this.isMatchActive = active;
    this.render();
  }

  public setCallbacks(onSolo: (animal: AnimalType) => void, onLive: (animal: AnimalType) => void) {
    this.onStartSoloCallback = onSolo;
    this.onStartLiveCallback = onLive;
  }

  private createDom() {
    if (document.getElementById('home-menu-modal')) return;

    this.container = document.createElement('div');
    this.container.id = 'home-menu-modal';
    this.container.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md transition-all duration-300 select-none overflow-y-auto';

    this.render();
    document.body.appendChild(this.container);

    // ESC key closes/opens home menu
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.toggle();
      }
    });
  }

  private render() {
    if (!this.container) return;

    const profile = getCachedActivePlayer();
    const animals: { type: AnimalType; label: string; icon: string; sound: string; trait: string }[] = [
      { type: 'pig', label: 'Pig', icon: '🐷', sound: 'Oink!', trait: 'High Stamina & Mud Traction' },
      { type: 'chicken', label: 'Chicken', icon: '🐔', sound: 'Bawk!', trait: 'Quick Dash & Small Hitbox' },
      { type: 'goat', label: 'Goat', icon: '🐐', sound: 'Maaa!', trait: 'Comedic Headbutt Knockback' },
      { type: 'sheep', label: 'Sheep', icon: '🐑', sound: 'Baaa!', trait: 'Flock Camouflage & Chorus' },
      { type: 'cow', label: 'Cow', icon: '🐮', sound: 'Mooo!', trait: 'Wide Sound & Sacrificial Ward' },
      { type: 'horse', label: 'Horse', icon: '🐴', sound: 'Neigh!', trait: 'Top Sprint Speed' },
      { type: 'duck', label: 'Duck', icon: '🦆', sound: 'Quack!', trait: 'Water & Creek Swimming' },
      { type: 'parrot', label: 'Parrot', icon: '🦜', sound: 'Sentence', trait: 'Speaks Full Sentences in Chat' },
    ];

    this.container.innerHTML = `
      <div class="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-stone-900/95 border-2 border-stone-700/80 rounded-3xl shadow-2xl overflow-hidden font-sans text-stone-100 backdrop-blur-xl">
        
        <!-- Top Visual Banner / Header -->
        <div class="relative px-8 py-6 bg-gradient-to-b from-red-950/60 via-stone-950/80 to-stone-900 border-b border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 rounded-2xl bg-red-600/20 border-2 border-red-500/40 flex items-center justify-center text-3xl shadow-lg shadow-red-950">
              🩸
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-2xl sm:text-3xl font-black text-amber-400 tracking-wider font-mono">FARM FATALE</h1>
                <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-600/30 text-red-300 border border-red-500/40">SECTOR 6</span>
              </div>
              <p class="text-xs sm:text-sm text-stone-400 font-medium">Asymmetric Stealth Survival • Live Multiplayer & Solo Play</p>
            </div>
          </div>

          <!-- Navigation Tabs -->
          <div class="flex items-center gap-1 bg-stone-950/70 p-1.5 rounded-xl border border-stone-800 text-xs font-bold">
            <button id="hm-tab-play" class="px-4 py-1.5 rounded-lg transition-all ${this.activeTab === 'play' ? 'bg-amber-500 text-stone-950 shadow-md font-black' : 'text-stone-400 hover:text-stone-200'}">
              🎮 PLAY
            </button>
            <button id="hm-tab-manual" class="px-4 py-1.5 rounded-lg transition-all ${this.activeTab === 'manual' ? 'bg-amber-500 text-stone-950 shadow-md font-black' : 'text-stone-400 hover:text-stone-200'}">
              📖 RULES
            </button>
            <button id="hm-close-btn" class="ml-2 w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white flex items-center justify-center font-mono text-sm transition-colors cursor-pointer" title="Return to Game [ESC]">
              ✕
            </button>
          </div>
        </div>

        <!-- Main Body Content Area -->
        <div class="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-6">

          ${this.activeTab === 'play' ? `
            <!-- Player Identity & Animal Selection Strip -->
            <div class="bg-stone-950/60 border border-stone-800 p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl">
                  ${animals.find(a => a.type === this.currentAnimal)?.icon || '🐾'}
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold text-stone-200 font-mono">${profile.username}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-sky-950/90 border border-sky-600/70 text-sky-300 font-mono font-bold tracking-wide">
                      ${profile.is_telegram ? 'TELEGRAM AUTH' : 'SECURE PROFILE'}
                    </span>
                  </div>
                  <p class="text-xs text-stone-400">
                    Selected: <span class="text-amber-400 font-bold uppercase">${this.currentAnimal}</span> • 
                    <span class="text-stone-300 italic">${animals.find(a => a.type === this.currentAnimal)?.trait}</span>
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button id="hm-test-voice-btn" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-xs font-bold text-sky-300 border border-stone-700 transition-all cursor-pointer">
                  <span>🔊</span>
                  <span>Audition Voice</span>
                </button>
                <button id="hm-open-hub-btn" class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-xs font-bold text-emerald-300 border border-emerald-500/40 transition-all cursor-pointer">
                  <span>🦜</span>
                  <span>Mastery & Mic [H]</span>
                </button>
              </div>
            </div>

            ${this.statusMessage ? `
              <div class="p-3 rounded-xl bg-red-950/90 border border-red-500/80 text-red-200 text-xs font-bold flex items-center gap-2 animate-bounce">
                <span>🔒</span>
                <span>${this.statusMessage}</span>
              </div>
            ` : ''}

            <!-- Animal Selection Grid -->
            <div>
              <div class="flex items-center justify-between mb-2.5">
                <div class="flex items-center gap-2">
                  <h3 class="text-xs font-bold font-mono tracking-wider text-stone-400 uppercase">CHOOSE YOUR SPECIES (UNIQUE VOICE & ATTRIBUTES)</h3>
                  ${this.isMatchActive ? `
                    <span class="text-[10px] px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 font-mono font-bold">
                      🔒 LOCKED MID-MATCH
                    </span>
                  ` : ''}
                </div>
                <span class="text-[11px] text-stone-500">Each animal has distinct sound radius & stealth role</span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                ${animals.map((a) => {
                  const isSelected = a.type === this.currentAnimal;
                  return `
                    <button data-animal="${a.type}" class="animal-select-card flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                      this.isMatchActive && !isSelected ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-500 text-white shadow-lg shadow-amber-950/50 scale-[1.02]'
                        : 'bg-stone-950/40 border-stone-800 text-stone-400 hover:bg-stone-800/60 hover:text-stone-200'
                    }">
                      <div class="flex items-center justify-between w-full mb-1">
                        <span class="text-2xl">${a.icon}</span>
                        <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-bold">${a.sound}</span>
                      </div>
                      <div class="font-bold text-xs ${isSelected ? 'text-amber-400' : 'text-stone-200'}">${a.label}</div>
                      <div class="text-[10px] text-stone-400 mt-0.5 leading-tight line-clamp-2">${a.trait}</div>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Primary Play Action Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <!-- Solo Practice Mode Card -->
              <div class="flex flex-col justify-between p-5 rounded-2xl bg-gradient-to-br from-stone-950 to-stone-900 border-2 border-emerald-600/40 hover:border-emerald-500 shadow-xl transition-all group">
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-950 text-emerald-400 border border-emerald-800">SOLO PRACTICE</span>
                    <span class="text-emerald-400 font-mono text-xs">${this.isMatchActive ? 'Round in Progress' : 'Instant Offline'}</span>
                  </div>
                  <h3 class="text-lg font-black text-stone-100 flex items-center gap-2 group-hover:text-emerald-400 transition-colors">
                    <span>🌾 SOLO SURVIVAL SIMULATION</span>
                  </h3>
                  <p class="text-xs text-stone-400 mt-1 leading-relaxed">
                    Play with 5 intelligent AI animals. 4-Minute Round, Butcher transformation at 120s, dynamic weather loops, and Sector 6 exits.
                  </p>
                </div>
                <div class="mt-4 flex items-center gap-2">
                  <button id="hm-start-solo-btn" class="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-stone-950 font-black text-sm tracking-wide shadow-lg shadow-emerald-950/60 transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
                    <span>▶</span>
                    <span>${this.isMatchActive ? 'RESUME CURRENT ROUND' : 'START SOLO GAME NOW'}</span>
                  </button>
                  ${this.isMatchActive ? `
                    <button id="hm-restart-solo-btn" class="px-3 py-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-600 text-xs font-bold transition-all cursor-pointer" title="Restart Round">
                      🔄 Restart
                    </button>
                  ` : ''}
                </div>
              </div>

              <!-- Live Multiplayer Card -->
              <div class="flex flex-col justify-between p-5 rounded-2xl bg-gradient-to-br from-stone-950 to-stone-900 border-2 border-sky-600/40 hover:border-sky-500 shadow-xl transition-all group">
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-sky-950 text-sky-400 border border-sky-800">MULTIPLAYER</span>
                    <span class="text-sky-400 font-mono text-xs">Live Matchmaking</span>
                  </div>
                  <h3 class="text-lg font-black text-stone-100 flex items-center gap-2 group-hover:text-sky-400 transition-colors">
                    <span>⚔️ LIVE MULTIPLAYER ROOM</span>
                  </h3>
                  <p class="text-xs text-stone-400 mt-1 leading-relaxed">
                    Join online matchmaking with real players. Synchronized authoritative state, real-time push-to-talk animal voice calls, and global leaderboards.
                  </p>
                </div>
                <button id="hm-start-live-btn" class="mt-4 w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-stone-950 font-black text-sm tracking-wide shadow-lg shadow-sky-950/60 transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
                  <span>📡</span>
                  <span>JOIN LIVE MATCHMAKING</span>
                </button>
              </div>
            </div>

            <!-- Secondary Sub-Menu Buttons -->
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              <button id="hm-open-modes-btn" class="flex items-center justify-center gap-2 p-3 rounded-xl bg-stone-950/50 hover:bg-stone-800/80 border border-stone-800 text-xs font-bold text-stone-200 transition-all cursor-pointer">
                <span>🌦️</span>
                <span>Weather & Modes [M]</span>
              </button>
              <button id="hm-open-leaderboard-btn" class="flex items-center justify-center gap-2 p-3 rounded-xl bg-stone-950/50 hover:bg-stone-800/80 border border-stone-800 text-xs font-bold text-stone-200 transition-all cursor-pointer">
                <span>🏆</span>
                <span>Leaderboards [L]</span>
              </button>
              <button id="hm-open-manual-btn" class="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 p-3 rounded-xl bg-stone-950/50 hover:bg-stone-800/80 border border-stone-800 text-xs font-bold text-stone-200 transition-all cursor-pointer">
                <span>📖</span>
                <span>Field Survival Guide</span>
              </button>
            </div>
          ` : `
            <!-- Rules / Survival Manual View -->
            <div class="space-y-4 text-xs sm:text-sm">
              <div class="p-4 rounded-xl bg-stone-950 border border-stone-800">
                <h4 class="font-bold text-amber-400 text-sm mb-1.5 flex items-center gap-2">
                  <span>⏱️ 1. The 4-Minute Round & Butcher Transformation</span>
                </h4>
                <p class="text-stone-300 leading-relaxed">
                  Every round lasts 240 seconds. For the first 120 seconds, all players scurry, scavenge Bio-Cores, and build defensive trust. At exactly 120s, the player with the highest suspicion (or chosen candidate) transforms into the Cleaver-wielding <strong>Butcher</strong>!
                </p>
              </div>

              <div class="p-4 rounded-xl bg-stone-950 border border-stone-800">
                <h4 class="font-bold text-sky-400 text-sm mb-1.5 flex items-center gap-2">
                  <span>🤫 2. Silence of Suspicion & Species Voice Calls</span>
                </h4>
                <p class="text-stone-300 leading-relaxed">
                  Each animal communicates using only its natural species call. Press <kbd class="px-1.5 py-0.5 bg-stone-800 rounded font-mono">V</kbd> to call out. Calls reveal your position via faint ripples. BUT staying completely silent for 30s incurs suspicion (+1 Mark penalty)! Only the <strong>Parrot</strong> speaks full sentences in chat bubbles.
                </p>
              </div>

              <div class="p-4 rounded-xl bg-stone-950 border border-stone-800">
                <h4 class="font-bold text-emerald-400 text-sm mb-1.5 flex items-center gap-2">
                  <span>🎶 3. Barnyard Chorus & Speed Buffs</span>
                </h4>
                <p class="text-stone-300 leading-relaxed">
                  When 3 or more animals call out in unison within 3 seconds, a <strong>Barnyard Chorus</strong> triggers, granting all surviving animals a +5% sprint speed buff!
                </p>
              </div>

              <div class="p-4 rounded-xl bg-stone-950 border border-stone-800">
                <h4 class="font-bold text-red-400 text-sm mb-1.5 flex items-center gap-2">
                  <span>🏮 4. Sacrificial Altar & Hydraulic Chokepoint Blast Gates</span>
                </h4>
                <p class="text-stone-300 leading-relaxed">
                  Sacrificing allies (or volunteering) at the Central Altar removes Marks and grants legendary survival boons. Pull hydraulic switches near fence bottlenecks to slam steel blast gates behind you, trapping the Butcher!
                </p>
              </div>

              <div class="p-4 rounded-xl bg-stone-950 border border-stone-800">
                <h4 class="font-bold text-purple-400 text-sm mb-1.5 flex items-center gap-2">
                  <span>🎭 5. Ragdoll Physics, Emotes & Near-Miss Slow-Mo</span>
                </h4>
                <p class="text-stone-300 leading-relaxed">
                  Dodging a cleaver swing within 75px triggers a 0.75s dramatic time-dilation zoom. Downed players ragdoll across the yard. Press <kbd class="px-1.5 py-0.5 bg-stone-800 rounded font-mono">T</kbd> for the radial emote wheel and <kbd class="px-1.5 py-0.5 bg-stone-800 rounded font-mono">Y</kbd> to view dramatic instant replays!
                </p>
              </div>
            </div>
          `}
        </div>

        <!-- Bottom Status Bar -->
        <div class="px-8 py-3 bg-stone-950/80 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono text-stone-400">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>FARM FATALE • ASYMMETRIC STEALTH SURVIVAL</span>
            <span>•</span>
            <span>PRESS <kbd class="px-1.5 py-0.5 rounded bg-stone-800 text-stone-200 border border-stone-700">ESC</kbd> TO RETURN</span>
          </div>
          <div class="flex items-center gap-3">
            <button id="hm-quick-resume-btn" class="px-4 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold transition-colors cursor-pointer">
              Resume Game →
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners() {
    if (!this.container) return;

    // Tabs
    this.container.querySelector('#hm-tab-play')?.addEventListener('click', () => {
      this.activeTab = 'play';
      this.render();
    });
    this.container.querySelector('#hm-tab-manual')?.addEventListener('click', () => {
      this.activeTab = 'manual';
      this.render();
    });
    this.container.querySelector('#hm-open-manual-btn')?.addEventListener('click', () => {
      this.activeTab = 'manual';
      this.render();
    });

    // Close / Resume
    this.container.querySelector('#hm-close-btn')?.addEventListener('click', () => this.close());
    this.container.querySelector('#hm-quick-resume-btn')?.addEventListener('click', () => this.close());

    // Test Voice Call
    this.container.querySelector('#hm-test-voice-btn')?.addEventListener('click', () => {
      soundFx.playAnimalVoice(this.currentAnimal);
    });

    // Sub-modals
    this.container.querySelector('#hm-open-hub-btn')?.addEventListener('click', () => {
      engagementHubModal.open();
    });
    this.container.querySelector('#hm-open-modes-btn')?.addEventListener('click', () => {
      gameModeModal.open();
    });
    this.container.querySelector('#hm-open-leaderboard-btn')?.addEventListener('click', () => {
      leaderboardModal.open('all-time');
    });

    // Animal Selection Cards
    this.container.querySelectorAll('.animal-select-card').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (this.isMatchActive) {
          this.statusMessage = 'Species is locked during an active round! Finish or restart the round to change species.';
          this.render();
          setTimeout(() => {
            this.statusMessage = null;
            this.render();
          }, 3000);
          return;
        }

        const animal = (e.currentTarget as HTMLElement).getAttribute('data-animal') as AnimalType;
        if (animal) {
          this.currentAnimal = animal;
          soundFx.playAnimalVoice(animal);
          const p = getCachedActivePlayer();
          p.last_animal = animal;
          saveCachedActivePlayer(p);
          this.render();
        }
      });
    });

    // Play Buttons
    this.container.querySelector('#hm-start-solo-btn')?.addEventListener('click', () => {
      this.close();
      if (this.onStartSoloCallback) {
        this.onStartSoloCallback(this.currentAnimal);
      }
    });

    this.container.querySelector('#hm-restart-solo-btn')?.addEventListener('click', () => {
      this.isMatchActive = false;
      this.close();
      if (this.onStartSoloCallback) {
        this.onStartSoloCallback(this.currentAnimal);
      }
    });

    this.container.querySelector('#hm-start-live-btn')?.addEventListener('click', () => {
      this.close();
      if (this.onStartLiveCallback) {
        this.onStartLiveCallback(this.currentAnimal);
      }
    });
  }

  public open() {
    this.isOpen = true;
    this.render();
    if (this.container) {
      this.container.classList.remove('opacity-0', 'pointer-events-none');
    }
  }

  public close() {
    this.isOpen = false;
    if (this.container) {
      this.container.classList.add('opacity-0', 'pointer-events-none');
    }
  }

  public toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public isMenuOpen(): boolean {
    return this.isOpen;
  }
}

export const homeMenuModal = new HomeMenuModal();
