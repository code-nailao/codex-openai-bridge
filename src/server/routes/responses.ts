import type { FastifyInstance } from 'fastify';

import { createResponseObject, normalizeResponsesRequest } from '../../adapters/responses-adapter.js';
import { normalizeRuntimeStream } from '../../runtime/normalized-stream.js';
import { readOptionalHeader } from '../request-headers.js';
import {
  createRequestAbortController,
  createStreamErrorBody,
  ensureRuntimeThreadId,
  setSessionResponseHeaders,
} from '../route-support.js';
import { resolveSessionContinuation } from '../session-resolution.js';
import { createSseStream, startHeartbeat, writeNamedSseEvent } from '../sse/sse-stream.js';
import { streamResponses } from '../sse/responses-stream.js';
import type { BridgeServices } from '../bridge-context.js';
import { resolveWorkingDirectory } from '../workspace.js';
import { createResponseId } from '../../utils/ids.js';

export function registerResponsesRoute(app: FastifyInstance, services: BridgeServices) {
  app.post('/v1/responses', async (request, reply) => {
    const workingDirectory = resolveWorkingDirectory(services.config, request);
    const normalizedRequest = normalizeResponsesRequest(request.body, services.config, {
      workingDirectory,
    });
    const requestedSessionId = readOptionalHeader(request, 'x-session-id');
    const resolvedSession = resolveSessionContinuation({
      sessionStore: services.sessionStore,
      requestedSessionId,
      previousResponseId: normalizedRequest.previousResponseId,
    });

    return services.lockManager.withSessionLock(resolvedSession.sessionId, async () => {
      const runtime = services.getRuntime();
      const abortController = createRequestAbortController(request);

      const runtimeParams = {
        input: normalizedRequest.input,
        threadOptions: normalizedRequest.threadOptions,
        signal: abortController.signal,
        ...(resolvedSession.threadId ? { threadId: resolvedSession.threadId } : {}),
      };

      if (!normalizedRequest.stream) {
        const result = await runtime.run(runtimeParams);
        const threadId = ensureRuntimeThreadId(result.threadId);
        const responseId = createResponseId();

        services.sessionStore.upsertSession({
          sessionId: resolvedSession.sessionId,
          threadId,
          modelAlias: normalizedRequest.modelAlias.id,
          workspaceCwd: workingDirectory,
        });
        services.sessionStore.upsertResponse({
          responseId,
          sessionId: resolvedSession.sessionId,
          threadId,
        });

        setSessionResponseHeaders(reply, {
          sessionId: resolvedSession.sessionId,
          threadId,
        });

        return createResponseObject({
          responseId,
          model: normalizedRequest.modelAlias.id,
          text: result.finalResponse,
          usage: result.usage,
        });
      }

      const runtimeStream = await runtime.runStreamed(runtimeParams);
      const normalizedStream = await normalizeRuntimeStream(runtimeStream);
      const responseId = createResponseId();
      const createdAt = new Date();

      services.sessionStore.upsertSession({
        sessionId: resolvedSession.sessionId,
        threadId: normalizedStream.threadId,
        modelAlias: normalizedRequest.modelAlias.id,
        workspaceCwd: workingDirectory,
      });
      services.sessionStore.upsertResponse({
        responseId,
        sessionId: resolvedSession.sessionId,
        threadId: normalizedStream.threadId,
      });

      setSessionResponseHeaders(reply, {
        sessionId: resolvedSession.sessionId,
        threadId: normalizedStream.threadId,
      });
      const stream = createSseStream(reply);
      const stopHeartbeat = startHeartbeat(stream);

      void (async () => {
        try {
          await streamResponses({
            stream,
            events: normalizedStream.events,
            responseId,
            model: normalizedRequest.modelAlias.id,
            createdAt,
          });
        } catch (error) {
          writeNamedSseEvent(stream, 'error', createStreamErrorBody(error));
        } finally {
          stopHeartbeat();
          stream.end();
        }
      })();

      return reply;
    });
  });
}
