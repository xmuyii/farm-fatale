import { Schema, type, MapSchema } from '@colyseus/schema';
import { AnimalType, Role, MarkTier, GamePhase } from '../../../../shared/types.ts';
import { GAME_CONSTANTS } from '../../../../shared/constants.ts';

export class PlayerSchema extends Schema {
  @type('string') id: string = '';
  @type('string') sessionId: string = '';
  @type('string') username: string = 'Animal';
  @type('string') animal: AnimalType = 'pig';
  @type('string') role: Role = 'prey';
  @type('number') x: number = 1200;
  @type('number') y: number = 1200;
  @type('number') vx: number = 0;
  @type('number') vy: number = 0;
  @type('number') hp: number = 1;
  @type('number') maxHp: number = 1;
  @type('number') speed: number = 180;
  @type('number') mark: number = 0;
  @type('string') markTier: MarkTier = 'clean';
  @type('boolean') isDowned: boolean = false;
  @type('boolean') isStealthed: boolean = false;
  @type('boolean') isStunned: boolean = false;
  @type('boolean') isBot: boolean = false;
  @type('boolean') hasRerolled: boolean = false;
  @type('number') score: number = 0;
  @type('number') kills: number = 0;
  @type('boolean') volunteered: boolean = false;
  @type('boolean') survived: boolean = false;
  @type('number') lastMarkTimestamp: number = 0;
  @type('number') primaryCdExpiresAt: number = 0;
  @type('number') betrayalCdExpiresAt: number = 0;
  @type('number') utilityCdExpiresAt: number = 0; // Snare
  @type('number') specialCdExpiresAt: number = 0; // Dog Whistle
  @type('number') buffExpiresAt: number = 0;
  @type('string') activeBuffType: string = '';
  @type('number') downedAt: number = 0;
}

export class TrapSchema extends Schema {
  @type('string') id: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('boolean') triggered: boolean = false;
  @type('string') placedBySessionId: string = '';
}

export class HoundSchema extends Schema {
  @type('string') id: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') targetX: number = 0;
  @type('number') targetY: number = 0;
  @type('number') expiresAt: number = 0;
}

export class AltarSchema extends Schema {
  @type('number') x: number = GAME_CONSTANTS.ALTAR_POSITION.x;
  @type('number') y: number = GAME_CONSTANTS.ALTAR_POSITION.y;
  @type('number') radius: number = GAME_CONSTANTS.ALTAR_RADIUS_PX;
  @type('number') demand: number = 1;
  @type('number') sacrificesCount: number = 0;
  @type('boolean') isActive: boolean = false;
  @type('boolean') isClosed: boolean = false;
  @type('string') activeBuff: string = '';
  @type('number') buffExpiresAt: number = 0;
}

export class FarmState extends Schema {
  @type('string') phase: GamePhase = 'lobby';
  @type('number') phaseTimeRemaining: number = GAME_CONSTANTS.ROUND_DURATION_SEC;
  @type('number') lobbyTimeRemaining: number = GAME_CONSTANTS.LOBBY_BOT_FILL_TIMEOUT_SEC;
  @type('number') roundDuration: number = GAME_CONSTANTS.ROUND_DURATION_SEC;
  @type('string') butcherSessionId: string = '';
  @type(AltarSchema) altar: AltarSchema = new AltarSchema();
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ map: TrapSchema }) traps = new MapSchema<TrapSchema>();
  @type({ map: HoundSchema }) hounds = new MapSchema<HoundSchema>();
  @type('number') revealMarksUntil: number = 0;
  @type('number') humanPlayersCount: number = 0;
  @type('number') botPlayersCount: number = 0;
}
