import type { FastifyReply, FastifyRequest } from 'fastify';

import { createInternalServerError } from './errors/bridge-error.js';
import { mapErrorToResponse } from './errors/error-mapper.js';

export function createRequestAbortController(request: FastifyRequest): AbortController {
  const abortController = new AbortController();
  request.raw.once('close', () => {
    abortController.abort();
  });

  return abortController;
}

export function ensureRuntimeThreadId(threadId: string | null): string {
  if (!threadId) {
    throw createInternalServerError('The Codex runtime completed without a thread id.');
  }

  return threadId;
}

export function setSessionResponseHeaders(
  reply: FastifyReply,
  input: { sessionId: string; threadId: string },
) {
  reply.header('x-session-id', input.sessionId);
  reply.header('x-codex-thread-id', input.threadId);
}

export function createStreamErrorBody(error: unknown) {
  return mapErrorToResponse(error).body;
}
