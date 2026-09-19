import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer as createViteServer } from 'vite';
import { FarmRoom } from './server/src/rooms/FarmRoom.ts';

const PORT = 3000;

async function startServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // API health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      game: 'Farm Fatale',
      timestamp: Date.now(),
    });
  });

  // Vite middleware in dev or static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);

  const gameServer = new Server({
    transport: new WebSocketTransport({
      server: httpServer,
      pingInterval: 5000,
      pingMaxRetries: 3,
    }),
  });

  gameServer.define('farm', FarmRoom);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[FarmFatale] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[FarmFatale] Failed to start server:', err);
  process.exit(1);
});
