import { Room, Client } from 'colyseus';
import { FarmState, PlayerSchema, TrapSchema, HoundSchema } from './schema/FarmState.ts';
import { NETWORK_MESSAGES, AnimalType, VengeanceLogItem, MatchSummary, MatchSummaryPlayer } from '@shared/types.ts';
import {
  GAME_CONSTANTS,
  calculateAltarDemand,
  calculateButcherSpeed,
  calculateButcherCleaverRange,
} from '@shared/constants.ts';
import { ANIMAL_ABILITIES, BUTCHER_ABILITIES } from '@shared/abilities.ts';
import { recordMatchResult } from '../services/supabase.ts';

const ANIMALS: AnimalType[] = ['chicken', 'pig', 'goat', 'sheep', 'cow', 'horse', 'duck'];

interface BotAIState {
  targetX: number;
  targetY: number;
  nextDecisionTime: number;
  fleeing: boolean;
}

interface PlayerTrackingState {
  spawnLeft: boolean;
  spawnDistanceAt10s: number;
  lastPosition: { x: number; y: number };
  stillDuration: number;
  lastStillMarkTime: number;
  isolationCount: number;
  lastIsolationCheck: number;
  facingAngle: number;
  vengeanceLog: VengeanceLogItem[];
}

export class FarmRoom extends Room<{ state: FarmState }> {
  maxClients = GAME_CONSTANTS.MAX_PLAYERS; // 12 players max
  private botStates: Map<string, BotAIState> = new Map();
  private trackingStates: Map<string, PlayerTrackingState> = new Map();
  private lobbyTimer: number = GAME_CONSTANTS.LOBBY_BOT_FILL_TIMEOUT_SEC;
  private countdownTimer: number = GAME_CONSTANTS.COUNTDOWN_DURATION_SEC;
  private roundTimer: number = GAME_CONSTANTS.ROUND_DURATION_SEC;
  private spawnCheckEvaluated: boolean = false;
  private transformationEvaluated: boolean = false;
  private matchRecorded: boolean = false;

  onCreate(_options: any) {
    console.log('[FarmRoom] Created authoritative farm room:', this.roomId);
    this.setState(new FarmState());

    // 20Hz state broadcast to clients
    this.setPatchRate(1000 / GAME_CONSTANTS.SERVER_BROADCAST_RATE);

    // Register network message handlers
    this.registerMessageHandlers();

    // Authoritative 60Hz physics and game simulation loop
    this.setSimulationInterval(
      (deltaTime) => this.simulationUpdate(deltaTime),
      1000 / GAME_CONSTANTS.SERVER_TICK_RATE
    );
  }

