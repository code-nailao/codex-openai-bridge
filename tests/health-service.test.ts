import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadEnvConfig } from '../src/config/env.js';
import { HealthService } from '../src/services/health-service.js';
import { SessionStore } from '../src/store/session-store.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'codex-openai-bridge-health-'));
  tempDirs.push(dir);
  return join(dir, 'bridge.sqlite');
}

function createConfig(dbPath: string) {
  return loadEnvConfig(
    {
      BRIDGE_DISABLE_AUTH: 'true',
      SQLITE_PATH: dbPath,
    },
    {
      envFilePath: false,
    },
  );
}

describe('HealthService', () => {
  it('caches the codex CLI probe within the configured ttl', async () => {
    const dbPath = createDbPath();
    const sessionStore = new SessionStore({ dbPath });
    let fetchCount = 0;
    const service = new HealthService({
      config: createConfig(dbPath),
      sessionStore,
      codexVersionFetcher: () => {
        fetchCount += 1;
        return Promise.resolve('codex-cli test-version');
      },
      codexProbeCacheTtlMs: 60_000,
    });

    const firstReport = await service.check();
    const secondReport = await service.check();

    expect(firstReport.checks.codex_cli).toEqual({
      status: 'ok',
      version: 'codex-cli test-version',
    });
    expect(secondReport.checks.codex_cli).toEqual({
      status: 'ok',
      version: 'codex-cli test-version',
    });
    expect(fetchCount).toBe(1);

    sessionStore.close();
  });

  it('returns degraded when the codex CLI probe fails', async () => {
    const dbPath = createDbPath();
    const sessionStore = new SessionStore({ dbPath });
    const service = new HealthService({
      config: createConfig(dbPath),
      sessionStore,
      codexVersionFetcher: () => Promise.reject(new Error('codex missing')),
    });

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.checks.sqlite).toEqual({
      status: 'ok',
    });
    expect(report.checks.codex_cli).toEqual({
      status: 'error',
      message: 'codex missing',
    });

    sessionStore.close();
  });

  it('returns degraded when sqlite ping fails', async () => {
    const dbPath = createDbPath();
    const sessionStore = new SessionStore({ dbPath });
    sessionStore.close();

    const service = new HealthService({
      config: createConfig(dbPath),
      sessionStore,
      codexVersionFetcher: () => Promise.resolve('codex-cli test-version'),
    });

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.checks.sqlite.status).toBe('error');
    expect(report.checks.codex_cli).toEqual({
      status: 'ok',
      version: 'codex-cli test-version',
    });
  });
});
