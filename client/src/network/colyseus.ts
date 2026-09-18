import { Client, Room } from '@colyseus/sdk';

// Global handler to suppress benign WebSocket closure and Vite HMR disconnect rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = String(event.reason?.message || event.reason || '');
    if (
      reasonStr.includes('WebSocket closed') ||
      reasonStr.includes('WebSocket') ||
      reasonStr.includes('vite') ||
      reasonStr.includes('connection timed out')
    ) {
      console.warn('[ColyseusNetwork] Handled expected WebSocket event:', reasonStr);
      event.preventDefault();
    }
  });
}

const getServerUrl = (): string => {
  const envUrl = import.meta.env.VITE_SERVER_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '' && !envUrl.includes('placeholder')) {
    return envUrl;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3000';
};

export class ColyseusNetwork {
  private client: Client;
  private room: Room | null = null;
  private serverUrl: string;

  constructor() {
    this.serverUrl = getServerUrl();
    console.log(`[ColyseusNetwork] Initializing client for: ${this.serverUrl}`);
    this.client = new Client(this.serverUrl);
  }

  public getClient(): Client {
    return this.client;
  }

  public getRoom(): Room | null {
    return this.room;
  }

  public isConnected(): boolean {
    return Boolean(this.room && this.room.sessionId);
  }

  public async joinFarmRoom(options: { username?: string; profileId?: string } = {}): Promise<Room> {
    const timeoutMs = 4000;
    try {
      console.log(`[ColyseusNetwork] Joining 'farm' room at ${this.serverUrl}...`, options);

      // Protect joinPromise from emitting unhandled rejection if race timeout wins
      let joinHandled = false;
      const joinPromise = this.client.joinOrCreate('farm', options).catch((err) => {
        if (!joinHandled) {
          throw err;
        }
        console.warn('[ColyseusNetwork] Suppressed late join rejection:', err);
        return null as any;
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          joinHandled = true;
          reject(new Error(`Colyseus connection timed out after ${timeoutMs}ms`));
        }, timeoutMs)
      );

      const res = await Promise.race([joinPromise, timeoutPromise]);
      joinHandled = true;
      if (!res) {
        throw new Error('Connection closed or invalid room instance');
      }
      this.room = res;
      console.log(`[ColyseusNetwork] Successfully joined room: ${this.room.roomId} (${this.room.sessionId})`);
      return this.room;
    } catch (err) {
      console.warn('[ColyseusNetwork] Room join failed or timed out:', err);
      throw err;
    }
  }

  public send(type: string, message?: any): void {
    if (this.room) {
      try {
        this.room.send(type, message);
      } catch (e) {
        console.warn('[ColyseusNetwork] Send failed:', e);
      }
    }
  }

  public leave(): void {
    if (this.room) {
      try {
        this.room.leave();
      } catch (e) {}
      this.room = null;
    }
  }
}

export const colyseusNetwork = new ColyseusNetwork();
