import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RuntimeLike } from '../../src/contracts/runtime.js';
import { createApp } from '../../src/app.js';
import type { LoggerLike } from '../../src/observability/bridge-logger.js';
import type { HealthServiceLike } from '../../src/services/health-service.js';
import type { SessionStore } from '../../src/store/session-store.js';

export async function buildTestApp(options?: {
  env?: NodeJS.ProcessEnv;
  runtime?: RuntimeLike;
  sessionStore?: SessionStore;
  healthService?: HealthServiceLike;
  logger?: LoggerLike;
}) {
  const tempDir = mkdtempSync(join(tmpdir(), 'codex-openai-bridge-'));
  const app = await createApp({
    env: {
      BRIDGE_LOG_MODE: 'silent',
      ...options?.env,
      SQLITE_PATH: join(tempDir, 'bridge.sqlite'),
    },
    ...(options?.runtime ? { runtime: options.runtime } : {}),
    ...(options?.sessionStore ? { sessionStore: options.sessionStore } : {}),
    ...(options?.healthService ? { healthService: options.healthService } : {}),
    ...(options?.logger ? { logger: options.logger } : {}),
  });
  await app.ready();
  return app;
}
