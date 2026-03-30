import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { LoggerLike } from './bridge-logger.js';

type RequestLogContext = {
  model?: string;
};

const requestLogContext = new WeakMap<FastifyRequest, RequestLogContext>();

function headerValueToString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.join(',');
  }

  return null;
}

function extractRequestModel(request: FastifyRequest): string | null {
  const context = requestLogContext.get(request);
  if (context?.model) {
    return context.model;
  }

  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  const maybeModel: unknown = Reflect.get(body, 'model');
  return typeof maybeModel === 'string' ? maybeModel : null;
}

function toLatencyMilliseconds(startedAt: bigint | undefined): number | null {
  if (!startedAt) {
    return null;
  }

  return Number(((process.hrtime.bigint() - startedAt) / 1_000_000n).toString());
}

export function annotateRequestLogContext(request: FastifyRequest, fields: RequestLogContext) {
  requestLogContext.set(request, {
    ...(requestLogContext.get(request) ?? {}),
    ...fields,
  });
}

export function registerRequestLogging(app: FastifyInstance, logger: LoggerLike) {
  const requestStartedAt = new WeakMap<FastifyRequest, bigint>();

  app.addHook('onRequest', (request, _reply, done) => {
    requestStartedAt.set(request, process.hrtime.bigint());
    requestLogContext.set(request, {});
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    logger.info('http_request', {
      request_id: request.id,
      method: request.method,
      path: request.url.split('?')[0] ?? request.url,
      status_code: reply.statusCode,
      latency_ms: toLatencyMilliseconds(requestStartedAt.get(request)),
      session_id: headerValueToString(reply.getHeader('x-session-id')),
      thread_id: headerValueToString(reply.getHeader('x-codex-thread-id')),
      model: extractRequestModel(request),
    });
    requestLogContext.delete(request);
    done();
  });
}
