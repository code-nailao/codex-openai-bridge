import { afterEach, describe, expect, it } from 'vitest';

import { buildTestApp } from './helpers/test-server.js';
import type { HealthServiceLike } from '../src/services/health-service.js';

const openApps: Array<{ close: () => Promise<unknown> }> = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('GET /healthz', () => {
  it('returns service metadata with active probe results', async () => {
    const healthService: HealthServiceLike = {
      check() {
        return Promise.resolve({
          status: 'ok',
          service: 'codex-openai-bridge',
          version: '0.1.0',
          checks: {
            sqlite: {
              status: 'ok',
            },
            codex_cli: {
              status: 'ok',
              version: 'codex 0.117.0',
            },
          },
        });
      },
    };

    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
      },
      healthService,
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
        sqlite: {
          status: 'ok',
        },
        codex_cli: {
          status: 'ok',
          version: 'codex 0.117.0',
        },
      },
    });
  });
});
