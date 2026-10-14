import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRouter } from './routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const distDir = path.resolve(here, '../../frontend/dist');

export function createApp(bus, options = {}) {
  const staticDir = options.distDir ?? distDir;
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.get('/api/stats', (_req, res) => {
    res.json(bus.stats());
  });

  app.use('/api', createRouter(bus));

  app.use(express.static(staticDir));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const indexHtml = path.join(staticDir, 'index.html');
    if (!fs.existsSync(indexHtml)) {
      res
        .status(200)
        .type('text/plain; charset=utf-8')
        .send('API работает. Сборка frontend не найдена - выполните: cd frontend && npm run build');
      return;
    }
    res.sendFile(indexHtml);
  });

  app.use((error, _req, res, _next) => {
    console.error('[server] unhandled error:', error);
    if (res.headersSent) return;
    res.status(500).json({ ok: false, error: 'internal' });
  });

  return app;
}
