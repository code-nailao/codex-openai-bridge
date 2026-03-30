import Fastify, { type FastifyInstance } from 'fastify';

import packageJson from '../package.json' with { type: 'json' };

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  app.get('/healthz', () => ({
    status: 'ok',
    service: 'codex-openai-bridge',
    version: packageJson.version,
    checks: {
      sqlite: 'unknown',
      codex_cli: 'unknown',
    },
  }));

  return app;
}
