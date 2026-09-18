import {
  fetchLeaderboard,
  getLeaderboardCacheAge,
  getPersonalBests,
  LeaderboardEntry,
  PersonalBests,
} from '../network/supabase.ts';

const ANIMAL_EMOJIS: Record<string, string> = {
  chicken: '🐔',
  pig: '🐷',
  goat: '🐐',
  sheep: '🐑',
  cow: '🐮',
  horse: '🐴',
  duck: '🦆',
  butcher: '🩸',
};

type LeaderboardTab = 'daily' | 'weekly' | 'all-time' | 'personal';

export class LeaderboardModal {
  private container: HTMLDivElement | null = null;
  private currentTab: LeaderboardTab = 'daily';
  private isOpen: boolean = false;
  private isLoading: boolean = false;
  private entries: LeaderboardEntry[] = [];
  private personalBests: PersonalBests | null = null;
  private autoRefreshInterval: any = null;

  constructor() {
    this.createDom();
  }

  private createDom() {
    if (document.getElementById('farm-leaderboard-modal')) return;

    this.container = document.createElement('div');
    this.container.id = 'farm-leaderboard-modal';
    this.container.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md opacity-0 pointer-events-none transition-all duration-200';
    this.container.innerHTML = `
      <div class="relative w-full max-w-3xl max-h-[85vh] flex flex-col bg-stone-900 border border-stone-700/80 rounded-2xl shadow-2xl overflow-hidden font-sans text-stone-100">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 bg-stone-950/60 border-b border-stone-800">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl">
              🏆
            </div>
            <div>
              <h2 class="text-lg font-black tracking-wide text-stone-100 flex items-center gap-2">
                FARM FATALE LEADERBOARDS
                <span class="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">TOP 50</span>
              </h2>
              <p class="text-xs text-stone-400">Authoritative competitive stats synchronized with Supabase</p>
            </div>
          </div>
          <button id="lb-close-btn" class="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white flex items-center justify-center font-mono text-sm transition-colors">
            ✕
          </button>
        </div>

        <!-- Tab Controls & Cache Indicator -->
        <div class="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-stone-900/90 border-b border-stone-800 text-xs">
          <div class="flex items-center gap-1 bg-stone-950/70 p-1 rounded-xl border border-stone-800">
            <button data-tab="daily" class="lb-tab-btn px-3 py-1.5 rounded-lg font-bold transition-all text-stone-400 hover:text-stone-200">
              🌅 Daily (Today)
            </button>
            <button data-tab="weekly" class="lb-tab-btn px-3 py-1.5 rounded-lg font-bold transition-all text-stone-400 hover:text-stone-200">
              📅 Weekly (This Week)
            </button>
            <button data-tab="all-time" class="lb-tab-btn px-3 py-1.5 rounded-lg font-bold transition-all text-stone-400 hover:text-stone-200">
              👑 All-Time Legends
            </button>
            <button data-tab="personal" class="lb-tab-btn px-3 py-1.5 rounded-lg font-bold transition-all text-stone-400 hover:text-stone-200">
              🏅 Personal Bests
            </button>
          </div>

          <div class="flex items-center gap-2 text-[11px] text-stone-400">
            <span id="lb-cache-status" class="font-mono text-stone-500">60s Cached</span>
            <button id="lb-refresh-btn" class="flex items-center gap-1 px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors">
              <span>↻</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <!-- Content Area -->
        <div id="lb-content-area" class="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          <!-- Dynamic Content Rendered Here -->
        </div>

        <!-- Footer -->
        <div class="px-6 py-3 bg-stone-950/60 border-t border-stone-800 flex items-center justify-between text-xs text-stone-400">
          <div>
            <span>Press <kbd class="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 font-mono text-[11px] text-stone-300">L</kbd> or <kbd class="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 font-mono text-[11px] text-stone-300">ESC</kbd> to toggle</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span class="font-mono text-[11px]">Database Active</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Event Listeners
    this.container.querySelector('#lb-close-btn')?.addEventListener('click', () => this.close());
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) this.close();
    });

    this.container.querySelectorAll('.lb-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).dataset.tab as LeaderboardTab;
        if (tab) this.switchTab(tab);
      });
    });

    this.container.querySelector('#lb-refresh-btn')?.addEventListener('click', () => {
      if (this.currentTab === 'personal') {
        this.renderContent();
      } else {
        this.loadData(true);
      }
    });

    // Keyboard listener for ESC & L
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      } else if ((e.key === 'l' || e.key === 'L') && !this.isInputFieldFocused()) {
        this.toggle();
      }
    });
  }

  private isInputFieldFocused(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  }

  public open(tab: LeaderboardTab = 'daily') {
    if (!this.container) this.createDom();
    this.isOpen = true;
    this.currentTab = tab;
    this.container?.classList.remove('opacity-0', 'pointer-events-none');
    this.container?.classList.add('opacity-100', 'pointer-events-auto');

    this.updateTabButtons();
    if (this.currentTab === 'personal') {
      this.personalBests = getPersonalBests();
      this.renderContent();
    } else {
      this.loadData(false);
    }

    // Auto-update cache age ticker every 2s while modal is open
    clearInterval(this.autoRefreshInterval);
    this.autoRefreshInterval = setInterval(() => {
      this.updateCacheAgeIndicator();
    }, 2000);
  }

  public close() {
    this.isOpen = false;
    this.container?.classList.add('opacity-0', 'pointer-events-none');
    this.container?.classList.remove('opacity-100', 'pointer-events-auto');
    clearInterval(this.autoRefreshInterval);
  }

  public toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open(this.currentTab);
    }
  }

  public switchTab(tab: LeaderboardTab) {
    this.currentTab = tab;
    this.updateTabButtons();
    if (tab === 'personal') {
      this.personalBests = getPersonalBests();
      this.renderContent();
    } else {
      this.loadData(false);
    }
  }

  private updateTabButtons() {
    this.container?.querySelectorAll('.lb-tab-btn').forEach((btn) => {
      const tab = (btn as HTMLElement).dataset.tab;
      if (tab === this.currentTab) {
        btn.className =
          'lb-tab-btn px-3 py-1.5 rounded-lg font-bold transition-all bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm';
      } else {
        btn.className =
          'lb-tab-btn px-3 py-1.5 rounded-lg font-bold transition-all text-stone-400 hover:text-stone-200 hover:bg-stone-800/60';
      }
    });
  }

  private updateCacheAgeIndicator() {
    if (this.currentTab === 'personal') {
      const cacheElem = this.container?.querySelector('#lb-cache-status');
      if (cacheElem) cacheElem.textContent = 'Local Realtime';
      return;
    }
    const age = getLeaderboardCacheAge(this.currentTab);
    const remaining = Math.max(0, 60 - age);
    const cacheElem = this.container?.querySelector('#lb-cache-status');
    if (cacheElem) {
      cacheElem.textContent = `Cached (refresh in ${remaining}s)`;
    }
  }

  private async loadData(force: boolean = false) {
    if (this.currentTab === 'personal') return;

    this.isLoading = true;
    this.renderLoading();

    try {
      this.entries = await fetchLeaderboard(this.currentTab, force);
      this.isLoading = false;
      this.renderContent();
      this.updateCacheAgeIndicator();
    } catch (e) {
      this.isLoading = false;
      this.renderError();
    }
  }

  private renderLoading() {
    const area = this.container?.querySelector('#lb-content-area');
    if (!area) return;
    area.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 space-y-3">
        <div class="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div>
        <p class="text-xs font-mono text-stone-400 tracking-wider">FETCHING COMPETITIVE RECORDS...</p>
      </div>
    `;
  }

