import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const sdkState = vi.hoisted(() => {
  const constructorCalls: unknown[] = [];

  class MockCodex {
    public constructor(options?: unknown) {
      constructorCalls.push(options);
    }

    public startThread() {
      return {
        id: 'thread-runtime-isolation',
        run: () => Promise.resolve({
          finalResponse: 'Hello from mocked Codex',
          items: [],
          usage: null,
        }),
        runStreamed: () =>
          Promise.resolve({
            events: (async function* () {})(),
          }),
      };
    }

    public resumeThread() {
      return this.startThread();
    }
  }

  return {
    constructorCalls,
    MockCodex,
  };
});

vi.mock('@openai/codex-sdk', () => ({
  Codex: sdkState.MockCodex,
}));

const openApps: Array<{ close: () => Promise<unknown> }> = [];
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  sdkState.constructorCalls.length = 0;
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

function createSessionStoreStub() {
  return {
    getSession() {
      return null;
    },
    upsertSession() {},
    getResponse() {
      return null;
    },
    upsertResponse() {},
    ping() {},
    close() {},
  };
}

describe('default runtime isolation', () => {
  it('constructs Codex with isolated homes and seeds only auth cache from the user Codex home', async () => {
    const projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'codex-openai-bridge-runtime-')));
    const sourceHome = join(projectRoot, 'source-home');
    const sourceCodexHome = join(sourceHome, '.codex');
    const sourceSkillDir = join(sourceHome, '.agents/skills/example-skill');

    mkdirSync(sourceCodexHome, { recursive: true });
    mkdirSync(sourceSkillDir, { recursive: true });
    writeFileSync(join(sourceCodexHome, 'auth.json'), '{"auth_mode":"chatgpt","has_refresh_token":true}');
    writeFileSync(join(sourceCodexHome, 'config.toml'), 'model = "gpt-5.4"\n');
    writeFileSync(join(sourceCodexHome, 'AGENTS.md'), '# user guidance\n');
    writeFileSync(join(sourceSkillDir, 'SKILL.md'), '# example skill\n');

    process.chdir(projectRoot);

    const { buildTestApp } = await import('./helpers/test-server.js');
    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
        HOME: sourceHome,
      },
      sessionStore: createSessionStoreStub() as never,
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'Say hello.' }],
      },
    });

    expect(response.statusCode).toBe(200);

    const isolatedHome = resolve(projectRoot, '.codex-openai-bridge/runtime/home');
    const isolatedCodexHome = resolve(projectRoot, '.codex-openai-bridge/runtime/codex-home');
    const constructorOptions = sdkState.constructorCalls[0] as {
      env: Record<string, string>;
      config: {
        cli_auth_credentials_store: string;
        shell_environment_policy: {
          set: Record<string, string>;
        };
      };
    };

    expect(constructorOptions.env.HOME).toBe(isolatedHome);
    expect(constructorOptions.env.CODEX_HOME).toBe(isolatedCodexHome);
    expect(constructorOptions.config).toEqual({
      cli_auth_credentials_store: 'file',
      shell_environment_policy: {
        set: {
          HOME: sourceHome,
        },
      },
    });

    const isolatedAuthPath = join(isolatedCodexHome, 'auth.json');
    expect(existsSync(isolatedAuthPath)).toBe(true);
    expect(readFileSync(isolatedAuthPath, 'utf8')).toBe(readFileSync(join(sourceCodexHome, 'auth.json'), 'utf8'));
    expect(existsSync(join(isolatedCodexHome, 'config.toml'))).toBe(false);
    expect(existsSync(join(isolatedCodexHome, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(isolatedHome, '.agents/skills/example-skill/SKILL.md'))).toBe(false);
  });
});
