import packageJson from '../../package.json' with { type: 'json' };
import { z } from 'zod';

import { createModelCatalog, type ModelAlias } from './models.js';
import { createRuntimePolicy, type RuntimePolicy } from './runtime-policy.js';

const envSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOCAL_BRIDGE_API_KEY: z.string().min(1).optional(),
  BRIDGE_DISABLE_AUTH: z.enum(['true', 'false', '1', '0']).optional(),
  CODEX_MODEL: z.string().default('gpt-5-codex'),
});

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
  runtimePolicy: RuntimePolicy;
  models: ModelAlias[];
};

function isAuthDisabled(rawValue: string | undefined): boolean {
  return rawValue === 'true' || rawValue === '1';
}

export function loadEnvConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const parsedEnv = envSchema.parse(env);
  const authEnabled = !isAuthDisabled(parsedEnv.BRIDGE_DISABLE_AUTH);

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
    runtimePolicy: createRuntimePolicy(),
    models: createModelCatalog(parsedEnv.CODEX_MODEL),
  };
}
