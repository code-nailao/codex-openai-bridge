import type { FastifyInstance } from 'fastify';

import type { BridgeConfig } from '../../config/env.js';

export function registerModelsRoute(app: FastifyInstance, config: BridgeConfig) {
  app.get('/v1/models', () => ({
    object: 'list',
    data: config.models,
  }));
}
