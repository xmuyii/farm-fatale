/**
 * OrientationLockOverlay.ts
 * Enforces Landscape orientation for mobile users so they can play Farm Fatale properly.
 * Displays a sleek, animated guidance overlay in Portrait mode and provides a Fullscreen/Lock button.
 */
export class OrientationLockOverlay {
  private container: HTMLDivElement | null = null;
  private isPortrait: boolean = false;

  constructor() {
    this.createDom();
    this.setupListeners();
    this.checkOrientation();
  }

  private isDismissed: boolean = false;

  private createDom() {
    if (document.getElementById('farm-orientation-lock-overlay')) return;

    this.container = document.createElement('div');
    this.container.id = 'farm-orientation-lock-overlay';
    this.container.style.display = 'none';
    this.container.className =
      'fixed inset-0 z-[99999] flex flex-col items-center justify-center p-6 bg-stone-950/90 backdrop-blur-xl text-stone-100 font-sans select-none transition-opacity duration-300';

    this.container.innerHTML = `
      <div class="max-w-xs sm:max-w-sm flex flex-col items-center text-center space-y-5 bg-stone-900/90 p-6 rounded-3xl border border-stone-700 shadow-2xl">
        <!-- Animated Rotating Phone Graphic -->
        <div class="relative w-20 h-20 flex items-center justify-center">
          <div class="absolute inset-0 rounded-full bg-amber-500/10 animate-ping"></div>
          <div class="relative w-18 h-18 rounded-2xl bg-stone-800 border-2 border-amber-500/60 shadow-xl flex items-center justify-center">
            <div id="rotating-phone-icon" class="text-3xl">
              📱
            </div>
          </div>
        </div>

        <!-- Copy & Status -->
        <div class="space-y-1.5">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-800 text-amber-300 font-mono text-[10px] font-bold">
            <span>TIP: WIDESCREEN RECOMMENDED</span>
          </div>
          <h2 class="text-xl font-black text-amber-400 font-mono tracking-wider">
            LANDSCAPE SUGGESTED
          </h2>
          <p class="text-xs text-stone-300 leading-relaxed">
            Rotate your phone sideways for the best field of view and wider thumb controls.
          </p>
        </div>

        <!-- Buttons -->
        <div class="w-full space-y-2 pt-1">
          <button id="lock-landscape-btn" class="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs tracking-wide shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
            <span>📐</span>
            <span>SWITCH TO LANDSCAPE</span>
          </button>
          <button id="dismiss-portrait-btn" class="w-full py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs transition-all active:scale-95 cursor-pointer">
            Continue in Portrait Mode
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Lock button event
    this.container.querySelector('#lock-landscape-btn')?.addEventListener('click', () => {
      this.requestLandscapeLock();
    });

    // Dismiss button event
    this.container.querySelector('#dismiss-portrait-btn')?.addEventListener('click', () => {
      this.isDismissed = true;
      if (this.container) this.container.style.display = 'none';
    });
  }

  private setupListeners() {
    window.addEventListener('resize', () => this.checkOrientation());
    window.addEventListener('orientationchange', () => this.checkOrientation());
    if (screen.orientation) {
      screen.orientation.addEventListener('change', () => this.checkOrientation());
    }
  }

  public checkOrientation() {
    if (!this.container) return;

    // Detect if device screen is in Portrait mode
    const isTouchOrMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 1024;
    const isPortrait = isTouchOrMobile && window.innerHeight > window.innerWidth;

    this.isPortrait = isPortrait;

    if (isPortrait && !this.isDismissed) {
      this.container.style.display = 'flex';
      this.container.classList.remove('opacity-0');
      this.container.classList.add('opacity-100');
    } else {
      this.container.classList.add('opacity-0');
      this.container.style.display = 'none';
    }
  }

  public async requestLandscapeLock() {
    try {
      // 1. Try Fullscreen
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }

      // 2. Try Screen Orientation Lock API
      if (screen.orientation && 'lock' in screen.orientation) {
        await (screen.orientation as any).lock('landscape').catch(() => {});
      }
    } catch (err) {
      console.log('[OrientationLock] Orientation lock fallback:', err);
    }
    this.checkOrientation();
  }
}

export const orientationLockOverlay = new OrientationLockOverlay();
