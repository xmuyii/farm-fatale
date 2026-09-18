import config, { listen } from '@colyseus/tools';
import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { FarmRoom } from './server/src/rooms/FarmRoom.ts';

const PORT = 3000;

const appConfig = config({
  initializeExpress: async (app) => {
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
        server: { middlewareMode: true },
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
  },
  initializeGameServer: (gameServer) => {
    gameServer.define('farm', FarmRoom);
  },
});

listen(appConfig, PORT)
  .then(() => {
    console.log(`[FarmFatale] Server listening on http://0.0.0.0:${PORT}`);
  })
  .catch((err) => {
    console.error('[FarmFatale] Failed to start server:', err);
    process.exit(1);
  });
