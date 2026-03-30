import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

import packageJson from '../../package.json' with { type: 'json' };
import { z } from 'zod';

import { createModelCatalog, type SupportedModel } from './models.js';
import { createRuntimePolicy, type RuntimePolicy } from './runtime-policy.js';

const envSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOCAL_BRIDGE_API_KEY: z.string().min(1).optional(),
  BRIDGE_DISABLE_AUTH: z.enum(['true', 'false', '1', '0']).optional(),
  SQLITE_PATH: z.string().optional(),
  CODEX_WORKSPACE_ROOT: z.string().optional(),
  BRIDGE_ENABLE_CWD_OVERRIDE: z.enum(['true', 'false', '1', '0']).optional(),
  BRIDGE_ALLOWED_CWD_ROOTS: z.string().optional(),
});

const DEFAULT_WORKSPACE_ROOT = '.codex-openai-bridge/workspaces/default-chat';

export type BridgeConfig = {
  service: {
    name: 'codex-openai-bridge';
    version: string;
  };
  server: {
    host: string;
    port: number;
  };
  auth: {
    enabled: boolean;
    apiKey: string | null;
  };
  storage: {
    dbPath: string;
  };
  workspace: {
    root: string;
    allowHeaderOverride: boolean;
    allowedRoots: string[];
    provisionIfMissing: boolean;
  };
  runtimePolicy: RuntimePolicy;
  models: SupportedModel[];
};

function isEnabled(rawValue: string | undefined): boolean {
  return rawValue === 'true' || rawValue === '1';
}

function loadEnvFileValues(envFilePath: string | false | undefined): NodeJS.ProcessEnv {
  if (envFilePath === false) {
    return {};
  }

  const resolvedEnvFilePath = resolve(envFilePath ?? '.env');
  if (!existsSync(resolvedEnvFilePath)) {
    return {};
  }

  return parseEnv(readFileSync(resolvedEnvFilePath, 'utf8'));
}

function shouldLoadEnvFile(env: NodeJS.ProcessEnv, options?: LoadEnvConfigOptions): boolean {
  if (options?.envFilePath === false) {
    return false;
  }

  if (typeof options?.envFilePath === 'string') {
    return true;
  }

  return env === process.env;
}

function resolveWorkspaceConfig(parsedEnv: z.infer<typeof envSchema>): BridgeConfig['workspace'] {
  const provisionIfMissing = !parsedEnv.CODEX_WORKSPACE_ROOT;
  const root = resolve(parsedEnv.CODEX_WORKSPACE_ROOT ?? DEFAULT_WORKSPACE_ROOT);

  const allowedRoots = parsedEnv.BRIDGE_ALLOWED_CWD_ROOTS
    ? parsedEnv.BRIDGE_ALLOWED_CWD_ROOTS.split(',').map((entry) => resolve(entry.trim())).filter(Boolean)
    : [root];

  return {
    root,
    allowHeaderOverride: isEnabled(parsedEnv.BRIDGE_ENABLE_CWD_OVERRIDE),
    allowedRoots,
    provisionIfMissing,
  };
}

export type LoadEnvConfigOptions = {
  envFilePath?: string | false;
};

export function loadEnvConfig(
  env: NodeJS.ProcessEnv = process.env,
  options?: LoadEnvConfigOptions,
): BridgeConfig {
  const parsedEnv = envSchema.parse({
    ...(shouldLoadEnvFile(env, options) ? loadEnvFileValues(options?.envFilePath) : {}),
    ...env,
  });
  const authEnabled = !isEnabled(parsedEnv.BRIDGE_DISABLE_AUTH);

  if (authEnabled && !parsedEnv.LOCAL_BRIDGE_API_KEY) {
    throw new Error('LOCAL_BRIDGE_API_KEY is required when auth is enabled.');
  }

  return {
    service: {
      name: 'codex-openai-bridge',
      version: packageJson.version,
    },
    server: {
      host: parsedEnv.HOST,
      port: parsedEnv.PORT,
    },
    auth: {
      enabled: authEnabled,
      apiKey: parsedEnv.LOCAL_BRIDGE_API_KEY ?? null,
    },
    storage: {
      dbPath: resolve(parsedEnv.SQLITE_PATH ?? '.codex-openai-bridge/bridge.sqlite'),
    },
    workspace: resolveWorkspaceConfig(parsedEnv),
    runtimePolicy: createRuntimePolicy(),
    models: createModelCatalog(),
  };
}
