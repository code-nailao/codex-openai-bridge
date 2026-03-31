import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { Codex } from '@openai/codex-sdk';

import type { BridgeConfig } from '../config/env.js';

function copyAuthCacheIfMissing(config: BridgeConfig) {
  const sourceAuthPath = join(config.runtime.sourceCodexHomeDir, 'auth.json');
  const isolatedAuthPath = join(config.runtime.isolatedCodexHomeDir, 'auth.json');

  mkdirSync(config.runtime.isolatedHomeDir, { recursive: true });
  mkdirSync(config.runtime.isolatedCodexHomeDir, { recursive: true });

  if (!existsSync(isolatedAuthPath) && existsSync(sourceAuthPath)) {
    copyFileSync(sourceAuthPath, isolatedAuthPath);
  }
}

function inheritProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}

export function createBridgeCodexClient(config: BridgeConfig): Codex {
  copyAuthCacheIfMissing(config);

  const env = inheritProcessEnv();
  env.HOME = config.runtime.isolatedHomeDir;
  env.CODEX_HOME = config.runtime.isolatedCodexHomeDir;

  return new Codex({
    env,
    config: {
      cli_auth_credentials_store: 'file',
      shell_environment_policy: {
        set: {
          HOME: config.runtime.userHomeDir,
        },
      },
    },
  });
}
