import type { FastifyRequest } from 'fastify';

import { createInvalidRequestError } from './errors/bridge-error.js';

export function readOptionalHeader(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name];

  if (value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    throw createInvalidRequestError(`The ${name} header must be a single string value.`, name);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
