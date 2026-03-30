import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { BridgeConfig } from '../config/env.js';
import type { LoggerLike } from './bridge-logger.js';
import { shouldIncludeContentPreview, summarizeLogText, type LogContentSummary } from './log-content.js';

type RequestLogContext = {
  model?: string;
  requestContent?: LogContentSummary;
  responseContent?: LogContentSummary;
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

function buildContentFields(
  request: FastifyRequest,
  statusCode: number,
  logging: BridgeConfig['logging'],
): Record<string, string | number | boolean | null> {
  const context = requestLogContext.get(request);
  const includePreview = shouldIncludeContentPreview(logging, statusCode);
  const fields: Record<string, string | number | boolean | null> = {};

  if (context?.requestContent) {
    fields.request_chars = context.requestContent.chars;
    if (includePreview && context.requestContent.preview !== undefined) {
      fields.request_preview = context.requestContent.preview;
      fields.request_truncated = context.requestContent.truncated ?? false;
    }
  }

  if (context?.responseContent) {
    fields.response_chars = context.responseContent.chars;
    if (includePreview && context.responseContent.preview !== undefined) {
      fields.response_preview = context.responseContent.preview;
      fields.response_truncated = context.responseContent.truncated ?? false;
    }
  }

  return fields;
}

export function annotateRequestLogRequest(
  request: FastifyRequest,
  text: string,
  logging: BridgeConfig['logging'],
) {
  annotateRequestLogContext(request, {
    requestContent: summarizeLogText(text, logging),
  });
}

export function annotateRequestLogResponse(
  request: FastifyRequest,
  text: string,
  logging: BridgeConfig['logging'],
) {
  annotateRequestLogContext(request, {
    responseContent: summarizeLogText(text, logging),
  });
}

export function registerRequestLogging(
  app: FastifyInstance,
  logger: LoggerLike,
  logging: BridgeConfig['logging'],
) {
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
      ...buildContentFields(request, reply.statusCode, logging),
    });
    requestLogContext.delete(request);
    done();
  });
}