  private registerMessageHandlers() {
    // 1. Player movement input
    this.onMessage(NETWORK_MESSAGES.PLAYER_INPUT, (client, message: any) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.isDowned || player.isStunned || this.state.phase === 'ended') return;

      const dx = Number(message?.dx) || 0;
      const dy = Number(message?.dy) || 0;
      const len = Math.hypot(dx, dy);

      const tracking = this.getTracking(client.sessionId);

      // Compute current modified speed
      let currentSpeed = player.speed;
      const now = Date.now();

      // Active buff speed adjustments
      if (player.buffExpiresAt > now) {
        if (player.activeBuffType === 'flap_burst') currentSpeed *= 1.6;
        if (player.activeBuffType === 'sprint') currentSpeed *= 1.4;
        if (player.activeBuffType === 'stampede') currentSpeed *= 1.5;
        if (player.activeBuffType === 'warm_blood') currentSpeed *= 1.1;
      }

      // Terrain modifiers
      // Creek water (x: 416-512): Duck swims freely, others slowed by 40%
      if (player.x >= 416 && player.x <= 512 && player.animal !== 'duck' && player.role !== 'butcher') {
        currentSpeed *= 0.6;
      }
      // Mud pit (x: 704-928, y: 704-928): Pig moves normal, others slowed by 30%
      if (player.x >= 704 && player.x <= 928 && player.y >= 704 && player.y <= 928 && player.animal !== 'pig' && player.role !== 'butcher') {
        currentSpeed *= 0.7;
      }

      if (len > 0) {
        player.vx = (dx / len) * currentSpeed;
        player.vy = (dy / len) * currentSpeed;
        tracking.facingAngle = Math.atan2(dy, dx);

        // Moving breaks sheep stealth
        if (player.animal === 'sheep' && player.isStealthed && player.activeBuffType === 'wool_disguise') {
          player.isStealthed = false;
        }
      } else {
        player.vx = 0;
        player.vy = 0;
      }
    });

    // 2. Free Reroll Animal (Lobby only, 1 free per player)
    this.onMessage(NETWORK_MESSAGES.REROLL_ANIMAL, (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.hasRerolled || this.state.phase !== 'lobby') return;

      const available = ANIMALS.filter((a) => a !== player.animal);
      const chosen = available[Math.floor(Math.random() * available.length)];
      player.animal = chosen;
      player.hasRerolled = true;
      player.hp = chosen === 'pig' || chosen === 'cow' ? 2 : 1;
      player.maxHp = player.hp;
      player.speed = GAME_CONSTANTS.SPEEDS[chosen];
      console.log(`[FarmRoom] ${player.username} rerolled to ${player.animal}`);
    });

    // 3. Animal Abilities
    this.onMessage(NETWORK_MESSAGES.USE_ABILITY, (client, message: any) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.isDowned || player.isStunned || this.state.phase !== 'in-round') return;
      if (player.role === 'butcher') return;

      const isBetrayal = Boolean(message?.isBetrayal);
      const now = Date.now();

      if (isBetrayal) {
        if (player.betrayalCdExpiresAt > now) return;
        this.executeBetrayalAbility(player);
      } else {
        if (player.primaryCdExpiresAt > now) return;
        this.executePrimaryAbility(player);
      }
    });

    // 4. Butcher Kit Abilities (Cleaver, Lantern, Snare, Whistle)
    this.onMessage(NETWORK_MESSAGES.USE_BUTCHER_ABILITY, (client, message: any) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.role !== 'butcher' || player.isStunned || this.state.phase !== 'in-round') return;

      const abilityType = message?.ability; // 'cleaver' | 'lantern' | 'snare' | 'whistle'
      this.executeButcherAbility(player, abilityType);
    });

    // 5. Revive Downed Ally
    this.onMessage(NETWORK_MESSAGES.REVIVE_ALLY, (client, message: any) => {
      const reviver = this.state.players.get(client.sessionId);
      if (!reviver || reviver.role === 'butcher' || reviver.isDowned || reviver.isStunned || this.state.phase !== 'in-round') return;

      const targetSessionId = message?.targetSessionId;
      const target = this.state.players.get(targetSessionId);
      if (!target || !target.isDowned || target.role === 'butcher') return;

      const dist = Math.hypot(target.x - reviver.x, target.y - reviver.y);
      if (dist <= 75) {
        // Successful revive!
        target.isDowned = false;
        target.hp = 1;
        target.downedAt = 0;

        // Reward reviver: -1 Mark & +40 score
        this.modifyPlayerMark(reviver, -1, 'Revived an ally');
        reviver.score += GAME_CONSTANTS.SCORES.REVIVE_ALLY;

        this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
          type: 'revive',
          text: `💖 ${reviver.username} revived ${target.username}! (-1 Mark)`,
        });
      }
    });

    // 6. Altar Volunteer Sacrifice
    this.onMessage(NETWORK_MESSAGES.SACRIFICE_VOLUNTEER, (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.role === 'butcher' || player.isDowned || !this.state.altar.isActive || this.state.altar.isClosed) return;

      const dist = Math.hypot(player.x - this.state.altar.x, player.y - this.state.altar.y);
      if (dist <= this.state.altar.radius) {
        player.volunteered = true;
        player.isDowned = true;
        player.score += GAME_CONSTANTS.SCORES.VOLUNTEER_SACRIFICE;
        this.state.altar.sacrificesCount++;

        this.broadcast(NETWORK_MESSAGES.ALTAR_SACRIFICE, {
          username: player.username,
          volunteered: true,
          sacrificesCount: this.state.altar.sacrificesCount,
          demand: this.state.altar.demand,
        });

        this.checkAltarFulfillment();
      }
    });

    // 7. Altar Push Sacrifice
    this.onMessage(NETWORK_MESSAGES.SACRIFICE_PUSH, (client, message: any) => {
      const pusher = this.state.players.get(client.sessionId);
      const target = this.state.players.get(message?.targetSessionId);
      if (!pusher || !target || target.role === 'butcher' || !this.state.altar.isActive || this.state.altar.isClosed) return;

      const distToAltar = Math.hypot(target.x - this.state.altar.x, target.y - this.state.altar.y);
      if (distToAltar <= this.state.altar.radius + 30) {
        target.isDowned = true;
        pusher.score += GAME_CONSTANTS.SCORES.PUSHED_SACRIFICE;
        // Pushing ally into altar adds betrayal mark!
        this.modifyPlayerMark(pusher, 2, 'Pushed ally into altar');
        this.state.altar.sacrificesCount++;

        // Add to vengeance log if pusher later faces this target
        this.addVengeanceLog(target.sessionId, pusher.sessionId, pusher.username, 'Sacrificed you at the altar');

        this.broadcast(NETWORK_MESSAGES.ALTAR_SACRIFICE, {
          username: target.username,
          pusherUsername: pusher.username,
          volunteered: false,
          sacrificesCount: this.state.altar.sacrificesCount,
          demand: this.state.altar.demand,
        });

        this.checkAltarFulfillment();
      }
    });
  }

  private getTracking(sessionId: string): PlayerTrackingState {
    let tracking = this.trackingStates.get(sessionId);
    if (!tracking) {
      tracking = {
        spawnLeft: false,
        spawnDistanceAt10s: 0,
        lastPosition: { x: 1200, y: 1200 },
        stillDuration: 0,
        lastStillMarkTime: 0,
        isolationCount: 0,
        lastIsolationCheck: 0,
        facingAngle: 0,
        vengeanceLog: [],
      };
      this.trackingStates.set(sessionId, tracking);
    }
    return tracking;
  }

  public modifyPlayerMark(player: PlayerSchema, delta: number, reason: string) {
    const oldMark = player.mark;
    player.mark = Math.max(0, Math.min(10, player.mark + delta));
    if (delta > 0) {
      player.lastMarkTimestamp = Date.now();
    }
    this.updatePlayerMarkTier(player);

    this.broadcast(NETWORK_MESSAGES.MARK_CHANGED, {
      sessionId: player.sessionId,
      username: player.username,
      newMark: player.mark,
      markTier: player.markTier,
      delta,
      reason,
    });
  }

  private addVengeanceLog(victimSessionId: string, attackerSessionId: string, attackerUsername: string, reason: string) {
    const tracking = this.getTracking(victimSessionId);
    tracking.vengeanceLog.push({
      targetId: attackerSessionId,
      targetUsername: attackerUsername,
      reason,
      timestamp: Date.now(),
    });
  }

  private executePrimaryAbility(player: PlayerSchema) {
    const now = Date.now();
    const kit = ANIMAL_ABILITIES[player.animal];
    if (!kit) return;

    player.primaryCdExpiresAt = now + kit.primary.cooldownMs;

    switch (player.animal) {
      case 'chicken': // Flap Burst: +60% speed for 1.8s
        player.activeBuffType = 'flap_burst';
        player.buffExpiresAt = now + 1800;
        this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
          type: 'ability',
          sessionId: player.sessionId,
          text: `🐔 ${player.username} used Flap Burst!`,
        });
        break;

      case 'pig': // Body Slam: knockback entities within 75px
        this.state.players.forEach((other) => {
          if (other.sessionId !== player.sessionId && !other.isDowned) {
            const dist = Math.hypot(other.x - player.x, other.y - player.y);
            if (dist <= 75) {
              const angle = Math.atan2(other.y - player.y, other.x - player.x);
              other.x += Math.cos(angle) * 120;
              other.y += Math.sin(angle) * 120;
              other.isStunned = true;
              setTimeout(() => {
                other.isStunned = false;
              }, 800);

              // Check if pushed within 5m of Butcher (+1 Mark)
              this.checkPushedNearButcher(player, other);
            }
          }
        });
        this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
          type: 'ability',
          sessionId: player.sessionId,
          text: `🐷 ${player.username} slammed the ground!`,
        });
        break;

      case 'goat': // Headbutt push 5m (160px)
        this.state.players.forEach((other) => {
          if (other.sessionId !== player.sessionId && !other.isDowned) {
            const dist = Math.hypot(other.x - player.x, other.y - player.y);
            if (dist <= 65) {
              const angle = Math.atan2(other.y - player.y, other.x - player.x);
              other.x += Math.cos(angle) * 160;
              other.y += Math.sin(angle) * 160;
              this.checkPushedNearButcher(player, other);
            }
          }
        });
        break;

      case 'sheep': // Wool Disguise: stealth if standing still
        if (Math.hypot(player.vx, player.vy) < 5) {
          player.isStealthed = true;
          player.activeBuffType = 'wool_disguise';
          player.buffExpiresAt = now + 6000;
        }
        break;

      case 'cow': // Stampede Charge: +50% speed for 2.5s
        player.activeBuffType = 'stampede';
        player.buffExpiresAt = now + 2500;
        // Cow stampede destroys traps in front
        this.state.traps.forEach((trap, trapId) => {
          if (Math.hypot(trap.x - player.x, trap.y - player.y) < 60) {
            this.state.traps.delete(trapId);
          }
        });
        break;

      case 'horse': // Sprint & Carry: +40% speed for 3s
        player.activeBuffType = 'sprint';
        player.buffExpiresAt = now + 3000;
        break;

      case 'duck': // Dive: untargetable/invulnerable for 3s
        player.isStealthed = true;
        player.activeBuffType = 'dive';
        player.buffExpiresAt = now + 3000;
        setTimeout(() => {
          player.isStealthed = false;
        }, 3000);
        break;
    }
  }

  private executeBetrayalAbility(player: PlayerSchema) {
    const now = Date.now();
    const kit = ANIMAL_ABILITIES[player.animal];
    if (!kit) return;

    player.betrayalCdExpiresAt = now + kit.betrayal.cooldownMs;
    // Mark penalty for betrayal tool (+1)
    this.modifyPlayerMark(player, 1, 'Used betrayal tool');

    this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
      type: 'betrayal',
      sessionId: player.sessionId,
      text: `⚠️ Betrayal action detected from ${player.username}! (+1 Mark)`,
    });
  }

  private checkPushedNearButcher(pusher: PlayerSchema, pushed: PlayerSchema) {
    if (!this.state.butcherSessionId) return;
    const butcher = this.state.players.get(this.state.butcherSessionId);
    if (!butcher) return;

    const distToButcher = Math.hypot(pushed.x - butcher.x, pushed.y - butcher.y);
    if (distToButcher <= 160) {
      // Pusher shoved ally within 5m of Butcher! +1 Mark
      this.modifyPlayerMark(pusher, 1, 'Pushed ally within 5m of Butcher');
      this.addVengeanceLog(pushed.sessionId, pusher.sessionId, pusher.username, 'Pushed you into the Butcher');
    }
  }

  private executeButcherAbility(butcher: PlayerSchema, abilityType: string) {
    const now = Date.now();
    const lobbySize = this.state.players.size;
    const cleaverRange = calculateButcherCleaverRange(lobbySize);
    const tracking = this.getTracking(butcher.sessionId);

    if (abilityType === 'cleaver') {
      if (butcher.primaryCdExpiresAt > now) return;
      butcher.primaryCdExpiresAt = now + BUTCHER_ABILITIES.cleaver.cooldownMs;

      // Cleaver swing: 1-hit down within cleaverRange (48-60px) in front arc
      const facing = tracking.facingAngle;
      let hitCount = 0;

      this.state.players.forEach((target) => {
        if (target.sessionId !== butcher.sessionId && !target.isDowned && target.role !== 'butcher') {
          const dist = Math.hypot(target.x - butcher.x, target.y - butcher.y);
          if (dist <= cleaverRange + 15) {
            const angleToTarget = Math.atan2(target.y - butcher.y, target.x - butcher.x);
            let angleDiff = Math.abs(facing - angleToTarget);
            while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - 2 * Math.PI);

            // Cleaver arc (~100 degrees = ~0.9 radians half angle)
            if (angleDiff <= 1.2 || dist <= 35) {
              target.isDowned = true;
              target.hp = 0;
              target.downedAt = now;
              butcher.kills++;
              butcher.score += GAME_CONSTANTS.SCORES.BUTCHER_KILL;
              hitCount++;

              // Check Vengeance bonus (+25 score if target is in vengeance log)
              const hasVengeance = tracking.vengeanceLog.some((v) => v.targetId === target.sessionId);
              if (hasVengeance) {
                butcher.score += 25;
                this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
                  type: 'vengeance_kill',
                  text: `🩸 VENGEANCE SERVED! ${butcher.username} slaughtered their betrayer ${target.username}! (+25 Bonus)`,
                });
              }

              this.broadcast(NETWORK_MESSAGES.PLAYER_DOWNED, {
                victimSessionId: target.sessionId,
                victimUsername: target.username,
                butcherSessionId: butcher.sessionId,
              });
            }
          }
        }
      });

      this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
        type: 'cleaver_swing',
        sessionId: butcher.sessionId,
        text: hitCount > 0 ? `🗡️ Cleaver struck down ${hitCount} prey!` : `🗡️ Cleaver swing sliced through the air!`,
      });
    } else if (abilityType === 'lantern') {
      if (butcher.betrayalCdExpiresAt > now) return;
      butcher.betrayalCdExpiresAt = now + BUTCHER_ABILITIES.lantern.cooldownMs;

      // Reveal stealth in 8m cone (224px)
      let revealed = 0;
      this.state.players.forEach((target) => {
        if (target.sessionId !== butcher.sessionId && target.isStealthed) {
          const dist = Math.hypot(target.x - butcher.x, target.y - butcher.y);
          if (dist <= 224) {
            target.isStealthed = false;
            target.buffExpiresAt = 0;
            revealed++;
          }
        }
      });

      this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
        type: 'lantern_reveal',
        sessionId: butcher.sessionId,
        text: `🕯️ Lantern of the Damned blazed! ${revealed > 0 ? `Revealed ${revealed} hidden animals!` : 'Cast illuminating dread.'}`,
      });
    } else if (abilityType === 'snare') {
      if (butcher.utilityCdExpiresAt > now) return;
      butcher.utilityCdExpiresAt = now + BUTCHER_ABILITIES.snare.cooldownMs;

      const maxSnares = lobbySize <= 6 ? 2 : lobbySize <= 8 ? 3 : 4;
      if (this.state.traps.size >= maxSnares) {
        // Remove oldest trap
        let oldestKey: string | null = null;
        this.state.traps.forEach((_, key) => {
          if (!oldestKey) oldestKey = key;
        });
        if (oldestKey) this.state.traps.delete(oldestKey);
      }

      const trapId = `trap_${Math.random().toString(36).substring(2, 8)}`;
      const trap = new TrapSchema();
      trap.id = trapId;
      trap.x = butcher.x;
      trap.y = butcher.y;
      trap.placedBySessionId = butcher.sessionId;
      this.state.traps.set(trapId, trap);

      this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
        type: 'snare_placed',
        text: `⛓️ A sinister bear snare snaps into place on the ground.`,
      });
    } else if (abilityType === 'whistle') {
      if (butcher.specialCdExpiresAt > now) return;
      butcher.specialCdExpiresAt = now + BUTCHER_ABILITIES.whistle.cooldownMs;

      const houndId = `hound_${Math.random().toString(36).substring(2, 8)}`;
      const hound = new HoundSchema();
      hound.id = houndId;
      hound.x = butcher.x;
      hound.y = butcher.y;
      hound.targetX = butcher.x + Math.cos(tracking.facingAngle) * 300;
      hound.targetY = butcher.y + Math.sin(tracking.facingAngle) * 300;
      hound.expiresAt = now + 15000;
      this.state.hounds.set(houndId, hound);

      this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
        type: 'hound_whistle',
        text: `🐕 HOUND WHISTLE ECHOES! A rabid farm hound surges onto the fields!`,
      });
    }
  }

  private checkAltarFulfillment() {
    if (this.state.altar.sacrificesCount >= this.state.altar.demand) {
      this.state.altar.isClosed = true;
      this.state.altar.isActive = false;

      // Distribute team buff: Warm Blood (+10% speed for 40s)
      const now = Date.now();
      this.state.players.forEach((p) => {
        if (!p.isDowned && p.role !== 'butcher') {
          p.activeBuffType = 'warm_blood';
          p.buffExpiresAt = now + 40000;

          // If they didn't volunteer, they take altar gift without volunteering -> +2 Marks!
          if (!p.volunteered) {
            this.modifyPlayerMark(p, 2, 'Took altar gift without volunteering');
          }
        }
      });

      this.broadcast(NETWORK_MESSAGES.ALTAR_GIFT, {
        buff: 'Warm Blood (+10% speed for 40s)',
        text: '🩸 The altar demands are satisfied! Warm Blood fills the surviving prey!',
      });
    }
  }

  private updatePlayerMarkTier(player: PlayerSchema) {
    if (player.mark <= GAME_CONSTANTS.MARK_TIER_CLEAN_MAX) {
      player.markTier = 'clean';
    } else if (player.mark <= GAME_CONSTANTS.MARK_TIER_TAINTED_MAX) {
      player.markTier = 'tainted';
    } else {
      player.markTier = 'marked';
    }
  }

  onJoin(client: Client, options: { username?: string; profileId?: string } = {}) {
    console.log(`[FarmRoom] Player joined: ${client.sessionId}, name: ${options?.username}`);

    if (this.state.phase === 'lobby' || this.state.phase === 'countdown') {
      let botToRemoveKey: string | null = null;
      this.state.players.forEach((p, id) => {
        if (p.isBot && !botToRemoveKey) {
          botToRemoveKey = id;
        }
      });

      if (botToRemoveKey) {
        this.state.players.delete(botToRemoveKey);
        this.botStates.delete(botToRemoveKey);
        console.log(`[FarmRoom] Replaced AI bot ${botToRemoveKey} with human ${client.sessionId}`);
      }
    }

    const player = new PlayerSchema();
    player.sessionId = client.sessionId;
    player.id = options?.profileId || client.sessionId;
    player.username = options?.username || `Animal_${this.state.players.size + 1}`;
    player.isBot = false;

    // Assign random animal
    const randomAnimal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    player.animal = randomAnimal;
    player.hp = randomAnimal === 'pig' || randomAnimal === 'cow' ? 2 : 1;
    player.maxHp = player.hp;
    player.speed = GAME_CONSTANTS.SPEEDS[randomAnimal];

    // Spawn safely in farm pasture
    player.x = 1200 + (Math.random() * 160 - 80);
    player.y = 1200 + (Math.random() * 160 - 80);

    this.state.players.set(client.sessionId, player);
    this.getTracking(client.sessionId);
    this.updatePlayerCounts();
  }

  onLeave(client: Client, _code?: number) {
    console.log(`[FarmRoom] Player left: ${client.sessionId}`);
    this.state.players.delete(client.sessionId);
    this.trackingStates.delete(client.sessionId);
    this.updatePlayerCounts();
  }

  private updatePlayerCounts() {
    let humans = 0;
    let bots = 0;
    this.state.players.forEach((p) => {
      if (p.isBot) bots++;
      else humans++;
    });
    this.state.humanPlayersCount = humans;
    this.state.botPlayersCount = bots;
    this.state.altar.demand = calculateAltarDemand(humans + bots);
  }

  private spawnBot() {
    const botId = `bot_${Math.random().toString(36).substring(2, 8)}`;
    const randomAnimal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];

    const bot = new PlayerSchema();
    bot.sessionId = botId;
    bot.id = botId;
    bot.username = `Bot_${randomAnimal.toUpperCase()}`;
    bot.animal = randomAnimal;
    bot.isBot = true;
    bot.hp = randomAnimal === 'pig' || randomAnimal === 'cow' ? 2 : 1;
    bot.maxHp = bot.hp;
    bot.speed = GAME_CONSTANTS.SPEEDS[randomAnimal];
    bot.x = 1100 + Math.random() * 200;
    bot.y = 1100 + Math.random() * 200;

    this.state.players.set(botId, bot);
    this.botStates.set(botId, {
      targetX: bot.x,
      targetY: bot.y,
      nextDecisionTime: Date.now() + Math.random() * 2000,
      fleeing: false,
    });
    this.getTracking(botId);
    this.updatePlayerCounts();
    console.log(`[FarmRoom] Spawned AI Bot: ${bot.username} (${botId})`);
  }

  private simulationUpdate(deltaTime: number) {
    const dtSeconds = deltaTime / 1000;
    const now = Date.now();

    // 1. Lobby Phase Management
    if (this.state.phase === 'lobby') {
      this.lobbyTimer -= dtSeconds;
      this.state.lobbyTimeRemaining = Math.max(0, Math.ceil(this.lobbyTimer));

      // If under 6 players after 30s in lobby, fill with bots to reach 6
      if (this.lobbyTimer <= 0 && this.state.players.size < GAME_CONSTANTS.MIN_PLAYERS_TO_START) {
        while (this.state.players.size < GAME_CONSTANTS.MIN_PLAYERS_TO_START) {
          this.spawnBot();
        }
      }

      // Check if ready to start countdown (6+ players)
      if (this.state.players.size >= GAME_CONSTANTS.MIN_PLAYERS_TO_START) {
        this.state.phase = 'countdown';
        this.countdownTimer = GAME_CONSTANTS.COUNTDOWN_DURATION_SEC;
        this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
          type: 'countdown',
          text: 'Round starting in 3 seconds!',
        });
      }
    } else if (this.state.phase === 'countdown') {
      this.countdownTimer -= dtSeconds;
      this.state.phaseTimeRemaining = Math.max(0, Math.ceil(this.countdownTimer));
      if (this.countdownTimer <= 0) {
        this.state.phase = 'in-round';
        this.roundTimer = GAME_CONSTANTS.ROUND_DURATION_SEC;
        this.state.roundDuration = GAME_CONSTANTS.ROUND_DURATION_SEC;
        this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
          type: 'round_start',
          text: 'The hunt begins. Watch your back!',
        });
      }
    } else if (this.state.phase === 'in-round') {
      this.roundTimer -= dtSeconds;
      this.state.phaseTimeRemaining = Math.max(0, Math.ceil(this.roundTimer));

      // Trigger 1: Last to leave spawn (+1 Mark at 10s mark of round)
      if (!this.spawnCheckEvaluated && this.roundTimer <= GAME_CONSTANTS.ROUND_DURATION_SEC - 10) {
        this.spawnCheckEvaluated = true;
        this.evaluateSpawnMark();
      }

      // Trigger 2: Standing still for 10+ seconds (+1 Mark, once per 30s)
      this.evaluateStandingStillMarks(dtSeconds, now);

      // Trigger 3: Split from group 3+ times (+1 Mark)
      this.evaluateGroupIsolationMarks(now);

      // Trigger 4: Altar activation at 80s into round (160s remaining)
      if (this.roundTimer <= GAME_CONSTANTS.ROUND_DURATION_SEC - GAME_CONSTANTS.ALTAR_ACTIVATION_TIME_SEC && !this.state.altar.isActive && !this.state.altar.isClosed) {
        this.state.altar.isActive = true;
        this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
          type: 'altar_active',
          text: `⚡ THE ALTAR OF BLOOD IS ACTIVE! (${this.state.altar.demand} Sacrifices required)`,
        });
      }

      // Trigger 5: Butcher Transformation at 50% (120s remaining in 240s round)
      if (!this.transformationEvaluated && this.roundTimer <= GAME_CONSTANTS.TRANSFORMATION_TIME_SEC) {
        this.transformationEvaluated = true;
        this.executeButcherTransformation();
      }

      // Check Win Conditions
      this.checkWinConditions();
    }

    // 2. Traps and Hounds update
    this.updateTrapsAndHounds(dtSeconds, now);

    // 3. AI Bot Simulation
    this.updateBotAIs(now);

    // 4. Movement Integration & Collision Checks
    this.updateMovement(dtSeconds);
  }

  private evaluateSpawnMark() {
    let closestDist = Infinity;
    let slowestPlayer: PlayerSchema | null = null;

    this.state.players.forEach((player) => {
      const dist = Math.hypot(player.x - 1200, player.y - 1200);
      if (dist < closestDist) {
        closestDist = dist;
        slowestPlayer = player;
      }
    });

    if (slowestPlayer) {
      this.modifyPlayerMark(slowestPlayer, 1, 'Last to leave spawn (+1)');
      this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
        type: 'mark_trigger',
        text: `⏳ ${slowestPlayer.username} lingered too long in spawn! (+1 Mark)`,
      });
    }
  }

  private evaluateStandingStillMarks(dtSeconds: number, now: number) {
    this.state.players.forEach((player) => {
      if (player.isDowned || player.isStunned) return;
      const tracking = this.getTracking(player.sessionId);
      const isMoving = Math.hypot(player.vx, player.vy) > 2;

      if (!isMoving) {
        tracking.stillDuration += dtSeconds;
        if (tracking.stillDuration >= 10 && now - tracking.lastStillMarkTime >= 30000) {
          tracking.lastStillMarkTime = now;
          tracking.stillDuration = 0;
          this.modifyPlayerMark(player, 1, 'Stood still for 10+ seconds');
        }
      } else {
        tracking.stillDuration = 0;
      }
    });
  }

  private evaluateGroupIsolationMarks(now: number) {
    this.state.players.forEach((player) => {
      if (player.isDowned || player.role === 'butcher') return;
      const tracking = this.getTracking(player.sessionId);

      // Check every 4 seconds
      if (now - tracking.lastIsolationCheck >= 4000) {
        tracking.lastIsolationCheck = now;

        // Find nearest living ally
        let nearestDist = Infinity;
        this.state.players.forEach((other) => {
          if (other.sessionId !== player.sessionId && !other.isDowned && other.role !== 'butcher') {
            const dist = Math.hypot(other.x - player.x, other.y - player.y);
            if (dist < nearestDist) nearestDist = dist;
          }
        });

        // 400px is approximately 15m away from any teammate
        if (nearestDist > 400) {
          tracking.isolationCount++;
          if (tracking.isolationCount >= 3) {
            tracking.isolationCount = 0;
            this.modifyPlayerMark(player, 1, 'Split from group 3+ times');
          }
        } else {
          tracking.isolationCount = Math.max(0, tracking.isolationCount - 1);
        }
      }
    });
  }

  private executeButcherTransformation() {
    // 1. Reveal all marks for 5 seconds to everyone
    this.state.revealMarksUntil = Date.now() + 5000;

    // 2. Find player with highest Mark. Ties broken by earliest lastMarkTimestamp
    let highestMark = -1;
    let candidate: PlayerSchema | null = null;

    this.state.players.forEach((player) => {
      if (candidate === null) {
        highestMark = player.mark;
        candidate = player;
        return;
      }

      if (player.mark > highestMark) {
        highestMark = player.mark;
        candidate = player;
      } else if (player.mark === highestMark) {
        // Earliest lastMarkTimestamp wins tie
        if (player.lastMarkTimestamp < candidate.lastMarkTimestamp) {
          candidate = player;
        }
      }
    });

    if (!candidate) return;

    const butcher = candidate as PlayerSchema;
    butcher.role = 'butcher';
    this.state.butcherSessionId = butcher.sessionId;

    // Scale butcher stats per lobby size
    const lobbySize = this.state.players.size;
    butcher.speed = calculateButcherSpeed(lobbySize);
    butcher.hp = 3;
    butcher.maxHp = 3;
    butcher.isDowned = false;
    butcher.isStunned = false;

    // Give Butcher 3s head start (all other players are stunned for 3 seconds)
    this.state.players.forEach((other) => {
      if (other.sessionId !== butcher.sessionId) {
        other.isStunned = true;
        setTimeout(() => {
          other.isStunned = false;
        }, 3000);
      }
    });

    // Retrieve Vengeance Log for Butcher
    const butcherTracking = this.getTracking(butcher.sessionId);

    // If vengeance log is empty, auto-populate with players who gave them marks or pushed them
    if (butcherTracking.vengeanceLog.length === 0) {
      this.state.players.forEach((p) => {
        if (p.sessionId !== butcher.sessionId && p.mark >= 2) {
          butcherTracking.vengeanceLog.push({
            targetId: p.sessionId,
            targetUsername: p.username,
            reason: 'Tainted by foul deeds',
            timestamp: Date.now(),
          });
        }
      });
    }

    // Send Vengeance Log to Butcher
    const butcherClient = this.clients.find((c) => c.sessionId === butcher.sessionId);
    if (butcherClient) {
      butcherClient.send(NETWORK_MESSAGES.VENGEANCE_LOG, {
        vengeanceList: butcherTracking.vengeanceLog,
      });
    }

    // Broadcast TRANSFORMATION event
    this.broadcast(NETWORK_MESSAGES.TRANSFORMATION, {
      butcherSessionId: butcher.sessionId,
      username: butcher.username,
      x: butcher.x,
      y: butcher.y,
    });

    this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
      type: 'transformation',
      text: `🩸 ${butcher.username.toUpperCase()} HAS SURRENDERED TO THE BUTCHER! RUN!`,
    });
  }

  private updateTrapsAndHounds(dtSeconds: number, now: number) {
    // 1. Trap triggering
    this.state.traps.forEach((trap, trapId) => {
      if (trap.triggered) return;
      this.state.players.forEach((p) => {
        if (!p.isDowned && p.role !== 'butcher') {
          const dist = Math.hypot(p.x - trap.x, p.y - trap.y);
          if (dist <= 32) {
            trap.triggered = true;
            p.isStunned = true;
            setTimeout(() => {
              p.isStunned = false;
            }, 3000); // rooted for 3s

            this.broadcast(NETWORK_MESSAGES.ANNOUNCEMENT, {
              type: 'trap_sprung',
              text: `⚠️ ${p.username} stepped in a Rust Snare and is rooted for 3s!`,
            });

            // Delete trap after 1 second
            setTimeout(() => {
              this.state.traps.delete(trapId);
            }, 1000);
          }
        }
      });
    });

    // 2. Hound patrols
    this.state.hounds.forEach((hound, houndId) => {
      if (now >= hound.expiresAt) {
        this.state.hounds.delete(houndId);
        return;
      }

      // Hound seeks nearest living prey
      let nearestPrey: PlayerSchema | null = null;
      let minPreyDist = Infinity;
      this.state.players.forEach((p) => {
        if (!p.isDowned && p.role !== 'butcher') {
          const dist = Math.hypot(p.x - hound.x, p.y - hound.y);
          if (dist < minPreyDist) {
            minPreyDist = dist;
            nearestPrey = p;
          }
        }
      });

      if (nearestPrey) {
        hound.targetX = (nearestPrey as PlayerSchema).x;
        hound.targetY = (nearestPrey as PlayerSchema).y;
      }

      const hdx = hound.targetX - hound.x;
      const hdy = hound.targetY - hound.y;
      const hlen = Math.hypot(hdx, hdy);
      if (hlen > 10) {
        const houndSpeed = 220;
        hound.x += (hdx / hlen) * houndSpeed * dtSeconds;
        hound.y += (hdy / hlen) * houndSpeed * dtSeconds;
      }
    });
  }

  private updateBotAIs(now: number) {
    const butcher = this.state.butcherSessionId ? this.state.players.get(this.state.butcherSessionId) : null;

    this.state.players.forEach((player) => {
      if (player.isBot && !player.isDowned && !player.isStunned) {
        let botState = this.botStates.get(player.sessionId);
        if (!botState) {
          botState = {
            targetX: player.x,
            targetY: player.y,
            nextDecisionTime: now,
            fleeing: false,
          };
          this.botStates.set(player.sessionId, botState);
        }

        // If bot is Butcher: aggressively hunt nearest living prey!
        if (player.role === 'butcher') {
          let closestPrey: PlayerSchema | null = null;
          let closestDist = Infinity;

          this.state.players.forEach((prey) => {
            if (!prey.isDowned && prey.role !== 'butcher') {
              const dist = Math.hypot(prey.x - player.x, prey.y - player.y);
              if (dist < closestDist) {
                closestDist = dist;
                closestPrey = prey;
              }
            }
          });

          if (closestPrey) {
            botState.targetX = (closestPrey as PlayerSchema).x;
            botState.targetY = (closestPrey as PlayerSchema).y;

            // Attack if in cleaver range!
            if (closestDist <= 55) {
              this.executeButcherAbility(player, 'cleaver');
            }
          }
        } else {
          // If prey: flee if Butcher is nearby
          if (butcher && !butcher.isDowned) {
            const distToButcher = Math.hypot(player.x - butcher.x, player.y - butcher.y);
            if (distToButcher < 300) {
              botState.fleeing = true;
              const angleFromButcher = Math.atan2(player.y - butcher.y, player.x - butcher.x);
              botState.targetX = player.x + Math.cos(angleFromButcher) * 200;
              botState.targetY = player.y + Math.sin(angleFromButcher) * 200;
              botState.nextDecisionTime = now + 800;
            } else {
              botState.fleeing = false;
            }
          }

          if (!botState.fleeing && now >= botState.nextDecisionTime) {
            botState.targetX = 400 + Math.random() * 1700;
            botState.targetY = 400 + Math.random() * 1700;
            botState.nextDecisionTime = now + 2500 + Math.random() * 2000;
          }
        }

        const bdx = botState.targetX - player.x;
        const bdy = botState.targetY - player.y;
        const blen = Math.hypot(bdx, bdy);
        if (blen > 20) {
          player.vx = (bdx / blen) * (player.speed * (player.role === 'butcher' ? 1.0 : 0.85));
          player.vy = (bdy / blen) * (player.speed * (player.role === 'butcher' ? 1.0 : 0.85));
        } else {
          player.vx = 0;
          player.vy = 0;
        }
      }
    });
  }

  private updateMovement(dtSeconds: number) {
    this.state.players.forEach((player) => {
      if (player.vx !== 0 || player.vy !== 0) {
        const nextX = player.x + player.vx * dtSeconds;
        const nextY = player.y + player.vy * dtSeconds;

        const clampedX = Math.max(48, Math.min(GAME_CONSTANTS.MAP_WIDTH - 48, nextX));
        const clampedY = Math.max(48, Math.min(GAME_CONSTANTS.MAP_HEIGHT - 48, nextY));

        // Barn Obstacle Collision
        const inBarnX = clampedX >= 1700 && clampedX <= 2100;
        const inBarnY = clampedY >= 260 && clampedY <= 540;
        if (!inBarnX || !inBarnY) {
          player.x = clampedX;
          player.y = clampedY;
        } else {
          if (player.x < 1700 || player.x > 2100) player.y = clampedY;
          if (player.y < 260 || player.y > 540) player.x = clampedX;
        }

        // Crates Collision
        if (player.animal !== 'goat' && player.role !== 'butcher') {
          const crates = [
            { x: 1050, y: 800 },
            { x: 1550, y: 850 },
            { x: 1280, y: 1650 },
          ];
          for (const crate of crates) {
            const cDist = Math.hypot(player.x - crate.x, player.y - crate.y);
            if (cDist < 36) {
              const pushAngle = Math.atan2(player.y - crate.y, player.x - crate.x);
              player.x = crate.x + Math.cos(pushAngle) * 36;
              player.y = crate.y + Math.sin(pushAngle) * 36;
            }
          }
        }
      }
    });
  }

  private checkWinConditions() {
    if (this.state.phase !== 'in-round') return;

    // Condition 1: Butcher exists and all animals are downed before timer ends
    if (this.state.butcherSessionId) {
      let livingPreyCount = 0;
      this.state.players.forEach((player) => {
        if (player.role !== 'butcher' && !player.isDowned) {
          livingPreyCount++;
        }
      });

      if (livingPreyCount === 0) {
        console.log('[FarmRoom] All animals downed! Butcher wins!');
        this.endRound('butcher');
        return;
      }
    }

    // Condition 2: Timer expires (240s) -> Animals win if at least 1 survives
    if (this.roundTimer <= 0) {
      console.log('[FarmRoom] Timer reached 0! Animals win!');
      this.endRound('animals');
    }
  }

  private endRound(winner: 'animals' | 'butcher') {
    this.state.phase = 'ended';

    // Calculate survival rewards and summary
    const summaryPlayers: MatchSummaryPlayer[] = [];
    let mvp: PlayerSchema | null = null;
    let maxScore = -1;

    this.state.players.forEach((player) => {
      if (winner === 'animals' && player.role !== 'butcher' && !player.isDowned) {
        player.survived = true;
        player.score += GAME_CONSTANTS.SCORES.ESCAPED_ALIVE;
      }

      if (player.score > maxScore) {
        maxScore = player.score;
        mvp = player;
      }

      summaryPlayers.push({
        profileId: player.id,
        username: player.username,
        animal: player.animal,
        markFinal: player.mark,
        score: player.score,
        becameButcher: player.role === 'butcher',
        volunteered: player.volunteered,
        kills: player.kills,
        survived: player.survived,
        wasBot: player.isBot,
      });
    });

    const summary: MatchSummary = {
      matchId: this.roomId,
      winner,
      roundDuration: GAME_CONSTANTS.ROUND_DURATION_SEC - Math.max(0, Math.ceil(this.roundTimer)),
      playerCount: this.state.players.size,
      botCount: this.state.botPlayersCount,
      mvpId: mvp?.id || '',
      mvpUsername: mvp?.username || 'Unknown',
      players: summaryPlayers,
    };

    this.broadcast(NETWORK_MESSAGES.ROUND_ENDED, {
      winner,
      summary,
    });

    if (!this.matchRecorded) {
      this.matchRecorded = true;
      recordMatchResult(summary).catch((err) => {
        console.warn('[FarmRoom] Supabase write error:', err);
      });
    }
  }
}
