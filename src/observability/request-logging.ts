import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Usage } from '@openai/codex-sdk';

import type { BridgeConfig } from '../config/env.js';
import type { LoggerLike } from './bridge-logger.js';
import { shouldIncludeContentPreview, summarizeLogText, type LogContentSummary } from './log-content.js';

type PrimitiveLogValue = string | number | boolean | null;

type RequestLogContext = {
  model?: string;
  stream?: boolean;
  reasoningEffort?: string;
  requestContentType?: string;
  requestBodyKind?: string;
  requestBodyKeys?: string;
  requestReasoningEffortKind?: string;
  requestReasoningEffortRaw?: PrimitiveLogValue;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  error?: {
    type: string;
    code: string;
  };
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

function describeValueKind(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
}

function serializeRequestBody(body: unknown): string | null {
  if (body === undefined) {
    return null;
  }

  if (typeof body === 'string') {
    return body;
  }

  try {
    return JSON.stringify(body);
  } catch {
    return `[unserializable:${describeValueKind(body)}]`;
  }
}

function extractReasoningEffortMetadata(body: unknown): {
  kind?: string;
  raw?: PrimitiveLogValue;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Reflect.has(body, 'reasoning_effort')) {
    return {};
  }

  const rawValue: unknown = Reflect.get(body, 'reasoning_effort');
  const kind = describeValueKind(rawValue);

  if (
    rawValue === null ||
    typeof rawValue === 'string' ||
    typeof rawValue === 'number' ||
    typeof rawValue === 'boolean'
  ) {
    return {
      kind,
      raw: rawValue,
    };
  }

  return { kind };
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
  const includeErrorDiagnostics = statusCode >= 400;
  const fields: Record<string, string | number | boolean | null> = {
    ...(context?.stream !== undefined ? { stream: context.stream } : {}),
    ...(context?.reasoningEffort ? { reasoning_effort: context.reasoningEffort } : {}),
    ...(context?.usage
      ? {
          input_tokens: context.usage.inputTokens,
          output_tokens: context.usage.outputTokens,
          total_tokens: context.usage.totalTokens,
        }
      : {}),
    ...(context?.error
      ? {
          error_type: context.error.type,
          error_code: context.error.code,
        }
      : {}),
    ...(includeErrorDiagnostics && context?.requestContentType
      ? { request_content_type: context.requestContentType }
      : {}),
    ...(includeErrorDiagnostics && context?.requestBodyKind
      ? { request_body_kind: context.requestBodyKind }
      : {}),
    ...(includeErrorDiagnostics && context?.requestBodyKeys
      ? { request_body_keys: context.requestBodyKeys }
      : {}),
    ...(includeErrorDiagnostics && context?.requestReasoningEffortKind
      ? { request_reasoning_effort_kind: context.requestReasoningEffortKind }
      : {}),
    ...(includeErrorDiagnostics && context?.requestReasoningEffortRaw !== undefined
      ? { request_reasoning_effort_raw: context.requestReasoningEffortRaw }
      : {}),
  };

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

export function annotateRequestLogUsage(request: FastifyRequest, usage: Usage | null) {
  annotateRequestLogContext(request, {
    usage: {
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
    },
  });
}

export function annotateRequestLogError(
  request: FastifyRequest,
  error: {
    type: string;
    code: string;
  },
) {
  annotateRequestLogContext(request, {
    error,
  });
}

function annotateParsedRequestBody(request: FastifyRequest, logging: BridgeConfig['logging']) {
  const serializedBody = serializeRequestBody(request.body);
  const reasoningEffort = extractReasoningEffortMetadata(request.body);
  const contentType = headerValueToString(request.headers['content-type']);
  const bodyKeys =
    request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? Object.keys(request.body).sort().join(',') || undefined
      : undefined;

  annotateRequestLogContext(request, {
    ...(contentType ? { requestContentType: contentType } : {}),
    ...(request.body !== undefined ? { requestBodyKind: describeValueKind(request.body) } : {}),
    ...(bodyKeys ? { requestBodyKeys: bodyKeys } : {}),
    ...(reasoningEffort.kind ? { requestReasoningEffortKind: reasoningEffort.kind } : {}),
    ...(reasoningEffort.raw !== undefined || reasoningEffort.kind === 'null'
      ? { requestReasoningEffortRaw: reasoningEffort.raw ?? null }
      : {}),
    ...(serializedBody ? { requestContent: summarizeLogText(serializedBody, logging) } : {}),
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

  app.addHook('preValidation', (request, _reply, done) => {
    annotateParsedRequestBody(request, logging);
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
