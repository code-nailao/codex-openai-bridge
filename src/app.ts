import Fastify, { type FastifyInstance } from 'fastify';

import { loadEnvConfig } from './config/env.js';
import type { RuntimeLike } from './contracts/runtime.js';
import { CodexRuntime } from './runtime/codex-runtime.js';
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
  env?: NodeJS.ProcessEnv;
  runtime?: RuntimeLike;
  sessionStore?: SessionStore;
  lockManager?: SessionLockManager;
};

export async function createApp(options?: CreateAppOptions): Promise<FastifyInstance> {
  const config = loadEnvConfig(options?.env);
  const app = Fastify({
    logger: false,
  });

  let runtime = options?.runtime ?? null;
  const services: BridgeServices = {
    config,
    getRuntime() {
      runtime ??= new CodexRuntime();
      return runtime;
    },
    sessionStore: options?.sessionStore ?? new SessionStore({ dbPath: config.storage.dbPath }),
    lockManager: options?.lockManager ?? new SessionLockManager(),
  };
  const ownsSessionStore = !options?.sessionStore;

  app.addHook('onRequest', (request, reply, done) => {
    try {
      enforceRequestAuth(config, request);
      done();
    } catch (error) {
      done(error as Error);
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    const response = mapErrorToResponse(error);
    reply.code(response.statusCode).send(response.body);
  });

  app.addHook('onClose', () => {
    if (ownsSessionStore) {
      services.sessionStore.close();
    }
  });

  registerHealthzRoute(app, config);
  registerModelsRoute(app, config);
  registerChatCompletionsRoute(app, services);
  registerResponsesRoute(app, services);

  return app;
}
