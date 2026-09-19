/**
 * MobileControls.ts
 * Dedicated Mobile On-Screen Controls for Farm Fatale:
 * - Left Thumb: Dynamic Virtual Thumbstick & Tactile D-Pad with full lower-left touch zone
 * - Right Thumb: Ergonomic Action Cluster (Ability [Q], Betrayal/Revive [E], Dash/Snare [SPACE], Species Voice [V], Emotes [T], Headbutt [G], Consumables [1 & 2])
 * - Top Mobile Quick Bar: Menu & Ranks
 * - Adaptive layout: Fully optimized for both Portrait and Landscape mobile screens
 */
export class MobileControls {
  private container: HTMLDivElement | null = null;
  private joystickBase: HTMLDivElement | null = null;
  private joystickThumb: HTMLDivElement | null = null;
  private touchZone: HTMLDivElement | null = null;
  private activeTouchId: number | null = null;
  private joystickCenterX: number = 0;
  private joystickCenterY: number = 0;
  private maxRadius: number = 42;
  private isVisible: boolean = false;

  // Current normalized movement vector (-1 to 1)
  public moveVector = { dx: 0, dy: 0 };

  constructor() {
    this.createDom();
    this.setupJoystickEvents();
    this.setupActionEvents();
    this.setupVisibilityListeners();
  }

  public show() {
    if (!this.container) return;
    this.isVisible = true;
    this.container.style.display = 'block';
    this.container.classList.remove('opacity-0', 'pointer-events-none');
    this.container.classList.add('opacity-100');
  }

  public hide() {
    if (!this.container) return;
    this.isVisible = false;
    this.container.classList.add('opacity-0', 'pointer-events-none');
    this.container.classList.remove('opacity-100');
    this.container.style.display = 'none';
    this.resetJoystick();
  }

  private setupVisibilityListeners() {
    // Hide controls when Main Menu is open; show when closed and in match
    window.addEventListener('HOME_MENU_OPEN', () => {
      this.hide();
    });

    window.addEventListener('HOME_MENU_CLOSE', () => {
      this.show();
    });

    window.addEventListener('START_SOLO_MODE', () => {
      this.show();
    });

    window.addEventListener('START_LIVE_MODE', () => {
      this.show();
    });

    window.addEventListener('resize', () => this.checkVisibility());
    window.addEventListener('orientationchange', () => this.checkVisibility());
  }

  private checkVisibility() {
    if (!this.container) return;
    // Keep visible if match is active
    if (this.isVisible) {
      this.container.style.display = 'block';
    }
  }

