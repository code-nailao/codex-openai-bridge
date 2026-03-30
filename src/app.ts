import Fastify, { type FastifyInstance } from 'fastify';

import { loadEnvConfig } from './config/env.js';
import { registerModelsRoute } from './server/routes/models.js';

export async function createApp(options?: { env?: NodeJS.ProcessEnv }): Promise<FastifyInstance> {
  const config = loadEnvConfig(options?.env);
  const app = Fastify({
    logger: false,
  });

  app.get('/healthz', () => ({
    status: 'ok',
    service: config.service.name,
    version: config.service.version,
    checks: {
      sqlite: 'unknown',
      codex_cli: 'unknown',
    },
  }));

  registerModelsRoute(app, config);

  return app;
}
