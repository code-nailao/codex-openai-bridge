import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { RuntimeLike, RuntimeRunParams, RuntimeRunResult, RuntimeStreamResult } from '../src/contracts/runtime.js';
import { BridgeLogger, type LoggerLike } from '../src/observability/bridge-logger.js';
import { FileLogSink, resolveDevLogFilePath } from '../src/observability/file-log-sink.js';
import { buildTestApp } from './helpers/test-server.js';
import { FakeRuntime } from './helpers/fake-runtime.js';

const openApps: Array<{ close: () => Promise<unknown> }> = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

class MemoryLogger implements LoggerLike {
  public readonly entries: Array<Record<string, unknown>> = [];

  public info(event: string, fields?: Record<string, unknown>) {
    this.entries.push({
      level: 'info',
      event,
      ...(fields ?? {}),
    });
  }

  public error(event: string, fields?: Record<string, unknown>) {
    this.entries.push({
      level: 'error',
      event,
      ...(fields ?? {}),
    });
  }

  public close() {}
}

class RejectingRuntime implements RuntimeLike {
  public readonly runCalls: RuntimeRunParams[] = [];
  public readonly runStreamedCalls: RuntimeRunParams[] = [];

  public constructor(private readonly error: Error) {}

  public async run(params: RuntimeRunParams): Promise<RuntimeRunResult> {
    this.runCalls.push(params);
    await Promise.reject(this.error);
    throw this.error;
  }

  public async runStreamed(params: RuntimeRunParams): Promise<RuntimeStreamResult> {
    this.runStreamedCalls.push(params);
    await Promise.reject(this.error);
    throw this.error;
  }
}

