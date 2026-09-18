/**
 * MobileControls.ts
 * Dedicated Mobile First On-Screen Controls for Farm Fatale:
 * - Left Thumb: Virtual Analog Joystick & Tactile D-Pad with touch-drag tracking
 * - Right Thumb: Action Cluster (Ability [Q], Betrayal/Revive [E], Dash/Snare [SPACE], Species Voice [V], Emotes [T], Headbutt [G], Consumables [1 & 2])
 * - Top Mobile Quick Bar: Menu & Ranks
 */
export class MobileControls {
  private container: HTMLDivElement | null = null;
  private joystickBase: HTMLDivElement | null = null;
  private joystickThumb: HTMLDivElement | null = null;
  private activeTouchId: number | null = null;
  private joystickCenterX: number = 0;
  private joystickCenterY: number = 0;
  private maxRadius: number = 48;
  private isVisible: boolean = true;

  // Current normalized movement vector (-1 to 1)
  public moveVector = { dx: 0, dy: 0 };

  constructor() {
    this.createDom();
    this.setupJoystickEvents();
    this.setupActionEvents();
    this.checkVisibility();

    window.addEventListener('resize', () => this.checkVisibility());
    window.addEventListener('orientationchange', () => this.checkVisibility());
  }

  private checkVisibility() {
    if (!this.container) return;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 1024;
    // Show on touch devices or small screens
    if (isTouch) {
      this.container.classList.remove('hidden');
    } else {
      // In non-touch desktop, keep available or hide
      this.container.classList.remove('hidden'); // allow desktop touch simulators
    }
  }

