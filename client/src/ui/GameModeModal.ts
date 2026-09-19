import { GAME_MODES, GameModeId } from '../game/modes/GameModes.ts';
import { WEATHER_TYPES, WeatherType } from '../game/weather/WeatherSystem.ts';

export class GameModeModal {
  private container: HTMLDivElement | null = null;
  private isOpen: boolean = false;
  private currentMode: GameModeId = 'classic';
  private currentWeather: WeatherType = 'twilight';
  private onSelectModeCallback?: (modeId: GameModeId) => void;
  private onSelectWeatherCallback?: (weather: WeatherType) => void;

  constructor() {
    this.createDom();
  }

  private createDom() {
    if (document.getElementById('farm-gamemode-modal')) return;

    this.container = document.createElement('div');
    this.container.id = 'farm-gamemode-modal';
    this.container.style.display = 'none';
    this.container.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md opacity-0 pointer-events-none transition-all duration-200';
    this.container.innerHTML = `
      <div class="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-stone-900 border border-stone-700/80 rounded-2xl shadow-2xl overflow-hidden font-sans text-stone-100">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 bg-stone-950/70 border-b border-stone-800">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-xl">
              🎮
            </div>
            <div>
              <h2 class="text-lg font-black tracking-wide text-stone-100 flex items-center gap-2">
                SECTOR 6: GAME MODES & WEATHER DISPATCH
                <span class="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">SECTOR 6 PROTOCOLS</span>
              </h2>
              <p class="text-xs text-stone-400">Configure round rules, environmental hazards, and sector objectives</p>
            </div>
          </div>
          <button id="mode-close-btn" class="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white flex items-center justify-center font-mono text-sm transition-colors cursor-pointer">
            ✕
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-6 space-y-6">
          <!-- Game Modes Selection -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <span>🎯</span> Choose Game Mode
              </h3>
              <span class="text-xs text-stone-400">Click any mode to activate instantly</span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" id="mode-cards-container">
              <!-- Mode cards injected via renderCards -->
            </div>
          </div>

          <!-- Dynamic Weather Control -->
          <div class="bg-stone-950/60 border border-stone-800 rounded-xl p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <span class="text-base">🌩️</span>
                <div>
                  <h4 class="text-xs font-bold uppercase tracking-wider text-stone-200">Environmental Weather Cycle</h4>
                  <p class="text-[11px] text-stone-400">Weather changes dynamically every 60s and directly modifies speed, vision, and abilities</p>
                </div>
              </div>
              <span class="text-[10px] font-mono bg-stone-800 text-stone-300 px-2 py-1 rounded border border-stone-700">
                Hotkey: [K] Cycle Weather
              </span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2" id="weather-cards-container">
              <!-- Weather buttons injected via renderWeather -->
            </div>
          </div>

          <!-- Sector 6 Field Guide & Exploration POIs -->
          <div class="bg-stone-950/40 border border-stone-800/80 rounded-xl p-4">
            <h4 class="text-xs font-bold uppercase tracking-wider text-stone-300 mb-2 flex items-center gap-2">
              <span>🗺️</span> Sector 6 Exploration Guide & Interactive POIs
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-[11px] text-stone-300">
              <div class="p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                <div class="font-bold text-amber-400 flex items-center gap-1.5 mb-1">
                  <span>📻</span> North Silo Radio Terminal
                </div>
                <p class="text-stone-400">Contains Generator #1. Press [E] to hack terminal and pulse-scan the sector to reveal the Butcher.</p>
              </div>

              <div class="p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                <div class="font-bold text-emerald-400 flex items-center gap-1.5 mb-1">
                  <span>🌿</span> Greenhouse & Camo Brambles
                </div>
                <p class="text-stone-400">Contains Generator #2. Step into dense bramble bushes to enter stealth camo (invisible to hounds).</p>
              </div>

              <div class="p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                <div class="font-bold text-sky-400 flex items-center gap-1.5 mb-1">
                  <span>☣️</span> Drainage Culvert Canal
                </div>
                <p class="text-stone-400">Contains Generator #3. Slime canal slows land animals by 40%, but Ducks gain +25% sprint.</p>
              </div>

              <div class="p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                <div class="font-bold text-rose-400 flex items-center gap-1.5 mb-1">
                  <span>📦</span> Sector 6 Supply Crates
                </div>
                <p class="text-stone-400">Searchable loot crates [E] containing Adrenaline Syringes, Smoke Bombs, and Salt Wards.</p>
              </div>

              <div class="p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                <div class="font-bold text-purple-400 flex items-center gap-1.5 mb-1">
                  <span>🔮</span> Central Containment Altar
                </div>
                <p class="text-stone-400">Sacrificial hub. Reviving downed allies near the Altar cleanses Marks (-1) and awards score bonuses.</p>
              </div>

              <div class="p-2.5 rounded-lg bg-stone-900 border border-stone-800">
                <div class="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                  <span>🚪</span> South Blast Evacuation Gate
                </div>
                <p class="text-stone-400">Quarantine exit. Unlocked when all 3 generators are repaired in Lockdown mode or when the round ends.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between px-6 py-3 bg-stone-950 border-t border-stone-800 text-xs text-stone-400">
          <span>Active Mode: <strong id="footer-active-mode" class="text-sky-400">Sector 6: Classic Hunt</strong></span>
          <button id="mode-confirm-btn" class="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold transition-all shadow-md cursor-pointer">
            Return to Sector 6
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Close handlers
    this.container.querySelector('#mode-close-btn')?.addEventListener('click', () => this.close());
    this.container.querySelector('#mode-confirm-btn')?.addEventListener('click', () => this.close());

    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) this.close();
    });

    this.render();
  }

  public open(
    currentMode: GameModeId = 'classic',
    currentWeather: WeatherType = 'twilight',
    onSelectMode?: (modeId: GameModeId) => void,
    onSelectWeather?: (weather: WeatherType) => void
  ) {
    this.currentMode = currentMode;
    this.currentWeather = currentWeather;
    if (onSelectMode) this.onSelectModeCallback = onSelectMode;
    if (onSelectWeather) this.onSelectWeatherCallback = onSelectWeather;

    this.createDom();
    this.render();

    if (this.container) {
      this.container.style.display = 'flex';
      this.container.classList.remove('opacity-0', 'pointer-events-none');
      this.container.classList.add('opacity-100', 'pointer-events-auto');
      this.isOpen = true;
    }
  }

  public close() {
    if (this.container) {
      this.container.classList.add('opacity-0', 'pointer-events-none');
      this.container.classList.remove('opacity-100', 'pointer-events-auto');
      this.container.style.display = 'none';
      this.isOpen = false;
    }
  }

  public toggle(
    currentMode: GameModeId,
    currentWeather: WeatherType,
    onSelectMode?: (modeId: GameModeId) => void,
    onSelectWeather?: (weather: WeatherType) => void
  ) {
    if (this.isOpen) {
      this.close();
    } else {
      this.open(currentMode, currentWeather, onSelectMode, onSelectWeather);
    }
  }

  private render() {
    if (!this.container) return;

    // Render Mode Cards
    const cardsContainer = this.container.querySelector('#mode-cards-container');
    if (cardsContainer) {
      cardsContainer.innerHTML = Object.values(GAME_MODES)
        .map((mode) => {
          const isSelected = mode.id === this.currentMode;
          return `
            <div data-mode-id="${mode.id}" class="mode-card flex flex-col justify-between p-4 rounded-xl border transition-all cursor-pointer ${
            isSelected
              ? 'bg-sky-950/40 border-sky-400 ring-2 ring-sky-400/30'
              : 'bg-stone-950/50 border-stone-800 hover:border-stone-700 hover:bg-stone-900/60'
          }">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-2xl">${mode.icon}</span>
                  <span class="text-[9px] font-mono font-bold px-2 py-0.5 rounded ${
                    isSelected ? 'bg-sky-500 text-stone-950' : 'bg-stone-800 text-stone-400'
                  }">
                    ${mode.badge}
                  </span>
                </div>
                <h4 class="font-bold text-sm text-stone-100 mb-0.5">${mode.name}</h4>
                <p class="text-[11px] text-stone-400 mb-3">${mode.tagline}</p>
                <div class="space-y-1 text-[10px] text-stone-300 font-mono mb-3">
                  ${mode.rules.slice(0, 3).map((r) => `<div class="flex items-center gap-1.5"><span class="text-sky-400">•</span><span>${r}</span></div>`).join('')}
                </div>
              </div>
              <button class="w-full py-1.5 rounded-lg text-xs font-bold transition-all ${
                isSelected
                  ? 'bg-sky-500 text-stone-950'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-200'
              }">
                ${isSelected ? '✓ ACTIVE MODE' : 'SELECT MODE'}
              </button>
            </div>
          `;
        })
        .join('');

      cardsContainer.querySelectorAll('.mode-card').forEach((card) => {
        card.addEventListener('click', () => {
          const id = card.getAttribute('data-mode-id') as GameModeId;
          if (id) {
            this.currentMode = id;
            if (this.onSelectModeCallback) this.onSelectModeCallback(id);
            this.render();
          }
        });
      });
    }

    // Render Weather Buttons
    const weatherContainer = this.container.querySelector('#weather-cards-container');
    if (weatherContainer) {
      weatherContainer.innerHTML = Object.values(WEATHER_TYPES)
        .map((w) => {
          const isSelected = w.id === this.currentWeather;
          return `
            <button data-weather-id="${w.id}" class="weather-btn flex flex-col items-center p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
            isSelected
              ? 'bg-amber-500/20 border-amber-400 text-amber-200 ring-2 ring-amber-400/20'
              : 'bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700 hover:bg-stone-800'
          }">
              <span class="text-xl mb-1">${w.icon}</span>
              <span class="text-[11px] font-bold leading-tight mb-1">${w.name.split(' ')[0]}</span>
              <span class="text-[9px] text-stone-400 font-mono leading-tight">${w.effectSummary.slice(0, 35)}...</span>
            </button>
          `;
        })
        .join('');

      weatherContainer.querySelectorAll('.weather-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-weather-id') as WeatherType;
          if (id) {
            this.currentWeather = id;
            if (this.onSelectWeatherCallback) this.onSelectWeatherCallback(id);
            this.render();
          }
        });
      });
    }

    // Update Footer Text
    const footerText = this.container.querySelector('#footer-active-mode');
    if (footerText) {
      footerText.textContent = GAME_MODES[this.currentMode]?.name || 'Classic Hunt';
    }
  }
}

export const gameModeModal = new GameModeModal();
