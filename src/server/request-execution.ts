import type { ThreadOptions } from '@openai/codex-sdk';
import type { FastifyReply } from 'fastify';

import type { RuntimeLike, RuntimeRunResult } from '../contracts/runtime.js';
import { normalizeRuntimeStream, type NormalizedRuntimeStream } from '../runtime/normalized-stream.js';
import type { SessionStore } from '../store/session-store.js';
import { ensureRuntimeThreadId, setSessionResponseHeaders } from './route-support.js';
import { createSseStream, startHeartbeat, type SseStream } from './sse/sse-stream.js';

type RuntimeExecutionParams = {
  runtime: RuntimeLike;
  input: string;
  threadOptions: ThreadOptions;
  signal: AbortSignal;
  threadId?: string | null | undefined;
};

export type CompletedRuntimeRun = RuntimeRunResult & {
  threadId: string;
};

export function createRuntimeRunParams(input: RuntimeExecutionParams) {
  return {
    input: input.input,
    threadOptions: input.threadOptions,
    signal: input.signal,
    ...(input.threadId ? { threadId: input.threadId } : {}),
  };
}

export async function executeNonStreamRuntime(input: RuntimeExecutionParams): Promise<CompletedRuntimeRun> {
  const result = await input.runtime.run(createRuntimeRunParams(input));

  return {
    ...result,
    threadId: ensureRuntimeThreadId(result.threadId),
  };
}

export async function executeStreamRuntime(input: RuntimeExecutionParams): Promise<NormalizedRuntimeStream> {
  const runtimeStream = await input.runtime.runStreamed(createRuntimeRunParams(input));
  return normalizeRuntimeStream(runtimeStream);
}

export function persistSessionContext(input: {
  sessionStore: SessionStore;
  reply: FastifyReply;
  sessionId: string;
  threadId: string;
  modelId: string;
  workspaceCwd: string;
}) {
  input.sessionStore.upsertSession({
    sessionId: input.sessionId,
    threadId: input.threadId,
    modelId: input.modelId,
    workspaceCwd: input.workspaceCwd,
  });

  setSessionResponseHeaders(input.reply, {
    sessionId: input.sessionId,
    threadId: input.threadId,
  });
}

export function openStreamingReply(reply: FastifyReply): {
  stream: SseStream;
  close: () => void;
} {
  const stream = createSseStream(reply);
  const stopHeartbeat = startHeartbeat(stream);

  return {
    stream,
    close() {
      stopHeartbeat();
      stream.end();
    },
  };
}
