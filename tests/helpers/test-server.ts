import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RuntimeLike } from '../../src/contracts/runtime.js';
import { createApp } from '../../src/app.js';

export async function buildTestApp(options?: { env?: NodeJS.ProcessEnv; runtime?: RuntimeLike }) {
  const tempDir = mkdtempSync(join(tmpdir(), 'codex-openai-bridge-'));
  const app = await createApp({
    env: {
      ...options?.env,
      SQLITE_PATH: join(tempDir, 'bridge.sqlite'),
    },
    ...(options?.runtime ? { runtime: options.runtime } : {}),
  });
  await app.ready();
  return app;
}
