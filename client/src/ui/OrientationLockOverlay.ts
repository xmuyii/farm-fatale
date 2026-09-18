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

  private createDom() {
    if (document.getElementById('farm-orientation-lock-overlay')) return;

    this.container = document.createElement('div');
    this.container.id = 'farm-orientation-lock-overlay';
    this.container.className =
      'fixed inset-0 z-[999999] flex flex-col items-center justify-center p-6 bg-stone-950/95 backdrop-blur-xl text-stone-100 font-sans select-none transition-opacity duration-300 hidden';

    this.container.innerHTML = `
      <div class="max-w-xs sm:max-w-sm flex flex-col items-center text-center space-y-6">
        <!-- Animated Rotating Phone Graphic -->
        <div class="relative w-28 h-28 flex items-center justify-center">
          <div class="absolute inset-0 rounded-full bg-amber-500/10 animate-ping"></div>
          <div class="relative w-24 h-24 rounded-3xl bg-stone-900 border-2 border-amber-500/60 shadow-2xl shadow-amber-950 flex items-center justify-center overflow-hidden">
            <div id="rotating-phone-icon" class="text-4xl transition-transform duration-700 ease-in-out transform">
              📱
            </div>
            <span class="absolute bottom-2 w-6 h-1 rounded-full bg-stone-700"></span>
          </div>
          <!-- Curved rotation arrows -->
          <div class="absolute -top-1 -right-1 text-2xl animate-bounce">
            🔄
          </div>
        </div>

        <!-- Copy & Status -->
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/80 border border-red-800/80 text-red-300 font-mono text-[11px] font-bold">
            <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span>LANDSCAPE REQUIRED</span>
          </div>
          <h2 class="text-2xl font-black text-amber-400 font-mono tracking-wider">
            ROTATE YOUR PHONE
          </h2>
          <p class="text-xs sm:text-sm text-stone-300 leading-relaxed">
            Farm Fatale is built for tactical widescreen stealth. Rotate your device sideways to play with full on-screen controls.
          </p>
        </div>

        <!-- Fullscreen Lock Button -->
        <div class="w-full space-y-3 pt-2">
          <button id="lock-landscape-btn" class="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-sm tracking-wide shadow-xl shadow-amber-950/80 transition-all transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
            <span>📐</span>
            <span>ENTER LANDSCAPE FULLSCREEN</span>
          </button>
          <p class="text-[10px] text-stone-500 font-mono">Auto-rotates when device orientation switches</p>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Lock button event
    this.container.querySelector('#lock-landscape-btn')?.addEventListener('click', () => {
      this.requestLandscapeLock();
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

    if (isPortrait) {
      this.container.classList.remove('hidden');
      this.container.classList.remove('opacity-0');
      this.container.classList.add('opacity-100');

      // Animate the phone graphic tilting
      const phone = this.container.querySelector('#rotating-phone-icon');
      if (phone) {
        phone.classList.add('rotate-90');
      }
    } else {
      this.container.classList.add('opacity-0');
      setTimeout(() => {
        if (!this.isPortrait && this.container) {
          this.container.classList.add('hidden');
        }
      }, 250);
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
