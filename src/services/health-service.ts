import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { BridgeConfig } from '../config/env.js';
import type { SessionStore } from '../store/session-store.js';

const execFileAsync = promisify(execFile);

export type HealthCheckResult =
  | {
      status: 'ok';
      version?: string;
    }
  | {
      status: 'error';
      message: string;
    };

export type HealthReport = {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  checks: {
    sqlite: HealthCheckResult;
    codex_cli: HealthCheckResult;
  };
};

export interface HealthServiceLike {
  check(): Promise<HealthReport>;
}

type CachedCodexProbe = {
  checkedAtMs: number;
  result: HealthCheckResult;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown health probe error.';
}

export async function fetchCodexVersion(): Promise<string> {
  const { stdout, stderr } = await execFileAsync('codex', ['--version'], {
    timeout: 3000,
  });

  const version = stdout.trim() || stderr.trim();
  return version || 'codex version unavailable';
}

export class HealthService implements HealthServiceLike {
  private cachedCodexProbe: CachedCodexProbe | null = null;

  public constructor(
    private readonly options: {
      config: BridgeConfig;
      sessionStore: SessionStore;
      codexVersionFetcher?: () => Promise<string>;
      codexProbeCacheTtlMs?: number;
    },
  ) {}

  public async check(): Promise<HealthReport> {
    const sqlite = this.checkSqlite();
    const codexCli = await this.checkCodexCli();

    return {
      status: sqlite.status === 'ok' && codexCli.status === 'ok' ? 'ok' : 'degraded',
      service: this.options.config.service.name,
      version: this.options.config.service.version,
      checks: {
        sqlite,
        codex_cli: codexCli,
      },
    };
  }

  private checkSqlite(): HealthCheckResult {
    try {
      this.options.sessionStore.ping();
      return {
        status: 'ok',
      };
    } catch (error) {
      return {
        status: 'error',
        message: toErrorMessage(error),
      };
    }
  }

  private async checkCodexCli(): Promise<HealthCheckResult> {
    const now = Date.now();
    const cacheTtlMs = this.options.codexProbeCacheTtlMs ?? 60_000;
    if (this.cachedCodexProbe && now - this.cachedCodexProbe.checkedAtMs < cacheTtlMs) {
      return this.cachedCodexProbe.result;
    }

    const result = await this.probeCodexCli();
    this.cachedCodexProbe = {
      checkedAtMs: now,
      result,
    };
    return result;
  }

  private async probeCodexCli(): Promise<HealthCheckResult> {
    try {
      const version = await (this.options.codexVersionFetcher ?? fetchCodexVersion)();
      return {
        status: 'ok',
        version,
      };
    } catch (error) {
      return {
        status: 'error',
        message: toErrorMessage(error),
      };
    }
  }
}
