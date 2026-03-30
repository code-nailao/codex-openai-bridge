import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

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
    expect(serializedEntries).not.toContain('input');
  });
});