describe('dev file logging', () => {
  it('uses the documented log/dev/yy-mm/yy-mm-dd.log layout', () => {
    const logPath = resolveDevLogFilePath('/tmp/codex-openai-bridge-logs', new Date('2026-03-31T12:00:00.000Z'));

    expect(logPath).toBe('/tmp/codex-openai-bridge-logs/26-03/26-03-31.log');
  });

  it('writes structured json lines into the daily dev log file', () => {
    const logRoot = mkdtempSync(join(tmpdir(), 'codex-openai-bridge-logs-'));
    const logTime = new Date('2026-03-31T12:00:00.000Z');
    const sink = new FileLogSink({ rootDir: logRoot });
    const logger = new BridgeLogger({ sink });

    logger.info(
      'http_request',
      {
        request_id: 'req-123',
        session_id: 'sess-123',
        thread_id: 'thread-123',
        model: 'gpt-5.4',
        status_code: 200,
        latency_ms: 42,
      },
      logTime,
    );
    sink.close();

    const logFilePath = resolveDevLogFilePath(logRoot, logTime);
    const lines = readFileSync(logFilePath, 'utf8').trim().split('\n');

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      timestamp: '2026-03-31T12:00:00.000Z',
      level: 'info',
      event: 'http_request',
      request_id: 'req-123',
      session_id: 'sess-123',
      thread_id: 'thread-123',
      model: 'gpt-5.4',
      status_code: 200,
      latency_ms: 42,
    });
  });

  it('logs the effective default model when a request omits model', async () => {
    const logger = new MemoryLogger();
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-log-default-model',
        finalResponse: 'OK',
        items: [],
        usage: null,
      },
      {
        threadId: 'thread-log-default-model',
        events: (async function* () {
          await Promise.resolve();
          yield* [];
        })(),
      },
    );
    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
      },
      runtime,
      logger,
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        messages: [{ role: 'user', content: 'Reply with OK.' }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: 'info',
        event: 'http_request',
        model: 'gpt-5.4',
        status_code: 200,
      }),
    );
  });

  it('does not leak prompt content into request logs', async () => {
    const logger = new MemoryLogger();
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-log-redaction',
        finalResponse: 'OK',
        items: [],
        usage: null,
      },
      {
        threadId: 'thread-log-redaction',
        events: (async function* () {
          await Promise.resolve();
          yield* [];
        })(),
      },
    );
    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
      },
      runtime,
      logger,
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        messages: [{ role: 'user', content: 'super-secret-prompt-value' }],
      },
    });

    expect(response.statusCode).toBe(200);
    const serializedEntries = JSON.stringify(logger.entries);

    expect(serializedEntries).not.toContain('super-secret-prompt-value');
    expect(serializedEntries).not.toContain('messages');
    expect(serializedEntries).not.toContain('request_preview');
    expect(serializedEntries).not.toContain('response_preview');
  });

  it('logs redacted content previews when full content logging is enabled', async () => {
    const logger = new MemoryLogger();
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-log-content-full',
        finalResponse: 'token=reply-secret with a deliberately long response tail',
        items: [],
        usage: null,
      },
      {
        threadId: 'thread-log-content-full',
        events: (async function* () {
          await Promise.resolve();
          yield* [];
        })(),
      },
    );
    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
        BRIDGE_LOG_CONTENT_MODE: 'full',
        BRIDGE_LOG_MAX_CONTENT_CHARS: '48',
      },
      runtime,
      logger,
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        messages: [{ role: 'user', content: 'Authorization: Bearer super-secret-token and extra trailing text' }],
      },
    });

    expect(response.statusCode).toBe(200);
    const requestLog = logger.entries.find((entry) => entry.event === 'http_request');

    expect(requestLog).toMatchObject({
      level: 'info',
      event: 'http_request',
      status_code: 200,
      request_truncated: true,
      response_truncated: true,
    });
    expect(requestLog?.request_chars).toEqual(expect.any(Number));
    expect(requestLog?.request_preview).toEqual(expect.any(String));
    expect(requestLog?.response_chars).toEqual(expect.any(Number));
    expect(requestLog?.response_preview).toEqual(expect.any(String));

    const serializedEntries = JSON.stringify(logger.entries);
    expect(serializedEntries).toContain('Bearer [REDACTED]');
    expect(serializedEntries).toContain('token=[REDACTED]');
    expect(serializedEntries).not.toContain('super-secret-token');
    expect(serializedEntries).not.toContain('reply-secret');
  });

  it('logs normalized stream, reasoning, and usage metadata for successful requests', async () => {
    const logger = new MemoryLogger();
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-log-usage',
        finalResponse: 'OK',
        items: [],
        usage: {
          input_tokens: 21,
          cached_input_tokens: 0,
          output_tokens: 8,
        },
      },
      {
        threadId: 'thread-log-usage',
        events: (async function* () {
          await Promise.resolve();
          yield* [];
        })(),
      },
    );
    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
      },
      runtime,
      logger,
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        stream: false,
        reasoning_effort: 'high',
        messages: [{ role: 'user', content: 'Reply with OK.' }],
      },
    });

    expect(response.statusCode).toBe(200);
    const requestLog = logger.entries.find((entry) => entry.event === 'http_request');

    expect(requestLog).toMatchObject({
      level: 'info',
      event: 'http_request',
      status_code: 200,
      stream: false,
      reasoning_effort: 'high',
      input_tokens: 21,
      output_tokens: 8,
      total_tokens: 29,
    });
  });

  it('logs the final streamed response preview when full content logging is enabled', async () => {
    const logger = new MemoryLogger();
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-log-stream',
        finalResponse: 'unused',
        items: [],
        usage: null,
      },
      {
        threadId: 'thread-log-stream',
        events: (async function* () {
          await Promise.resolve();
          yield { type: 'thread.started', thread_id: 'thread-log-stream' };
          yield {
            type: 'item.completed',
            item: {
              id: 'item-stream',
              type: 'agent_message',
              text: 'stream-token=secret-value',
            },
          };
          yield {
            type: 'turn.completed',
            usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 },
          };
        })(),
      },
    );
    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
        BRIDGE_LOG_CONTENT_MODE: 'full',
      },
      runtime,
      logger,
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        stream: true,
        messages: [{ role: 'user', content: 'stream please' }],
      },
    });

    expect(response.statusCode).toBe(200);
    const requestLog = logger.entries.find((entry) => entry.event === 'http_request');

    expect(requestLog).toMatchObject({
      level: 'info',
      event: 'http_request',
      status_code: 200,
      response_chars: 'stream-token=secret-value'.length,
      response_preview: 'stream-token=[REDACTED]',
      response_truncated: false,
    });
  });

  it('only logs content previews for failed requests when errors-only mode is enabled', async () => {
    const logger = new MemoryLogger();
    const runtime = new RejectingRuntime(new Error('approval required: token=error-secret'));
    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
        BRIDGE_LOG_CONTENT_MODE: 'errors-only',
      },
      runtime,
      logger,
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        messages: [{ role: 'user', content: 'password=super-secret-request' }],
      },
    });

    expect(response.statusCode).toBe(409);
    const requestLog = logger.entries.find((entry) => entry.event === 'http_request');

    expect(requestLog).toMatchObject({
      level: 'info',
      event: 'http_request',
      status_code: 409,
      stream: false,
      reasoning_effort: 'medium',
      error_type: 'invalid_request_error',
      error_code: 'approval_required',
      response_preview: 'approval required: token=[REDACTED]',
    });
    expect(requestLog?.request_chars).toEqual(expect.any(Number));
    expect(requestLog?.request_preview).toEqual(expect.any(String));

    const serializedEntries = JSON.stringify(logger.entries);
    expect(serializedEntries).toContain('password=[REDACTED]');
    expect(serializedEntries).not.toContain('super-secret-request');
    expect(serializedEntries).not.toContain('error-secret');
  });
});
