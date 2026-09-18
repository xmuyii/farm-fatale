export class VoiceConsentModal {
  private container: HTMLDivElement | null = null;
  private onDecisionCallback?: (granted: boolean) => void;

  constructor() {
    this.createDom();
  }

  private createDom() {
    if (document.getElementById('farm-voice-consent-modal')) return;

    this.container = document.createElement('div');
    this.container.id = 'farm-voice-consent-modal';
    this.container.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm opacity-0 pointer-events-none transition-all duration-200';

    this.container.innerHTML = `
      <div class="relative w-full max-w-md bg-stone-900 border border-stone-700/80 rounded-2xl shadow-2xl p-6 font-sans text-stone-100 flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-2xl">
            🎙️
          </div>
          <div>
            <h3 class="font-black text-base text-stone-100">ENABLE ANIMAL VOICE CHAT?</h3>
            <span class="text-xs text-sky-400 font-mono">OPTIONAL PROXIMITY MICROPHONE</span>
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-stone-950/70 border border-stone-800 text-xs text-stone-300 space-y-2 leading-relaxed">
          <p>
            Farm Fatale features an immersive acoustic stealth mechanic. If enabled, your push-to-talk microphone audio triggers your species sound:
          </p>
          <ul class="list-disc list-inside text-stone-400 space-y-1">
            <li><strong>Animal Filter:</strong> Your voice is translated into your animal species sound (Chicken "Bawk!", Pig "Oink!").</li>
            <li><strong>Parrot Exception:</strong> Only the Parrot speaks human sentences!</li>
            <li><strong>Stealth:</strong> Audio radiates in proximity and alerts the Butcher if spammed.</li>
            <li><strong>Mute:</strong> Always toggleable with the Mute button or [C] key.</li>
          </ul>
        </div>

        <div class="flex items-center gap-3 mt-2">
          <button id="voice-decline-btn" class="flex-1 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs transition-colors cursor-pointer">
            Decline (Use Keyboard Sounds)
          </button>
          <button id="voice-accept-btn" class="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-lg shadow-sky-600/30">
            Accept & Enable Mic
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    this.container.querySelector('#voice-accept-btn')?.addEventListener('click', () => {
      this.close();
      if (this.onDecisionCallback) this.onDecisionCallback(true);
    });

    this.container.querySelector('#voice-decline-btn')?.addEventListener('click', () => {
      this.close();
      if (this.onDecisionCallback) this.onDecisionCallback(false);
    });
  }

  open(onDecision: (granted: boolean) => void) {
    this.onDecisionCallback = onDecision;
    this.createDom();
    if (!this.container) return;
    this.container.classList.remove('opacity-0', 'pointer-events-none');
    this.container.classList.add('opacity-100');
  }

  close() {
    if (!this.container) return;
    this.container.classList.remove('opacity-100');
    this.container.classList.add('opacity-0', 'pointer-events-none');
  }
}

export const voiceConsentModal = new VoiceConsentModal();
