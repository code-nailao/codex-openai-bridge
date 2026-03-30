import type { FastifyInstance } from 'fastify';

import { mapUsage, normalizeChatRequest, toChatCompletionResponse } from '../../adapters/chat-adapter.js';
import { annotateRequestLogContext } from '../../observability/request-logging.js';
import { readOptionalHeader } from '../request-headers.js';
import { createRequestAbortController, createStreamErrorBody } from '../route-support.js';
import { writeSseData } from '../sse/sse-stream.js';
import { streamChatCompletion } from '../sse/chat-stream.js';
import type { BridgeServices } from '../bridge-context.js';
import { resolveWorkingDirectory } from '../workspace.js';
import { createSessionId } from '../../utils/ids.js';
import { executeNonStreamRuntime, executeStreamRuntime, openStreamingReply, persistSessionContext } from '../request-execution.js';

export function registerChatCompletionsRoute(app: FastifyInstance, services: BridgeServices) {
  app.post('/v1/chat/completions', async (request, reply) => {
    const workingDirectory = resolveWorkingDirectory(services.config, request);
    const normalizedRequest = normalizeChatRequest(request.body, services.config, {
      workingDirectory,
    });
    annotateRequestLogContext(request, {
      model: normalizedRequest.model.id,
    });
    const requestedSessionId = readOptionalHeader(request, 'x-session-id');
    const sessionId = requestedSessionId ?? createSessionId();

    return services.lockManager.withSessionLock(sessionId, async () => {
      const runtime = services.getRuntime();
      const existingSession = services.sessionStore.getSession(sessionId);
      const threadId = existingSession?.threadId;
      const abortController = createRequestAbortController(request);

      if (!normalizedRequest.stream) {
        const result = await executeNonStreamRuntime({
          runtime,
          input: normalizedRequest.input,
          threadOptions: normalizedRequest.threadOptions,
          signal: abortController.signal,
          threadId,
        });

        persistSessionContext({
          sessionStore: services.sessionStore,
          reply,
          sessionId,
          threadId: result.threadId,
          modelId: normalizedRequest.model.id,
          workspaceCwd: workingDirectory,
        });

        return toChatCompletionResponse({
          model: normalizedRequest.model.id,
          content: result.finalResponse,
          usage: mapUsage(result.usage),
        });
      }

      const normalizedStream = await executeStreamRuntime({
        runtime,
        input: normalizedRequest.input,
        threadOptions: normalizedRequest.threadOptions,
        signal: abortController.signal,
        threadId,
      });

      persistSessionContext({
        sessionStore: services.sessionStore,
        reply,
        sessionId,
        threadId: normalizedStream.threadId,
        modelId: normalizedRequest.model.id,
        workspaceCwd: workingDirectory,
      });
      const { stream, close } = openStreamingReply(reply);
      const created = Math.floor(Date.now() / 1000);
      const responseId = `chatcmpl_${sessionId.replace(/^sess_/, '')}`;

      void (async () => {
        try {
          await streamChatCompletion({
            stream,
            events: normalizedStream.events,
            responseId,
            model: normalizedRequest.model.id,
            created,
          });
        } catch (error) {
          writeSseData(stream, createStreamErrorBody(error));
        } finally {
          close();
        }
      })();

      return reply;
    });
  });
}
