/**
 * Bootstrap — single entry called by `node dist/index.js` or `tsx src/index.ts`.
 */

import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { logger } from './obs/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  app.addHook('onClose', async () => {
    logger.info('server closing');
  });

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(
      { port: config.port, env: config.env, admin: config.enableAdmin },
      'farm-game-server listening',
    );
  } catch (err) {
    logger.fatal({ err }, 'listen failed');
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('bootstrap failed', err);
  process.exit(1);
});