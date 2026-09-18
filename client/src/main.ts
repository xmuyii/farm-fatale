import { createFarmGame } from './game/FarmGame.ts';
import { initializeUserProfile } from './network/supabase.ts';
import { leaderboardModal } from './ui/LeaderboardModal.ts';
import { gameModeModal } from './ui/GameModeModal.ts';
import { engagementHubModal } from './ui/EngagementHubModal.ts';
import { homeMenuModal } from './ui/HomeMenuModal.ts';
import { orientationLockOverlay } from './ui/OrientationLockOverlay.ts';
import { mobileControls } from './ui/MobileControls.ts';

let isBootstrapped = false;

export async function bootstrap() {
  if (isBootstrapped) return;
  isBootstrapped = true;

  console.log('[FarmFatale] Initializing mobile-first application...');

  // Initialize orientation lock overlay
  orientationLockOverlay.checkOrientation();

  // Ensure DOM container exists
  let container = document.getElementById('game-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'game-container';
    container.className = 'relative w-screen h-screen overflow-hidden bg-stone-900 select-none';
    document.body.appendChild(container);
  }

  // Safely initialize player identity via Telegram auth or isolated guest
  let profile = await initializeUserProfile();
  console.log('[FarmFatale] Active player:', profile.username, profile.is_telegram ? '(Telegram)' : '(Guest)');

  // Wire Home Menu Callbacks
  homeMenuModal.setCallbacks(
    (animal) => {
      window.dispatchEvent(new CustomEvent('START_SOLO_MODE', { detail: { animal } }));
    },
    (animal) => {
      window.dispatchEvent(new CustomEvent('START_LIVE_MODE', { detail: { animal } }));
    }
  );

  // Wire Mobile Quick Bar Global Events
  window.addEventListener('TOGGLE_HOME_MENU_MODAL', () => {
    homeMenuModal.toggle();
  });
  window.addEventListener('TOGGLE_LEADERBOARD_MODAL', () => {
    leaderboardModal.toggle();
  });

  // Add Responsive Top HUD Overlay
  const hud = document.createElement('div');
  hud.id = 'farm-top-hud';
  hud.className =
    'absolute top-2 sm:top-3 right-2 sm:right-3 z-30 flex items-center gap-2 bg-stone-900/90 border border-stone-700/80 backdrop-blur px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs shadow-2xl text-stone-200';

  const updateHudHtml = () => {
    hud.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <div class="flex flex-col">
          <div class="flex items-center gap-1">
            <span class="font-black text-amber-400 tracking-wider text-[11px] sm:text-xs">FARM FATALE</span>
            <span class="text-[8px] font-mono px-1 py-0.2 rounded bg-red-950 text-red-400 border border-red-800">SECTOR 6</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span id="hud-player-name" class="text-[10px] text-stone-300 font-bold font-mono truncate max-w-[100px] sm:max-w-none">${profile.username}</span>
            <span class="text-[8px] font-mono px-1.5 py-0.2 rounded-full bg-sky-950/80 border border-sky-600/60 text-sky-300 font-bold">
              ${profile.is_telegram ? 'TG AUTH' : 'SECURE'}
            </span>
          </div>
        </div>
        <span class="text-stone-600 hidden sm:inline">|</span>
        <button id="open-home-menu-btn" class="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer">
          <span>🏠</span>
          <span class="hidden sm:inline">Menu</span>
        </button>
        <button id="open-modes-btn" class="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 font-bold transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer">
          <span>🎮</span>
          <span>Modes</span>
        </button>
        <button id="open-engagement-btn" class="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer">
          <span>🦜</span>
          <span>Voice</span>
        </button>
        <button id="open-leaderboard-btn" class="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 font-bold text-xs transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer">
          <span>🏆</span>
          <span class="hidden sm:inline">Ranks</span>
        </button>
      </div>
    `;

    hud.querySelector('#open-home-menu-btn')?.addEventListener('click', () => {
      homeMenuModal.toggle();
    });

    hud.querySelector('#open-modes-btn')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('TOGGLE_GAME_MODES_MODAL'));
    });

    hud.querySelector('#open-engagement-btn')?.addEventListener('click', () => {
      engagementHubModal.toggle();
    });

    hud.querySelector('#open-leaderboard-btn')?.addEventListener('click', () => {
      leaderboardModal.toggle();
    });
  };

  updateHudHtml();
  document.body.appendChild(hud);

  // Mount Phaser 3 Game
  createFarmGame('game-container');

  // Open Home Menu initially on boot
  homeMenuModal.open();
}
