import { mkdirSync } from 'node:fs';

import Fastify, { type FastifyInstance } from 'fastify';

import { loadEnvConfig, type BridgeConfig } from './config/env.js';
import type { RuntimeLike } from './contracts/runtime.js';
import { BridgeLogger, createNoopLogger, type LoggerLike } from './observability/bridge-logger.js';
import { FileLogSink } from './observability/file-log-sink.js';
import { annotateRequestLogError, annotateRequestLogResponse, registerRequestLogging } from './observability/request-logging.js';
import { CodexRuntime } from './runtime/codex-runtime.js';
import { HealthService, type HealthServiceLike } from './services/health-service.js';
import { enforceRequestAuth } from './server/auth.js';
import type { BridgeServices } from './server/bridge-context.js';
import { mapErrorToResponse } from './server/errors/error-mapper.js';
import { registerChatCompletionsRoute } from './server/routes/chat-completions.js';
import { registerHealthzRoute } from './server/routes/healthz.js';
import { registerModelsRoute } from './server/routes/models.js';
import { registerResponsesRoute } from './server/routes/responses.js';
import { SessionLockManager } from './store/locks.js';
import { SessionStore } from './store/session-store.js';

export type CreateAppOptions = {
  config?: BridgeConfig;
  env?: NodeJS.ProcessEnv;
  envFilePath?: string | false;
  runtime?: RuntimeLike;
  sessionStore?: SessionStore;
  lockManager?: SessionLockManager;
  healthService?: HealthServiceLike;
  logger?: LoggerLike;
};

function createLogger(config: BridgeConfig): LoggerLike {
  switch (config.logging.mode) {
    case 'silent':
      return createNoopLogger();
    case 'stdout':
      return new BridgeLogger();
    case 'dev-file':
    default:
      return new BridgeLogger({
        sink: new FileLogSink({
          rootDir: config.logging.dir,
        }),
      });
  }
}

export async function createApp(options?: CreateAppOptions): Promise<FastifyInstance> {
  const config =
    options?.config ??
    loadEnvConfig(
      options?.env,
      options?.envFilePath !== undefined ? { envFilePath: options.envFilePath } : undefined,
    );
  if (config.workspace.provisionIfMissing) {
    mkdirSync(config.workspace.root, { recursive: true });
  }

  const app = Fastify({
    logger: false,
  });
  const logger = options?.logger ?? createLogger(config);

  let runtime = options?.runtime ?? null;
  const sessionStore = options?.sessionStore ?? new SessionStore({ dbPath: config.storage.dbPath });
  const services: BridgeServices = {
    config,
    getRuntime() {
      runtime ??= new CodexRuntime();
      return runtime;
    },
    sessionStore,
    lockManager: options?.lockManager ?? new SessionLockManager(),
    healthService: options?.healthService ?? new HealthService({ config, sessionStore }),
  };
  const ownsSessionStore = !options?.sessionStore;
  const ownsLogger = !options?.logger;

  app.addHook('onRequest', (request, reply, done) => {
    try {
      enforceRequestAuth(config, request);
      done();
    } catch (error) {
      done(error as Error);
    }
  });
  registerRequestLogging(app, logger, config.logging);

  app.setErrorHandler((error, request, reply) => {
    const response = mapErrorToResponse(error);
    annotateRequestLogError(request, response.body.error);
    annotateRequestLogResponse(request, response.body.error.message, config.logging);
    reply.code(response.statusCode).send(response.body);
  });

  app.addHook('onClose', () => {
    if (ownsSessionStore) {
      services.sessionStore.close();
    }
    if (ownsLogger) {
      logger.close();
    }
  });

  registerHealthzRoute(app, services.healthService);
  registerModelsRoute(app, config);
  registerChatCompletionsRoute(app, services);
  registerResponsesRoute(app, services);

  return app;
}
