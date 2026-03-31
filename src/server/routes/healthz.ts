import type { FastifyInstance } from 'fastify';

import type { HealthServiceLike } from '../../services/health-service.js';

export function registerHealthzRoute(app: FastifyInstance, healthService: HealthServiceLike) {
  app.get('/healthz', async () => healthService.check());
}
