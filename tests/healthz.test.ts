import { afterEach, describe, expect, it } from 'vitest';

import { buildTestApp } from './helpers/test-server.js';

const openApps: Array<{ close: () => Promise<unknown> }> = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('GET /healthz', () => {
  it('returns service metadata and health status', async () => {
    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
      },
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'codex-openai-bridge',
      version: '0.1.0',
      checks: {
        sqlite: 'unknown',
        codex_cli: 'unknown',
      },
    });
  });
});
