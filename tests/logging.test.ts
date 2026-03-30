import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BridgeLogger } from '../src/observability/bridge-logger.js';
import { FileLogSink, resolveDevLogFilePath } from '../src/observability/file-log-sink.js';

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
});