  private createDom() {
    if (document.getElementById('farm-mobile-controls')) return;

    this.container = document.createElement('div');
    this.container.id = 'farm-mobile-controls';
    this.container.className =
      'fixed inset-0 z-40 pointer-events-none select-none font-sans overflow-hidden';

    this.container.innerHTML = `
      <!-- Top Mobile Header Quick Bar (Compact) -->
      <div class="absolute top-3 left-3 pointer-events-auto flex items-center gap-2">
        <button id="mob-btn-menu" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900/90 border border-amber-500/50 text-amber-300 text-xs font-black shadow-lg backdrop-blur active:scale-90 transition-transform cursor-pointer">
          <span class="text-sm">🏠</span>
          <span>MENU</span>
        </button>
        <button id="mob-btn-ranks" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900/90 border border-purple-500/50 text-purple-300 text-xs font-black shadow-lg backdrop-blur active:scale-90 transition-transform cursor-pointer">
          <span class="text-sm">🏆</span>
          <span>RANKS</span>
        </button>
      </div>

      <!-- LEFT: Virtual Thumbstick & Directional D-Pad -->
      <div class="absolute bottom-4 left-4 pointer-events-auto flex flex-col items-center select-none touch-none">
        <div id="mob-joystick-base" class="relative w-36 h-36 rounded-full bg-stone-950/70 border-2 border-stone-700/80 backdrop-blur-md shadow-2xl flex items-center justify-center touch-none">
          <!-- D-Pad Directional Arrows background -->
          <div id="mob-dir-up" class="absolute top-1.5 text-stone-500 font-black text-xs">▲</div>
          <div id="mob-dir-down" class="absolute bottom-1.5 text-stone-500 font-black text-xs">▼</div>
          <div id="mob-dir-left" class="absolute left-2 text-stone-500 font-black text-xs">◄</div>
          <div id="mob-dir-right" class="absolute right-2 text-stone-500 font-black text-xs">►</div>
          <div class="w-20 h-20 rounded-full border border-stone-800/80"></div>

          <!-- Dynamic Thumb Knob -->
          <div id="mob-joystick-thumb" class="absolute w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 border-2 border-amber-300 shadow-xl shadow-amber-950/60 flex items-center justify-center text-stone-950 font-black text-xs transform transition-transform ease-out duration-75">
            🐾
          </div>
        </div>
        <span class="mt-1 text-[9px] font-mono font-bold text-stone-400 tracking-wider">MOVE / RUN</span>
      </div>

      <!-- RIGHT: Ergonomic Action Buttons Cluster -->
      <div class="absolute bottom-4 right-4 pointer-events-auto select-none touch-none flex flex-col items-end gap-2">
        <!-- Top Row: Consumables & Utility -->
        <div class="flex items-center gap-2 mb-1">
          <button id="mob-btn-item1" class="w-10 h-10 rounded-xl bg-stone-900/90 border border-stone-600 text-stone-200 text-xs font-mono font-bold shadow-lg active:scale-85 active:bg-amber-500 active:text-stone-950 transition-all flex items-center justify-center cursor-pointer" title="Use Item 1">
            🎒 1
          </button>
          <button id="mob-btn-item2" class="w-10 h-10 rounded-xl bg-stone-900/90 border border-stone-600 text-stone-200 text-xs font-mono font-bold shadow-lg active:scale-85 active:bg-amber-500 active:text-stone-950 transition-all flex items-center justify-center cursor-pointer" title="Use Item 2">
            🎒 2
          </button>
          <button id="mob-btn-headbutt" class="w-11 h-11 rounded-xl bg-stone-900/90 border border-orange-500/60 text-orange-300 text-xs font-bold shadow-lg active:scale-85 active:bg-orange-500 active:text-stone-950 transition-all flex flex-col items-center justify-center cursor-pointer" title="Headbutt [G]">
            <span class="text-sm">💥</span>
            <span class="text-[8px] font-mono leading-none">RAM</span>
          </button>
          <button id="mob-btn-emote" class="w-11 h-11 rounded-xl bg-stone-900/90 border border-purple-500/60 text-purple-300 text-xs font-bold shadow-lg active:scale-85 active:bg-purple-500 active:text-stone-950 transition-all flex flex-col items-center justify-center cursor-pointer" title="Emote Wheel [T]">
            <span class="text-sm">💬</span>
            <span class="text-[8px] font-mono leading-none">EMOTE</span>
          </button>
        </div>

        <!-- Main Action Grid -->
        <div class="grid grid-cols-2 gap-2.5 items-end">
          <!-- Voice PTT Call Button [V] -->
          <button id="mob-btn-voice" class="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-950/90 to-stone-900 border-2 border-emerald-500/70 text-emerald-300 shadow-xl shadow-emerald-950/50 active:scale-90 active:bg-emerald-500 active:text-stone-950 transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer touch-none">
            <span class="text-xl">🔊</span>
            <span class="text-[9px] font-mono font-black tracking-wider">CALL [V]</span>
          </button>

          <!-- Dash / Snare Button [SPACE] -->
          <button id="mob-btn-space" class="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-950/90 to-stone-900 border-2 border-sky-500/70 text-sky-300 shadow-xl shadow-sky-950/50 active:scale-90 active:bg-sky-500 active:text-stone-950 transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer touch-none">
            <span class="text-xl">⚡</span>
            <span class="text-[9px] font-mono font-black tracking-wider">DASH</span>
          </button>

          <!-- Betrayal / Revive Button [E] -->
          <button id="mob-btn-betray" class="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-950/95 to-stone-900 border-2 border-red-500/80 text-red-300 shadow-2xl shadow-red-950/60 active:scale-90 active:bg-red-600 active:text-white transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer touch-none">
            <span class="text-2xl">🩸</span>
            <span class="text-[10px] font-mono font-black tracking-wider leading-none">BETRAY</span>
            <span class="text-[8px] font-mono text-red-400/80 leading-none">/ REVIVE</span>
          </button>

          <!-- Primary Ability / Cleaver Button [Q] (Biggest Touch Target) -->
          <button id="mob-btn-ability" class="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 border-2 border-amber-300 text-stone-950 shadow-2xl shadow-amber-950/80 active:scale-90 active:bg-amber-400 transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer touch-none font-black">
            <span class="text-2xl">⚔️</span>
            <span class="text-[10px] font-mono font-black tracking-wider leading-none">ABILITY</span>
            <span class="text-[8px] font-mono text-stone-900 font-bold leading-none">[Q]</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    this.joystickBase = this.container.querySelector('#mob-joystick-base');
    this.joystickThumb = this.container.querySelector('#mob-joystick-thumb');
  }

  private setupJoystickEvents() {
    if (!this.joystickBase || !this.joystickThumb) return;

    const base = this.joystickBase;
    const thumb = this.joystickThumb;

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
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.activeTouchId) {
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
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // Also support mouse drag for testing in desktop responsive simulator
    let isMouseDown = false;
    base.addEventListener('mousedown', (e: MouseEvent) => {
      isMouseDown = true;
      const rect = base.getBoundingClientRect();
      this.joystickCenterX = rect.left + rect.width / 2;
      this.joystickCenterY = rect.top + rect.height / 2;
      this.updateJoystickPosition(e.clientX, e.clientY);
    });

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
    if (normDistance < 0.15) {
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
    const threshold = 14;
    const upEl = this.container.querySelector('#mob-dir-up');
    const downEl = this.container.querySelector('#mob-dir-down');
    const leftEl = this.container.querySelector('#mob-dir-left');
    const rightEl = this.container.querySelector('#mob-dir-right');

    if (upEl) upEl.className = dy < -threshold ? 'absolute top-1.5 text-amber-400 font-black text-xs scale-125' : 'absolute top-1.5 text-stone-500 font-black text-xs';
    if (downEl) downEl.className = dy > threshold ? 'absolute bottom-1.5 text-amber-400 font-black text-xs scale-125' : 'absolute bottom-1.5 text-stone-500 font-black text-xs';
    if (leftEl) leftEl.className = dx < -threshold ? 'absolute left-2 text-amber-400 font-black text-xs scale-125' : 'absolute left-2 text-stone-500 font-black text-xs';
    if (rightEl) rightEl.className = dx > threshold ? 'absolute right-2 text-amber-400 font-black text-xs scale-125' : 'absolute right-2 text-stone-500 font-black text-xs';
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
