import type { FastifyInstance } from 'fastify';

import type { BridgeConfig } from '../../config/env.js';

export function registerHealthzRoute(app: FastifyInstance, config: BridgeConfig) {
  app.get('/healthz', () => ({
    status: 'ok',
    service: config.service.name,
    version: config.service.version,
    checks: {
      sqlite: 'unknown',
      codex_cli: 'unknown',
    },
  }));
}
