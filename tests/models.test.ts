import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadEnvConfig } from '../src/config/env.js';
import { buildTestApp } from './helpers/test-server.js';

const openApps: Array<{ close: () => Promise<unknown> }> = [];
const originalCwd = process.cwd();

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
  process.chdir(originalCwd);
});

describe('loadEnvConfig', () => {
  it('applies documented defaults when auth is configured', () => {
    const config = loadEnvConfig(
      {
        LOCAL_BRIDGE_API_KEY: 'test-key',
      },
      {
        envFilePath: false,
      },
    );

    expect(config.server.host).toBe('127.0.0.1');
    expect(config.server.port).toBe(8787);
    expect(config.auth.enabled).toBe(true);
    expect(config.auth.apiKey).toBe('test-key');
    expect(config.runtimePolicy.sandboxMode).toBe('read-only');
    expect(config.runtimePolicy.approvalPolicy).toBe('never');
    expect(config.workspace.root).toBe(resolve('.codex-openai-bridge/workspaces/default-chat'));
    expect(config.workspace.allowedRoots).toEqual([resolve('.codex-openai-bridge/workspaces/default-chat')]);
    expect(config.models.map((model) => model.id)).toEqual([
      'gpt-5.4',
      'gpt-5.3-codex',
      'gpt-5.2',
      'gpt-5.2-codex',
      'gpt-5.1-codex-max',
      'gpt-5.1-codex-mini',
    ]);
  });

  it('loads a local env file and lets explicit env override file values', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'codex-openai-bridge-env-'));
    const envFilePath = join(tempDir, '.env');
    writeFileSync(
      envFilePath,
      ['LOCAL_BRIDGE_API_KEY=file-key', 'HOST=127.0.0.2', 'PORT=9000', 'BRIDGE_DISABLE_AUTH=false'].join('\n'),
    );

    const config = loadEnvConfig(
      {
        LOCAL_BRIDGE_API_KEY: 'override-key',
      },
      {
        envFilePath,
      },
    );

    expect(config.server.host).toBe('127.0.0.2');
    expect(config.server.port).toBe(9000);
    expect(config.auth.enabled).toBe(true);
    expect(config.auth.apiKey).toBe('override-key');
  });

  it('uses an explicit CODEX_WORKSPACE_ROOT when provided', () => {
    const config = loadEnvConfig(
      {
        LOCAL_BRIDGE_API_KEY: 'test-key',
        CODEX_WORKSPACE_ROOT: './custom-workspace',
      },
      {
        envFilePath: false,
      },
    );

    expect(config.workspace.root).toBe(resolve('./custom-workspace'));
    expect(config.workspace.allowedRoots).toEqual([resolve('./custom-workspace')]);
  });

  it('does not implicitly load .env when the caller already provided an env object', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'codex-openai-bridge-cwd-'));
    writeFileSync(join(tempDir, '.env'), 'HOST=127.0.0.9\n');
    process.chdir(tempDir);

    const config = loadEnvConfig({
      LOCAL_BRIDGE_API_KEY: 'test-key',
    });

    expect(config.server.host).toBe('127.0.0.1');
  });
});

describe('GET /v1/models', () => {
  it('returns the supported local models without probing upstream', async () => {
    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
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
          id: 'gpt-5.4',
          object: 'model',
          owned_by: 'codex-openai-bridge',
          resolved_model: 'gpt-5.4',
        },
        {
          id: 'gpt-5.3-codex',
          object: 'model',
          owned_by: 'codex-openai-bridge',
          resolved_model: 'gpt-5.3-codex',
        },
        {
          id: 'gpt-5.2',
          object: 'model',
          owned_by: 'codex-openai-bridge',
          resolved_model: 'gpt-5.2',
        },
        {
          id: 'gpt-5.2-codex',
          object: 'model',
          owned_by: 'codex-openai-bridge',
          resolved_model: 'gpt-5.2-codex',
        },
        {
          id: 'gpt-5.1-codex-max',
          object: 'model',
          owned_by: 'codex-openai-bridge',
          resolved_model: 'gpt-5.1-codex-max',
        },
        {
          id: 'gpt-5.1-codex-mini',
          object: 'model',
          owned_by: 'codex-openai-bridge',
          resolved_model: 'gpt-5.1-codex-mini',
        },
      ],
    });
  });
});
