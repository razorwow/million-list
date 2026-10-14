import fs from 'node:fs';
import path from 'node:path';

import { createApp, distDir } from './app.js';
import { createBus } from './queue.js';

const port = Number(process.env.PORT) || 4000;

const bus = createBus();
const app = createApp(bus);

const server = app.listen(port, () => {
  const hasUi = fs.existsSync(path.join(distDir, 'index.html'));
  console.log(`[server] listening on http://localhost:${port}`);
  console.log(`[server] frontend bundle: ${hasUi ? distDir : 'not built yet'}`);
  const { config } = bus.stats();
  console.log(`[server] batching: normal=${config.normalMs}ms add=${config.addMs}ms`);
});

function shutdown(signal) {
  console.log(`[server] ${signal} received, flushing queue and exiting`);
  bus.flushAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
