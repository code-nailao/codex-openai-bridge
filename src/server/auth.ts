import type { FastifyRequest } from 'fastify';

import type { BridgeConfig } from '../config/env.js';
import { createUnauthorizedError } from './errors/bridge-error.js';

function getBearerToken(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function enforceRequestAuth(config: BridgeConfig, request: FastifyRequest) {
  if (!config.auth.enabled) {
    return;
  }

  if (!request.url.startsWith('/v1/')) {
    return;
  }

  const token = getBearerToken(request.headers.authorization);
  if (!token || token !== config.auth.apiKey) {
    throw createUnauthorizedError();
  }
}