  private renderError() {
    const area = this.container?.querySelector('#lb-content-area');
    if (!area) return;
    area.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-center space-y-2">
        <div class="text-2xl">⚠️</div>
        <p class="text-sm font-bold text-red-400">Failed to load leaderboard</p>
        <p class="text-xs text-stone-400">Could not contact Supabase. Please retry in a moment.</p>
        <button id="lb-retry-btn" class="mt-2 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-bold text-stone-200">
          Try Again
        </button>
      </div>
    `;
    area.querySelector('#lb-retry-btn')?.addEventListener('click', () => this.loadData(true));
  }

  private renderContent() {
    const area = this.container?.querySelector('#lb-content-area');
    if (!area) return;

    if (this.currentTab === 'personal') {
      this.renderPersonalBests(area);
      return;
    }

    if (this.entries.length === 0) {
      area.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-center text-stone-400 text-xs">
          <p>No matches recorded for this period yet.</p>
          <p class="text-stone-500 mt-1">Complete a round to see your score on the leaderboard!</p>
        </div>
      `;
      return;
    }

    let html = `
      <!-- Table Header -->
      <div class="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-mono font-bold text-stone-400 uppercase tracking-wider border-b border-stone-800">
        <div class="col-span-1 text-center">Rank</div>
        <div class="col-span-5">Player</div>
        <div class="col-span-3">Title / Badge</div>
        <div class="col-span-1 text-center">Wins</div>
        <div class="col-span-2 text-right">Score</div>
      </div>
      <div class="divide-y divide-stone-800/60">
    `;

