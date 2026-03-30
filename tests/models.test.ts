import { afterEach, describe, expect, it } from 'vitest';

import { loadEnvConfig } from '../src/config/env.js';
import { buildTestApp } from './helpers/test-server.js';

const openApps: Array<{ close: () => Promise<unknown> }> = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe('loadEnvConfig', () => {
  it('applies documented defaults when auth is configured', () => {
    const config = loadEnvConfig({
      LOCAL_BRIDGE_API_KEY: 'test-key',
    });

    expect(config.server.host).toBe('127.0.0.1');
    expect(config.server.port).toBe(8787);
    expect(config.auth.enabled).toBe(true);
    expect(config.auth.apiKey).toBe('test-key');
    expect(config.runtimePolicy.sandboxMode).toBe('read-only');
    expect(config.runtimePolicy.approvalPolicy).toBe('never');
    expect(config.models.map((model) => model.id)).toEqual(['gpt-5', 'codex']);
  });
});

describe('GET /v1/models', () => {
  it('returns the local model aliases without probing upstream', async () => {
    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
        CODEX_MODEL: 'gpt-5-codex',
      },
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/models',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      object: 'list',
      data: [
        {
          id: 'gpt-5',
          object: 'model',
          owned_by: 'codex-openai-bridge',
          resolved_model: null,
        },
        {
          id: 'codex',
          object: 'model',
          owned_by: 'codex-openai-bridge',
          resolved_model: 'gpt-5-codex',
        },
      ],
    });
  });
});
