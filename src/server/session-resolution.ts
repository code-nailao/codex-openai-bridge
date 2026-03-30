import { createSessionId } from '../utils/ids.js';
import type { SessionStore } from '../store/session-store.js';
import { createInvalidRequestError, createSessionConflictError } from './errors/bridge-error.js';

export type ResolvedSession = {
  sessionId: string;
  threadId: string | null;
};

export function resolveSessionContinuation(options: {
  sessionStore: SessionStore;
  requestedSessionId: string | null;
  previousResponseId: string | null;
}): ResolvedSession {
  const sessionRecord = options.requestedSessionId
    ? options.sessionStore.getSession(options.requestedSessionId)
    : null;
  const responseRecord = options.previousResponseId
    ? options.sessionStore.getResponse(options.previousResponseId)
    : null;

  if (options.previousResponseId && !responseRecord) {
    throw createInvalidRequestError('The previous_response_id value does not exist.', 'previous_response_id');
  }

  if (sessionRecord && responseRecord && sessionRecord.threadId !== responseRecord.threadId) {
    throw createSessionConflictError();
  }

  return {
    sessionId: options.requestedSessionId ?? responseRecord?.sessionId ?? createSessionId(),
    threadId: sessionRecord?.threadId ?? responseRecord?.threadId ?? null,
  };
}