  private createDom() {
    if (document.getElementById('farm-mobile-controls')) return;

    this.container = document.createElement('div');
    this.container.id = 'farm-mobile-controls';
    this.container.style.display = 'none'; // Initially hidden until match starts
    this.container.className =
      'fixed inset-0 z-40 pointer-events-none select-none font-sans overflow-hidden transition-opacity duration-200';

    this.container.innerHTML = `
      <!-- Top Mobile Header Quick Bar (Compact) -->
      <div class="absolute top-2.5 left-2.5 pointer-events-auto flex items-center gap-2">
        <button id="mob-btn-menu" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900/90 border border-amber-500/60 text-amber-300 text-xs font-black shadow-lg backdrop-blur-md active:scale-90 transition-transform cursor-pointer">
          <span class="text-sm">🏠</span>
          <span>MENU</span>
        </button>
        <button id="mob-btn-ranks" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900/90 border border-purple-500/60 text-purple-300 text-xs font-black shadow-lg backdrop-blur-md active:scale-90 transition-transform cursor-pointer">
          <span class="text-sm">🏆</span>
          <span>RANKS</span>
        </button>
      </div>

      <!-- LEFT TOUCH ZONE: Touch anywhere on lower-left to steer -->
      <div id="mob-touch-zone" class="absolute bottom-0 left-0 w-[50vw] h-[55vh] pointer-events-auto select-none touch-none z-10"></div>

      <!-- LEFT: Virtual Thumbstick & Directional D-Pad -->
      <div class="absolute bottom-3 left-3 sm:bottom-6 sm:left-6 pointer-events-auto flex flex-col items-center select-none touch-none z-20">
        <div id="mob-joystick-base" class="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-stone-950/80 border-2 border-stone-600/90 backdrop-blur-md shadow-2xl flex items-center justify-center touch-none">
          <!-- D-Pad Directional Arrows background -->
          <div id="mob-dir-up" class="absolute top-1 text-stone-500 font-black text-xs cursor-pointer select-none">▲</div>
          <div id="mob-dir-down" class="absolute bottom-1 text-stone-500 font-black text-xs cursor-pointer select-none">▼</div>
          <div id="mob-dir-left" class="absolute left-1.5 text-stone-500 font-black text-xs cursor-pointer select-none">◄</div>
          <div id="mob-dir-right" class="absolute right-1.5 text-stone-500 font-black text-xs cursor-pointer select-none">►</div>
          <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full border border-stone-700/80"></div>

          <!-- Dynamic Thumb Knob -->
          <div id="mob-joystick-thumb" class="absolute w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 border-2 border-amber-300 shadow-xl shadow-amber-950/80 flex items-center justify-center text-stone-950 font-black text-base transform transition-transform ease-out duration-75">
            🐾
          </div>
        </div>
        <span class="mt-0.5 text-[9px] font-mono font-bold text-stone-400 tracking-wider">MOVE / RUN</span>
      </div>

      <!-- RIGHT: Ergonomic Action Buttons Cluster -->
      <div class="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 pointer-events-auto select-none touch-none flex flex-col items-end gap-1.5 z-20">
        <!-- Top Row: Consumables & Utility -->
        <div class="flex items-center gap-1.5 mb-0.5">
          <button id="mob-btn-item1" class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-stone-900/90 border border-stone-600 text-stone-200 text-[11px] font-mono font-bold shadow-lg active:scale-85 active:bg-amber-500 active:text-stone-950 transition-all flex items-center justify-center cursor-pointer" title="Use Item 1">
            🎒 1
          </button>
          <button id="mob-btn-item2" class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-stone-900/90 border border-stone-600 text-stone-200 text-[11px] font-mono font-bold shadow-lg active:scale-85 active:bg-amber-500 active:text-stone-950 transition-all flex items-center justify-center cursor-pointer" title="Use Item 2">
            🎒 2
          </button>
          <button id="mob-btn-headbutt" class="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-stone-900/90 border border-orange-500/60 text-orange-300 text-xs font-bold shadow-lg active:scale-85 active:bg-orange-500 active:text-stone-950 transition-all flex flex-col items-center justify-center cursor-pointer" title="Headbutt [G]">
            <span class="text-xs sm:text-sm">💥</span>
            <span class="text-[7px] sm:text-[8px] font-mono leading-none">RAM</span>
          </button>
          <button id="mob-btn-emote" class="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-stone-900/90 border border-purple-500/60 text-purple-300 text-xs font-bold shadow-lg active:scale-85 active:bg-purple-500 active:text-stone-950 transition-all flex flex-col items-center justify-center cursor-pointer" title="Emote Wheel [T]">
            <span class="text-xs sm:text-sm">💬</span>
            <span class="text-[7px] sm:text-[8px] font-mono leading-none">EMOTE</span>
          </button>
        </div>

        <!-- Main Action Grid (Compact & Ergonomic) -->
        <div class="grid grid-cols-2 gap-2 items-end">
          <!-- Voice PTT Call Button [V] -->
          <button id="mob-btn-voice" class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-stone-900/95 border-2 border-emerald-500/70 text-emerald-300 shadow-lg shadow-emerald-950/50 active:scale-90 active:bg-emerald-500 active:text-stone-950 transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer touch-none">
            <span class="text-lg sm:text-xl">🔊</span>
            <span class="text-[8px] sm:text-[9px] font-mono font-black tracking-wider leading-none">CALL [V]</span>
          </button>

          <!-- Dash / Snare Button [SPACE] -->
          <button id="mob-btn-space" class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-stone-900/95 border-2 border-sky-500/70 text-sky-300 shadow-lg shadow-sky-950/50 active:scale-90 active:bg-sky-500 active:text-stone-950 transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer touch-none">
            <span class="text-lg sm:text-xl">⚡</span>
            <span class="text-[8px] sm:text-[9px] font-mono font-black tracking-wider leading-none">DASH</span>
          </button>

          <!-- Betrayal / Revive Button [E] -->
          <button id="mob-btn-betray" class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-stone-900/95 border-2 border-red-500/80 text-red-300 shadow-xl shadow-red-950/60 active:scale-90 active:bg-red-600 active:text-white transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer touch-none">
            <span class="text-xl sm:text-2xl">🩸</span>
            <span class="text-[9px] sm:text-[10px] font-mono font-black tracking-wider leading-none">BETRAY</span>
            <span class="text-[7px] sm:text-[8px] font-mono text-red-400/80 leading-none">/ REVIVE</span>
          </button>

          <!-- Primary Ability Button [Q] (Primary highlight) -->
          <button id="mob-btn-ability" class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 border-2 border-amber-300 text-stone-950 shadow-xl shadow-amber-950/80 active:scale-90 active:bg-amber-400 transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer touch-none font-black">
            <span class="text-xl sm:text-2xl">⚔️</span>
            <span class="text-[9px] sm:text-[10px] font-mono font-black tracking-wider leading-none">ABILITY</span>
            <span class="text-[7px] sm:text-[8px] font-mono text-stone-900 font-bold leading-none">[Q]</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    this.joystickBase = this.container.querySelector('#mob-joystick-base');
    this.joystickThumb = this.container.querySelector('#mob-joystick-thumb');
    this.touchZone = this.container.querySelector('#mob-touch-zone');
  }

  private setupJoystickEvents() {
    if (!this.joystickBase || !this.joystickThumb) return;

    const base = this.joystickBase;
    const touchZone = this.touchZone || base;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      this.activeTouchId = touch.identifier;

      const rect = base.getBoundingClientRect();
      this.joystickCenterX = rect.left + rect.width / 2;
      this.joystickCenterY = rect.top + rect.height / 2;

      this.updateJoystickPosition(touch.clientX, touch.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.activeTouchId) {
          e.preventDefault();
          this.updateJoystickPosition(touch.clientX, touch.clientY);
          break;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.activeTouchId) {
          this.activeTouchId = null;
          this.resetJoystick();
          break;
        }
      }
    };

    base.addEventListener('touchstart', onTouchStart, { passive: false });
    touchZone.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // Mouse drag support for desktop/responsive simulators
    let isMouseDown = false;
    const onMouseDown = (e: MouseEvent) => {
      isMouseDown = true;
      const rect = base.getBoundingClientRect();
      this.joystickCenterX = rect.left + rect.width / 2;
      this.joystickCenterY = rect.top + rect.height / 2;
      this.updateJoystickPosition(e.clientX, e.clientY);
    };

    base.addEventListener('mousedown', onMouseDown);
    touchZone.addEventListener('mousedown', onMouseDown);

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (isMouseDown) {
        this.updateJoystickPosition(e.clientX, e.clientY);
      }
    });

    window.addEventListener('mouseup', () => {
      if (isMouseDown) {
        isMouseDown = false;
        this.resetJoystick();
      }
    });

    // D-Pad direction click/tap handlers
    this.setupDpadClicks();
  }

  private setupDpadClicks() {
    if (!this.container) return;

    const setDir = (dx: number, dy: number) => {
      this.moveVector.dx = dx;
      this.moveVector.dy = dy;
      this.highlightDirections(dx * 20, dy * 20);
      window.dispatchEvent(
        new CustomEvent('MOBILE_MOVE_UPDATE', {
          detail: { dx, dy },
        })
      );
    };

    const dirs: { id: string; dx: number; dy: number }[] = [
      { id: '#mob-dir-up', dx: 0, dy: -1 },
      { id: '#mob-dir-down', dx: 0, dy: 1 },
      { id: '#mob-dir-left', dx: -1, dy: 0 },
      { id: '#mob-dir-right', dx: 1, dy: 0 },
    ];

    dirs.forEach(({ id, dx, dy }) => {
      const el = this.container?.querySelector(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        setDir(dx, dy);
      });
      el.addEventListener('touchend', () => {
        this.resetJoystick();
      });
      el.addEventListener('mousedown', () => {
        setDir(dx, dy);
      });
      el.addEventListener('mouseup', () => {
        this.resetJoystick();
      });
    });
  }

  private updateJoystickPosition(clientX: number, clientY: number) {
    if (!this.joystickThumb || !this.joystickBase) return;

    let deltaX = clientX - this.joystickCenterX;
    let deltaY = clientY - this.joystickCenterY;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance > this.maxRadius) {
      deltaX = (deltaX / distance) * this.maxRadius;
      deltaY = (deltaY / distance) * this.maxRadius;
    }

    // Move visual thumb
    this.joystickThumb.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

    // Calculate normalized movement vector
    const normDistance = Math.min(distance / this.maxRadius, 1);
    const angle = Math.atan2(deltaY, deltaX);

    // Dead zone
    if (normDistance < 0.12) {
      this.moveVector.dx = 0;
      this.moveVector.dy = 0;
    } else {
      this.moveVector.dx = Math.cos(angle) * normDistance;
      this.moveVector.dy = Math.sin(angle) * normDistance;
    }

    // Update D-Pad direction arrows highlight
    this.highlightDirections(deltaX, deltaY);

    // Dispatch move event
    window.dispatchEvent(
      new CustomEvent('MOBILE_MOVE_UPDATE', {
        detail: { dx: this.moveVector.dx, dy: this.moveVector.dy },
      })
    );
  }

  private highlightDirections(dx: number, dy: number) {
    if (!this.container) return;
    const threshold = 10;

    const upEl = this.container.querySelector('#mob-dir-up');
    const downEl = this.container.querySelector('#mob-dir-down');
    const leftEl = this.container.querySelector('#mob-dir-left');
    const rightEl = this.container.querySelector('#mob-dir-right');

    if (upEl) upEl.className = dy < -threshold ? 'absolute top-1 text-amber-400 font-black text-sm scale-125 transition-transform' : 'absolute top-1 text-stone-500 font-black text-xs';
    if (downEl) downEl.className = dy > threshold ? 'absolute bottom-1 text-amber-400 font-black text-sm scale-125 transition-transform' : 'absolute bottom-1 text-stone-500 font-black text-xs';
    if (leftEl) leftEl.className = dx < -threshold ? 'absolute left-1.5 text-amber-400 font-black text-sm scale-125 transition-transform' : 'absolute left-1.5 text-stone-500 font-black text-xs';
    if (rightEl) rightEl.className = dx > threshold ? 'absolute right-1.5 text-amber-400 font-black text-sm scale-125 transition-transform' : 'absolute right-1.5 text-stone-500 font-black text-xs';
  }

  private resetJoystick() {
    if (!this.joystickThumb) return;
    this.joystickThumb.style.transform = 'translate(0px, 0px)';
    this.moveVector.dx = 0;
    this.moveVector.dy = 0;
    this.highlightDirections(0, 0);

    window.dispatchEvent(
      new CustomEvent('MOBILE_MOVE_UPDATE', {
        detail: { dx: 0, dy: 0 },
      })
    );
  }

  private setupActionEvents() {
    if (!this.container) return;

    // Ability [Q]
    const btnAbility = this.container.querySelector('#mob-btn-ability');
    btnAbility?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_Q'));
    });
    btnAbility?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_Q'));
    });

    // Betrayal / Revive [E]
    const btnBetray = this.container.querySelector('#mob-btn-betray');
    btnBetray?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_E'));
    });
    btnBetray?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_E'));
    });

    // Dash / Snare [SPACE]
    const btnSpace = this.container.querySelector('#mob-btn-space');
    btnSpace?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_SPACE'));
    });
    btnSpace?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_SPACE'));
    });

    // Voice PTT [V]
    const btnVoice = this.container.querySelector('#mob-btn-voice');
    btnVoice?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_V_DOWN'));
    });
    btnVoice?.addEventListener('touchend', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_V_UP'));
    });
    btnVoice?.addEventListener('mousedown', () => {
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_V_DOWN'));
    });
    btnVoice?.addEventListener('mouseup', () => {
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_V_UP'));
    });

    // Emotes [T]
    this.container.querySelector('#mob-btn-emote')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_T'));
    });

    // Headbutt [G]
    this.container.querySelector('#mob-btn-headbutt')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_G'));
    });

    // Item 1
    this.container.querySelector('#mob-btn-item1')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_ITEM_1'));
    });

    // Item 2
    this.container.querySelector('#mob-btn-item2')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('MOBILE_ACTION_ITEM_2'));
    });

    // Menu button
    this.container.querySelector('#mob-btn-menu')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('TOGGLE_HOME_MENU_MODAL'));
    });

    // Ranks button
    this.container.querySelector('#mob-btn-ranks')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('TOGGLE_LEADERBOARD_MODAL'));
    });
  }
}

export const mobileControls = new MobileControls();
