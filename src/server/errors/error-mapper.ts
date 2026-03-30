import { ZodError } from 'zod';

import {
  BridgeError,
  createApprovalRequiredError,
  createInternalServerError,
  createInvalidRequestError,
  createRateLimitError,
  createUpstreamTimeoutError,
  createUpstreamUnavailableError,
  type OpenAIErrorBody,
} from './bridge-error.js';

function normalizeRuntimeMessage(message: string): BridgeError {
  if (/approval required/i.test(message)) {
    return createApprovalRequiredError(message);
  }

  if (/rate limit/i.test(message)) {
    return createRateLimitError(message);
  }

  if (/timed out|timeout/i.test(message)) {
    return createUpstreamTimeoutError(message);
  }

  if (/spawn .*ENOENT|codex.*not found|failed to start/i.test(message)) {
    return createUpstreamUnavailableError(message);
  }

  return createInternalServerError(message);
}

export function normalizeError(error: unknown): BridgeError {
  if (error instanceof BridgeError) {
    return error;
  }

  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const path = issue?.path.join('.');
    return createInvalidRequestError(issue?.message ?? 'Invalid request payload.', path || undefined);
  }

  if (error instanceof Error) {
    return normalizeRuntimeMessage(error.message);
  }

  return createInternalServerError();
}

export function mapErrorToResponse(error: unknown): { statusCode: number; body: OpenAIErrorBody } {
  const normalized = normalizeError(error);

  return {
    statusCode: normalized.statusCode,
    body: normalized.toResponseBody(),
  };
}
