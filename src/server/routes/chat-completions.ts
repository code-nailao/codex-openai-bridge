import type { FastifyInstance } from 'fastify';

import { mapUsage, normalizeChatRequest, toChatCompletionResponse } from '../../adapters/chat-adapter.js';
import { normalizeRuntimeStream } from '../../runtime/normalized-stream.js';
import { readOptionalHeader } from '../request-headers.js';
import {
  createRequestAbortController,
  createStreamErrorBody,
  ensureRuntimeThreadId,
  setSessionResponseHeaders,
} from '../route-support.js';
import { createSseStream, startHeartbeat, writeSseData } from '../sse/sse-stream.js';
import { streamChatCompletion } from '../sse/chat-stream.js';
import type { BridgeServices } from '../bridge-context.js';
import { resolveWorkingDirectory } from '../workspace.js';
import { createSessionId } from '../../utils/ids.js';

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
      const abortController = createRequestAbortController(request);

      if (!normalizedRequest.stream) {
        const result = await runtime.run({
          input: normalizedRequest.input,
          threadOptions: normalizedRequest.threadOptions,
          signal: abortController.signal,
          ...(threadId ? { threadId } : {}),
        });
        const resolvedThreadId = ensureRuntimeThreadId(result.threadId);

        services.sessionStore.upsertSession({
          sessionId,
          threadId: resolvedThreadId,
          modelAlias: normalizedRequest.modelAlias.id,
          workspaceCwd: workingDirectory,
        });

        setSessionResponseHeaders(reply, {
          sessionId,
          threadId: resolvedThreadId,
        });

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

      setSessionResponseHeaders(reply, {
        sessionId,
        threadId: normalizedStream.threadId,
      });
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
          writeSseData(stream, createStreamErrorBody(error));
        } finally {
          stopHeartbeat();
          stream.end();
        }
      })();

      return reply;
    });
  });
}
