import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { FarmRoom } from './rooms/FarmRoom.ts';
import { getServerSupabase } from './services/supabase.ts';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 2567;
const CLIENT_URL = process.env.CLIENT_URL || '*';

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// Server health check & info endpoint
app.get('/api/health', (_req, res) => {
  const supabase = getServerSupabase();
  res.json({
    status: 'ok',
    game: 'Farm Fatale Colyseus Server',
    port: PORT,
    supabaseConnected: Boolean(supabase),
    timestamp: new Date().toISOString(),
  });
});

const httpServer = http.createServer(app);

// Instantiate Colyseus game server
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    pingInterval: 5000,
    pingMaxRetries: 3,
  }),
});

// Register the primary authoritative room
gameServer.define('farm', FarmRoom);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`🌾 Farm Fatale Colyseus Server Running!`);
  console.log(`📡 WebSocket URL: ws://localhost:${PORT}`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`=========================================`);
});
