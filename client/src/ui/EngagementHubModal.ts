import { engagementEngine, DAILY_CHAOS_MODIFIERS } from '../game/engagement/EngagementEngine.ts';
import { AnimalType } from '@shared/types.ts';
import { soundFx } from '../game/audio.ts';

export class EngagementHubModal {
  private container: HTMLDivElement | null = null;
  private isOpen: boolean = false;
  private activeTab: 'mastery' | 'voice' | 'predictions' | 'nemesis' | 'highlights' | 'mystery' = 'mastery';
  private onVoiceConsentChange?: (granted: boolean) => void;
  private onParrotSentenceSubmit?: (text: string) => void;

  constructor() {
    this.createDom();
  }

  setCallbacks(
    onVoiceConsentChange: (granted: boolean) => void,
    onParrotSentenceSubmit: (text: string) => void
  ) {
    this.onVoiceConsentChange = onVoiceConsentChange;
    this.onParrotSentenceSubmit = onParrotSentenceSubmit;
  }

  private createDom() {
    if (document.getElementById('farm-engagement-modal')) return;

    this.container = document.createElement('div');
    this.container.id = 'farm-engagement-modal';
    this.container.style.display = 'none';
    this.container.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md opacity-0 pointer-events-none transition-all duration-200';

    this.container.innerHTML = `
      <div class="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-stone-900 border border-stone-700/80 rounded-2xl shadow-2xl overflow-hidden font-sans text-stone-100">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 bg-stone-950/80 border-b border-stone-800">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl">
              🌾
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-lg font-black tracking-wide text-stone-100">
                  BARNYARD COMMAND HUB
                </h2>
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  ENGAGEMENT & COMMS
                </span>
              </div>
              <p class="text-xs text-stone-400">Mastery tracks, voice & PTT settings, predictions, nemesis records & mystery lore</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/60 border border-amber-800/80 text-amber-300 font-mono text-xs">
              <span>🌽 Corn:</span>
              <span id="corn-balance-display" class="font-bold text-amber-200">250</span>
            </div>
            <button id="hub-close-btn" class="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white flex items-center justify-center font-mono text-sm transition-colors cursor-pointer">
              ✕
            </button>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex items-center gap-1 px-6 py-2 bg-stone-950/50 border-b border-stone-800 text-xs overflow-x-auto">
          <button data-tab="mastery" class="tab-btn px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer bg-amber-500 text-stone-950">
            ⭐ Animal Mastery
          </button>
          <button data-tab="voice" class="tab-btn px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-stone-400 hover:text-stone-200">
            🎙️ Voice & Sound
          </button>
          <button data-tab="predictions" class="tab-btn px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-stone-400 hover:text-stone-200">
            🎲 Predictions
          </button>
          <button data-tab="nemesis" class="tab-btn px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-stone-400 hover:text-stone-200">
            ⚔️ Nemesis
          </button>
          <button data-tab="highlights" class="tab-btn px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-stone-400 hover:text-stone-200">
            🎬 Highlights & Replay
          </button>
          <button data-tab="mystery" class="tab-btn px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-stone-400 hover:text-stone-200">
            📜 Sector Mystery
          </button>
        </div>

        <!-- Tab Content Body -->
        <div id="hub-tab-content" class="flex-1 overflow-y-auto p-6 space-y-6">
          <!-- Dynamically injected via renderCurrentTab -->
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    this.container.querySelector('#hub-close-btn')?.addEventListener('click', () => {
      this.close();
    });

    this.container.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetTab = (e.currentTarget as HTMLElement).dataset.tab as any;
        this.switchTab(targetTab);
      });
    });
  }

  private switchTab(tab: typeof this.activeTab) {
    this.activeTab = tab;
    if (!this.container) return;

    this.container.querySelectorAll('.tab-btn').forEach((btn) => {
      const b = btn as HTMLElement;
      if (b.dataset.tab === tab) {
        b.className = 'tab-btn px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer bg-amber-500 text-stone-950';
      } else {
        b.className = 'tab-btn px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-stone-400 hover:text-stone-200';
      }
    });

    this.renderCurrentTab();
  }

  private renderCurrentTab() {
    const body = this.container?.querySelector('#hub-tab-content');
    if (!body) return;

    // Update corn
    const cornDisplay = this.container?.querySelector('#corn-balance-display');
    if (cornDisplay) cornDisplay.textContent = engagementEngine.getBarnyardCorn().toString();

    if (this.activeTab === 'mastery') {
      const allMastery = engagementEngine.getAllMastery();
      const emojis: Record<string, string> = {
        chicken: '🐔',
        pig: '🐷',
        goat: '🐐',
        sheep: '🐑',
        cow: '🐮',
        horse: '🐴',
        duck: '🦆',
        parrot: '🦜',
      };

      body.innerHTML = `
        <div>
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-sm font-bold uppercase tracking-wider text-amber-400">
                Animal Mastery Progression (Levels 1–5)
              </h3>
              <p class="text-xs text-stone-400">Play rounds, coordinate choruses, and revive allies to earn XP and unlock earned-only cosmetics.</p>
            </div>
            <span class="text-xs font-mono text-stone-400">100% Earned • 0% Pay-to-Win</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${allMastery
              .map((m) => {
                const pct = Math.min(100, Math.round((m.xp / 1000) * 100));
                return `
                <div class="p-4 rounded-xl bg-stone-950/70 border border-stone-800 flex flex-col gap-2.5">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                      <span class="text-2xl">${emojis[m.animal] || '🐾'}</span>
                      <div>
                        <h4 class="font-bold text-sm text-stone-100 capitalize">${m.animal}</h4>
                        <span class="text-[11px] text-amber-300 font-mono">${m.title}</span>
                      </div>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      LVL ${m.level} / 5
                    </span>
                  </div>

                  <div class="w-full bg-stone-800 h-2 rounded-full overflow-hidden">
                    <div class="bg-amber-400 h-full rounded-full transition-all duration-300" style="width: ${pct}%"></div>
                  </div>

                  <div class="flex items-center justify-between text-[11px] text-stone-400">
                    <span>${m.xp} / 1000 XP</span>
                    <span class="text-stone-300 flex items-center gap-1">
                      <span>🎁 Unlocked:</span>
                      <strong class="text-amber-200">${m.unlockedCosmetic}</strong>
                    </span>
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>
        </div>
      `;
    } else if (this.activeTab === 'voice') {
      const todayChaos = engagementEngine.getTodayChaosModifier();
      body.innerHTML = `
        <div class="space-y-5">
          <div class="p-4 rounded-xl bg-sky-950/40 border border-sky-800/80 flex flex-col gap-2">
            <h3 class="text-sm font-bold text-sky-300 flex items-center gap-2">
              <span>🎙️</span> Voice & Species Sound Guidelines
            </h3>
            <p class="text-xs text-stone-300 leading-relaxed">
              In Farm Fatale, each animal makes only its species sound (e.g., Chicken "Bawk!", Pig "Oink!", Cow "Mooo!").
              <strong>Only the Parrot speaks in full sentences!</strong>
            </p>
            <ul class="text-xs text-stone-400 space-y-1 mt-1 list-disc list-inside">
              <li><strong>Proximity Audio:</strong> Sounds reveal your location to the Butcher via audio ripples.</li>
              <li><strong>Rain/Fog Reduction:</strong> Inclement weather cuts sound travel distances by 50%.</li>
              <li><strong>Barnyard Chorus:</strong> 3+ animals making the same sound within 3s grant a <strong>+5% speed boost</strong>!</li>
              <li><strong>Silence of Suspicion:</strong> Staying completely silent for 30s grants <strong>+1 Mark</strong>!</li>
            </ul>
          </div>

          <!-- PTT & Mic Controls -->
          <div class="p-4 rounded-xl bg-stone-950/70 border border-stone-800 space-y-4">
            <h4 class="font-bold text-sm text-amber-400">Push-To-Talk & Audio Mic Options</h4>
            <div class="flex items-center justify-between p-3 rounded-lg bg-stone-900 border border-stone-800">
              <div>
                <div class="font-bold text-xs text-stone-200">Push-to-Talk Key: [V] or Click Mic</div>
                <div class="text-[11px] text-stone-400">Triggers your animal species sound with 10+ procedural acoustic variations</div>
              </div>
              <button id="test-sound-btn" class="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs cursor-pointer">
                🔊 Test Sound
              </button>
            </div>

            <!-- Parrot Custom Sentence -->
            <div class="p-3 rounded-lg bg-stone-900 border border-stone-800 space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-emerald-400">🦜 Parrot Tactical Sentence Broadcast (Max 60 chars)</span>
                <span class="text-[10px] text-stone-400">10% comedy garble chance</span>
              </div>
              <div class="flex gap-2">
                <input id="parrot-sentence-input" type="text" maxlength="60" placeholder="e.g., Butcher is approaching the North Silos!" class="flex-1 bg-stone-950 border border-stone-700 rounded px-3 py-1.5 text-xs text-stone-200 focus:outline-none focus:border-amber-400" />
                <button id="save-parrot-sentence-btn" class="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer">
                  Save
                </button>
              </div>
            </div>

            <!-- Daily Chaos Modifier Banner -->
            <div class="p-3 rounded-lg bg-stone-900 border border-amber-500/30 flex items-center justify-between">
              <div>
                <span class="text-xs text-stone-400">Today's Daily Chaos Modifier:</span>
                <div class="text-sm font-bold text-amber-300 flex items-center gap-1.5 mt-0.5">
                  <span>${todayChaos.icon}</span>
                  <span>${todayChaos.title}</span>
                </div>
                <p class="text-[11px] text-stone-400">${todayChaos.description}</p>
              </div>
              <span class="px-2 py-1 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/40">
                ACTIVE
              </span>
            </div>
          </div>
        </div>
      `;

      body.querySelector('#test-sound-btn')?.addEventListener('click', () => {
        soundFx.playAnimalVoice('chicken');
      });

      body.querySelector('#save-parrot-sentence-btn')?.addEventListener('click', () => {
        const val = (body.querySelector('#parrot-sentence-input') as HTMLInputElement)?.value;
        if (val && this.onParrotSentenceSubmit) {
          this.onParrotSentenceSubmit(val);
          alert(`Saved Parrot Broadcast: "${val}"`);
        }
      });
    } else if (this.activeTab === 'predictions') {
      const activePred = engagementEngine.getActivePrediction();
      body.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-sm font-bold uppercase tracking-wider text-amber-400">Pre-Round Outcome Predictions</h3>
              <p class="text-xs text-stone-400">Wager Barnyard Corn on match outcomes to multiply your reserves.</p>
            </div>
            <div class="text-xs text-stone-300 font-mono">
              Balance: <strong class="text-amber-400">${engagementEngine.getBarnyardCorn()} Corn</strong>
            </div>
          </div>

          ${
            activePred
              ? `
            <div class="p-4 rounded-xl bg-amber-950/40 border border-amber-800 text-xs text-amber-200">
              <strong>Active Bet Placed:</strong> ${activePred.betOn.replace('_', ' ').toUpperCase()} for ${activePred.wagerCorn} Corn (Odds: ${activePred.odds}x). Result resolves at round end!
            </div>
          `
              : `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="p-4 rounded-xl bg-stone-950/70 border border-stone-800 flex flex-col justify-between gap-3">
                <div>
                  <h4 class="font-bold text-sm text-stone-100">🏆 Butcher Total Wipeout</h4>
                  <p class="text-xs text-stone-400 mt-1">Predict the Butcher downs all prey before the 4-minute timer expires.</p>
                </div>
                <div class="flex items-center justify-between">
                  <span class="font-mono text-xs text-amber-400">Odds: 2.2x</span>
                  <button data-bet="butcher_victory" class="pred-bet-btn px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs cursor-pointer">
                    Bet 50 Corn
                  </button>
                </div>
              </div>

              <div class="p-4 rounded-xl bg-stone-950/70 border border-stone-800 flex flex-col justify-between gap-3">
                <div>
                  <h4 class="font-bold text-sm text-stone-100">🌿 Barnyard Survival</h4>
                  <p class="text-xs text-stone-400 mt-1">Predict at least 2 prey survive the round or escape through evacuation gates.</p>
                </div>
                <div class="flex items-center justify-between">
                  <span class="font-mono text-xs text-amber-400">Odds: 1.8x</span>
                  <button data-bet="prey_escape" class="pred-bet-btn px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs cursor-pointer">
                    Bet 50 Corn
                  </button>
                </div>
              </div>

              <div class="p-4 rounded-xl bg-stone-950/70 border border-stone-800 flex flex-col justify-between gap-3">
                <div>
                  <h4 class="font-bold text-sm text-stone-100">⚡ Bloodshed Under 60s</h4>
                  <p class="text-xs text-stone-400 mt-1">Predict a prey animal is downed within the first 60 seconds of metamorphosis.</p>
                </div>
                <div class="flex items-center justify-between">
                  <span class="font-mono text-xs text-amber-400">Odds: 2.8x</span>
                  <button data-bet="first_down_under_60s" class="pred-bet-btn px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs cursor-pointer">
                    Bet 50 Corn
                  </button>
                </div>
              </div>

              <div class="p-4 rounded-xl bg-stone-950/70 border border-stone-800 flex flex-col justify-between gap-3">
                <div>
                  <h4 class="font-bold text-sm text-stone-100">🎶 Harmony: Barnyard Chorus</h4>
                  <p class="text-xs text-stone-400 mt-1">Predict that survivors coordinate a 3-animal synchronized Chorus during the match.</p>
                </div>
                <div class="flex items-center justify-between">
                  <span class="font-mono text-xs text-amber-400">Odds: 3.5x</span>
                  <button data-bet="chorus_formed" class="pred-bet-btn px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs cursor-pointer">
                    Bet 50 Corn
                  </button>
                </div>
              </div>
            </div>
          `
          }
        </div>
      `;

      body.querySelectorAll('.pred-bet-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const betType = (e.currentTarget as HTMLElement).dataset.bet as any;
          const success = engagementEngine.placePrediction(betType, 50, 2.0);
          if (success) {
            this.renderCurrentTab();
          } else {
            alert('Not enough Corn! Earn more by surviving rounds.');
          }
        });
      });
    } else if (this.activeTab === 'nemesis') {
      const nemesisList = engagementEngine.getNemesisRecords();
      body.innerHTML = `
        <div class="space-y-4">
          <div>
            <h3 class="text-sm font-bold uppercase tracking-wider text-amber-400">Nemesis Rivalry Tracking</h3>
            <p class="text-xs text-stone-400">Track head-to-head encounters against rival Butchers and survivors.</p>
          </div>

          ${
            nemesisList.length === 0
              ? `
            <div class="p-8 rounded-xl bg-stone-950/50 border border-stone-800 text-center text-xs text-stone-400">
              No rivalries registered yet. Encounter Butchers in Sector 6 to record rivalries!
            </div>
          `
              : `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              ${nemesisList
                .map(
                  (n) => `
                <div class="p-4 rounded-xl bg-stone-950/70 border border-stone-800 flex items-center justify-between">
                  <div>
                    <h4 class="font-bold text-sm text-stone-100 flex items-center gap-2">
                      <span>💀</span> ${n.nemesisName}
                    </h4>
                    <span class="text-[11px] text-stone-400">Downed you: ${n.downedCount} times • Escapes: ${n.escapedCount}</span>
                  </div>
                  <span class="px-2 py-1 rounded bg-red-950 border border-red-800 text-red-400 font-mono text-xs font-bold">
                    RIVAL
                  </span>
                </div>
              `
                )
                .join('')}
            </div>
          `
          }
        </div>
      `;
    } else if (this.activeTab === 'highlights') {
      const highlights = engagementEngine.getHighlights();
      const shareText = engagementEngine.generateShareableRecap('Animals', 'Local Survivor');
      body.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-sm font-bold uppercase tracking-wider text-amber-400">Match Highlights & Instant Replay</h3>
              <p class="text-xs text-stone-400">Review key clutch moments and copy shareable match recap cards.</p>
            </div>
            <button id="copy-share-btn" class="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer">
              <span>📋</span> Copy Share Card
            </button>
          </div>

          <div class="p-4 rounded-xl bg-stone-950/70 border border-stone-800 space-y-2">
            <h4 class="font-bold text-xs text-stone-300 uppercase tracking-wider">Shareable Recap Preview</h4>
            <pre class="p-3 rounded bg-stone-900 border border-stone-800 font-mono text-[11px] text-amber-200 whitespace-pre-wrap">${shareText}</pre>
          </div>

          <div class="space-y-2">
            <h4 class="font-bold text-xs text-stone-300 uppercase tracking-wider">Recorded Moments</h4>
            ${
              highlights.length === 0
                ? `
              <div class="p-4 rounded-lg bg-stone-950/40 border border-stone-800 text-xs text-stone-400 text-center">
                Clutch moments (Near-miss slow-mos, Hydraulic gate slams, Barnyard Choruses) will populate here during play.
              </div>
            `
                : `
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                ${highlights
                  .map(
                    (h) => `
                  <div class="p-3 rounded-lg bg-stone-950/60 border border-stone-800 flex items-center gap-3">
                    <span class="text-2xl">${h.icon}</span>
                    <div>
                      <h5 class="font-bold text-xs text-stone-200">${h.title}</h5>
                      <p class="text-[11px] text-stone-400">${h.desc}</p>
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
            }
          </div>
        </div>
      `;

      body.querySelector('#copy-share-btn')?.addEventListener('click', () => {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(shareText).then(() => {
            alert('Copied Sector 6 Match Recap card to clipboard!');
          });
        }
      });
    } else if (this.activeTab === 'mystery') {
      body.innerHTML = `
        <div class="space-y-4">
          <div>
            <h3 class="text-sm font-bold uppercase tracking-wider text-amber-400">Sector 6 Seasonal Mystery</h3>
            <p class="text-xs text-stone-400">Investigate the dark history of the automated facility and uncover what awakened the Butcher.</p>
          </div>

          <div class="space-y-3">
            <div class="p-4 rounded-xl bg-stone-950/70 border border-stone-800 space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-amber-300">📄 LOG #001: REAGENT LEAK IN SECTOR 6</span>
                <span class="text-[10px] font-mono text-emerald-400">DECRYPTED</span>
              </div>
              <p class="text-xs text-stone-300 leading-relaxed font-mono">
                "Day 42: The central culvert drainage began spewing purple bio-fluid. The animals began demonstrating coordinated behavioral anomalies... and the Farm Master never left the Slaughter Barn."
              </p>
            </div>

            <div class="p-4 rounded-xl bg-stone-950/70 border border-stone-800 space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-stone-300">📄 LOG #002: THE SILENCE PROTOCOL</span>
                <span class="text-[10px] font-mono text-amber-400">FIELD LOG</span>
              </div>
              <p class="text-xs text-stone-300 leading-relaxed font-mono">
                "Rule 1: Never stay silent for more than 30 seconds. The silence attracts the shadows. Coordinate calls with your herd to keep panic at bay."
              </p>
            </div>

            <div class="p-4 rounded-xl bg-stone-950/70 border border-stone-800 space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-stone-300">📄 LOG #003: THE SACRIFICIAL OVERDRIVE</span>
                <span class="text-[10px] font-mono text-sky-400">TERMINAL ARCHIVE</span>
              </div>
              <p class="text-xs text-stone-300 leading-relaxed font-mono">
                "The central altar was built as an energy conduit. Deposit 3 Bio-Cores to trigger the golden Retribution Pulse and stun the facility overseer."
              </p>
            </div>
          </div>
        </div>
      `;
    }
  }

  open(initialTab?: typeof this.activeTab) {
    if (initialTab) this.activeTab = initialTab;
    this.createDom();
    if (!this.container) return;
    this.isOpen = true;
    this.switchTab(this.activeTab);
    this.container.style.display = 'flex';
    this.container.classList.remove('opacity-0', 'pointer-events-none');
    this.container.classList.add('opacity-100', 'pointer-events-auto');
  }

  close() {
    if (!this.container) return;
    this.isOpen = false;
    this.container.classList.remove('opacity-100', 'pointer-events-auto');
    this.container.classList.add('opacity-0', 'pointer-events-none');
    this.container.style.display = 'none';
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
}

export const engagementHubModal = new EngagementHubModal();