    this.entries.forEach((item) => {
      const emoji = ANIMAL_EMOJIS[item.animal] || '🐾';
      let rankDisplay = `#${item.rank}`;
      let rankColor = 'text-stone-400';
      let rowBg = item.isCurrentPlayer ? 'bg-amber-950/20 border border-amber-500/30' : 'hover:bg-stone-800/40';

      if (item.rank === 1) {
        rankDisplay = '👑 1';
        rankColor = 'text-amber-400 font-black';
      } else if (item.rank === 2) {
        rankDisplay = '🥈 2';
        rankColor = 'text-stone-200 font-black';
      } else if (item.rank === 3) {
        rankDisplay = '🥉 3';
        rankColor = 'text-amber-600 font-black';
      }

      html += `
        <div class="grid grid-cols-12 gap-2 items-center px-4 py-2.5 rounded-xl transition-colors ${rowBg}">
          <div class="col-span-1 text-center font-mono text-xs ${rankColor}">
            ${rankDisplay}
          </div>
          <div class="col-span-5 flex items-center gap-2.5">
            <span class="text-lg select-none">${emoji}</span>
            <div class="truncate">
              <div class="text-xs font-bold text-stone-200 truncate flex items-center gap-1.5">
                ${escapeHtml(item.username)}
                ${item.isCurrentPlayer ? '<span class="text-[9px] px-1 rounded bg-amber-500/30 text-amber-300 font-mono">YOU</span>' : ''}
              </div>
              <div class="text-[10px] text-stone-500 capitalize">${item.animal} • ${item.matchesPlayed || 1} matches</div>
            </div>
          </div>
          <div class="col-span-3">
            <span class="text-[10px] font-mono px-2 py-0.5 rounded ${getBadgeStyle(item.badge)}">
              ${item.badge}
            </span>
          </div>
          <div class="col-span-1 text-center font-mono text-xs text-stone-300">
            ${item.wins || 0}
          </div>
          <div class="col-span-2 text-right font-mono font-bold text-sm text-amber-400">
            ${item.score.toLocaleString()}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    area.innerHTML = html;
  }

  private renderPersonalBests(area: Element) {
    const bests = this.personalBests || getPersonalBests();
    const winRate = bests.totalMatches > 0 ? Math.round((bests.totalWins / bests.totalMatches) * 100) : 0;
    const emoji = ANIMAL_EMOJIS[bests.favoriteAnimal] || '🐷';

    area.innerHTML = `
      <div class="space-y-4 py-2">
        <!-- Main Stats Bento Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <!-- Highest Score -->
          <div class="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-1">
            <div class="text-xs font-mono text-stone-400 flex items-center justify-between">
              <span>HIGHEST MATCH SCORE</span>
              <span>⭐</span>
            </div>
            <div class="text-2xl font-black font-mono text-amber-400">
              ${bests.highestScore.toLocaleString()}
            </div>
            <div class="text-[11px] text-stone-500">Personal peak match performance</div>
          </div>

          <!-- Most Butcher Kills -->
          <div class="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-1">
            <div class="text-xs font-mono text-stone-400 flex items-center justify-between">
              <span>MOST BUTCHER KILLS</span>
              <span>🩸</span>
            </div>
            <div class="text-2xl font-black font-mono text-red-400">
              ${bests.mostKills}
            </div>
            <div class="text-[11px] text-stone-500">Prey slaughtered in a single hunt</div>
          </div>

          <!-- Most Ally Revives -->
          <div class="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-1">
            <div class="text-xs font-mono text-stone-400 flex items-center justify-between">
              <span>MOST ALLY REVIVES</span>
              <span>💖</span>
            </div>
            <div class="text-2xl font-black font-mono text-emerald-400">
              ${bests.mostRevives}
            </div>
            <div class="text-[11px] text-stone-500">Teammates saved from the blade</div>
          </div>

          <!-- Fastest Win -->
          <div class="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-1">
            <div class="text-xs font-mono text-stone-400 flex items-center justify-between">
              <span>FASTEST ESCAPE / WIN</span>
              <span>⚡</span>
            </div>
            <div class="text-2xl font-black font-mono text-sky-400">
              ${bests.fastestWinSec > 0 ? `${bests.fastestWinSec}s` : '--'}
            </div>
            <div class="text-[11px] text-stone-500">Survival round clearance time</div>
          </div>

          <!-- Matches & Win Rate -->
          <div class="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-1">
            <div class="text-xs font-mono text-stone-400 flex items-center justify-between">
              <span>MATCHES & WIN RATE</span>
              <span>🏆</span>
            </div>
            <div class="text-2xl font-black font-mono text-purple-400">
              ${bests.totalWins}/${bests.totalMatches} <span class="text-sm text-stone-400 font-normal">(${winRate}%)</span>
            </div>
            <div class="text-[11px] text-stone-500">Total survival rate</div>
          </div>

          <!-- Favorite Animal -->
          <div class="p-4 rounded-xl bg-stone-950/60 border border-stone-800 space-y-1">
            <div class="text-xs font-mono text-stone-400 flex items-center justify-between">
              <span>FAVORITE ANIMAL</span>
              <span>${emoji}</span>
            </div>
            <div class="text-2xl font-black text-stone-200 capitalize flex items-center gap-2">
              <span>${emoji}</span>
              <span>${bests.favoriteAnimal}</span>
            </div>
            <div class="text-[11px] text-stone-500">Most frequently selected beast</div>
          </div>
        </div>

        <!-- Info Box -->
        <div class="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-3">
          <span class="text-lg">💡</span>
          <div>
            <div class="font-bold">Authoritative Cloud Synchronization</div>
            <div class="text-[11px] text-amber-300/80 mt-0.5">
              Personal records update automatically after every match concludes. Scores count toward your Daily and Weekly leaderboard positions.
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getBadgeStyle(badge: string): string {
  if (badge.includes('GRAND BUTCHER')) return 'bg-red-500/20 text-red-300 border border-red-500/40';
  if (badge.includes('APEX')) return 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
  if (badge.includes('SACRIFICIAL')) return 'bg-purple-500/20 text-purple-300 border border-purple-500/40';
  if (badge.includes('ELITE')) return 'bg-sky-500/20 text-sky-300 border border-sky-500/40';
  if (badge.includes('TAINTED')) return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
  return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
}

export const leaderboardModal = new LeaderboardModal();
