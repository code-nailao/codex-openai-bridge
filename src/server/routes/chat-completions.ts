import type { FastifyInstance } from 'fastify';

import { mapUsage, normalizeChatRequest, toChatCompletionResponse } from '../../adapters/chat-adapter.js';
import type { RuntimeRunResult } from '../../contracts/runtime.js';
import { normalizeRuntimeStream } from '../../runtime/normalized-stream.js';
import { createApprovalRequiredError, createInternalServerError } from '../errors/bridge-error.js';
import { mapErrorToResponse, normalizeError } from '../errors/error-mapper.js';
import { readOptionalHeader } from '../request-headers.js';
import { createSseStream, startHeartbeat, writeSseData } from '../sse/sse-stream.js';
import { streamChatCompletion } from '../sse/chat-stream.js';
import type { BridgeServices } from '../bridge-context.js';
import { resolveWorkingDirectory } from '../workspace.js';
import { createSessionId } from '../../utils/ids.js';

function ensureThreadId(result: Pick<RuntimeRunResult, 'threadId'>): string {
  if (!result.threadId) {
    throw createInternalServerError('The Codex runtime completed without a thread id.');
  }

  return result.threadId;
}

export function registerChatCompletionsRoute(app: FastifyInstance, services: BridgeServices) {
  app.post('/v1/chat/completions', async (request, reply) => {
    const workingDirectory = resolveWorkingDirectory(services.config, request);
    const normalizedRequest = normalizeChatRequest(request.body, services.config, {
      workingDirectory,
    });
    const requestedSessionId = readOptionalHeader(request, 'x-session-id');
    const sessionId = requestedSessionId ?? createSessionId();

    return services.lockManager.withSessionLock(sessionId, async () => {
      const runtime = services.getRuntime();
      const existingSession = services.sessionStore.getSession(sessionId);
      const threadId = existingSession?.threadId;
      const abortController = new AbortController();
      request.raw.once('close', () => {
        abortController.abort();
      });

      if (!normalizedRequest.stream) {
        const result = await runtime.run({
          input: normalizedRequest.input,
          threadOptions: normalizedRequest.threadOptions,
          signal: abortController.signal,
          ...(threadId ? { threadId } : {}),
        });
        const resolvedThreadId = ensureThreadId(result);

        services.sessionStore.upsertSession({
          sessionId,
          threadId: resolvedThreadId,
          modelAlias: normalizedRequest.modelAlias.id,
          workspaceCwd: workingDirectory,
        });

        reply.header('x-session-id', sessionId);
        reply.header('x-codex-thread-id', resolvedThreadId);

        return toChatCompletionResponse({
          model: normalizedRequest.modelAlias.id,
          content: result.finalResponse,
          usage: mapUsage(result.usage),
        });
      }

      const runtimeStream = await runtime.runStreamed({
        input: normalizedRequest.input,
        threadOptions: normalizedRequest.threadOptions,
        signal: abortController.signal,
        ...(threadId ? { threadId } : {}),
      });
      const normalizedStream = await normalizeRuntimeStream(runtimeStream);

      services.sessionStore.upsertSession({
        sessionId,
        threadId: normalizedStream.threadId,
        modelAlias: normalizedRequest.modelAlias.id,
        workspaceCwd: workingDirectory,
      });

      reply.header('x-session-id', sessionId);
      reply.header('x-codex-thread-id', normalizedStream.threadId);
      const stream = createSseStream(reply);
      const stopHeartbeat = startHeartbeat(stream);
      const created = Math.floor(Date.now() / 1000);
      const responseId = `chatcmpl_${sessionId.replace(/^sess_/, '')}`;

      void (async () => {
        try {
          await streamChatCompletion({
            stream,
            events: normalizedStream.events,
            responseId,
            model: normalizedRequest.modelAlias.id,
            created,
          });
        } catch (error) {
          const normalizedError = normalizeError(error);
          if (normalizedError.code === 'approval_required') {
            writeSseData(stream, createApprovalRequiredError(normalizedError.message).toResponseBody());
          } else {
            writeSseData(stream, mapErrorToResponse(error).body);
          }
        } finally {
          stopHeartbeat();
          stream.end();
        }
      })();

      return reply;
    });
  });
}
