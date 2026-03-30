import type { FastifyInstance } from 'fastify';

import { createResponseObject, normalizeResponsesRequest } from '../../adapters/responses-adapter.js';
import { readOptionalHeader } from '../request-headers.js';
import { createRequestAbortController, createStreamErrorBody } from '../route-support.js';
import { resolveSessionContinuation } from '../session-resolution.js';
import { writeNamedSseEvent } from '../sse/sse-stream.js';
import { streamResponses } from '../sse/responses-stream.js';
import type { BridgeServices } from '../bridge-context.js';
import { resolveWorkingDirectory } from '../workspace.js';
import { createResponseId } from '../../utils/ids.js';
import { executeNonStreamRuntime, executeStreamRuntime, openStreamingReply, persistSessionContext } from '../request-execution.js';

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
        runtime,
        input: normalizedRequest.input,
        threadOptions: normalizedRequest.threadOptions,
        signal: abortController.signal,
        threadId: resolvedSession.threadId,
      };

      if (!normalizedRequest.stream) {
        const result = await executeNonStreamRuntime(runtimeParams);
        const responseId = createResponseId();

        persistSessionContext({
          sessionStore: services.sessionStore,
          reply,
          sessionId: resolvedSession.sessionId,
          threadId: result.threadId,
          modelId: normalizedRequest.model.id,
          workspaceCwd: workingDirectory,
        });
        services.sessionStore.upsertResponse({
          responseId,
          sessionId: resolvedSession.sessionId,
          threadId: result.threadId,
        });

        return createResponseObject({
          responseId,
          model: normalizedRequest.model.id,
          text: result.finalResponse,
          usage: result.usage,
        });
      }

      const normalizedStream = await executeStreamRuntime(runtimeParams);
      const responseId = createResponseId();
      const createdAt = new Date();

      persistSessionContext({
        sessionStore: services.sessionStore,
        reply,
        sessionId: resolvedSession.sessionId,
        threadId: normalizedStream.threadId,
        modelId: normalizedRequest.model.id,
        workspaceCwd: workingDirectory,
      });
      services.sessionStore.upsertResponse({
        responseId,
        sessionId: resolvedSession.sessionId,
        threadId: normalizedStream.threadId,
      });
      const { stream, close } = openStreamingReply(reply);

      void (async () => {
        try {
          await streamResponses({
            stream,
            events: normalizedStream.events,
            responseId,
            model: normalizedRequest.model.id,
            createdAt,
          });
        } catch (error) {
          writeNamedSseEvent(stream, 'error', createStreamErrorBody(error));
        } finally {
          close();
        }
      })();

      return reply;
    });
  });
}
