import type { Codex, TurnOptions } from '@openai/codex-sdk';

import type {
  RuntimeRunParams,
  RuntimeRunResult,
  RuntimeStreamResult,
  ThreadHandle,
  ThreadManagerLike,
} from '../contracts/runtime.js';
import { ThreadManager } from './thread-manager.js';

function createTurnOptions(signal?: AbortSignal): TurnOptions | undefined {
  if (!signal) {
    return undefined;
  }

  return { signal };
}

export class CodexRuntime {
  private readonly threadManager: ThreadManagerLike;

  public constructor(options?: { threadManager?: ThreadManagerLike; codex?: Codex }) {
    this.threadManager = options?.threadManager ?? new ThreadManager(options?.codex);
  }

  public async run(params: RuntimeRunParams): Promise<RuntimeRunResult> {
    const thread = this.openThread(params);
    const turn = await thread.run(params.input, createTurnOptions(params.signal));

    return {
      threadId: thread.id ?? params.threadId ?? null,
      finalResponse: turn.finalResponse,
      items: turn.items,
      usage: turn.usage,
    };
  }

  public async runStreamed(params: RuntimeRunParams): Promise<RuntimeStreamResult> {
    const thread = this.openThread(params);
    const stream = await thread.runStreamed(params.input, createTurnOptions(params.signal));

    return {
      threadId: thread.id ?? params.threadId ?? null,
      events: stream.events,
    };
  }

  private openThread(params: RuntimeRunParams): ThreadHandle {
    if (params.threadId) {
      return this.threadManager.resume(params.threadId, params.threadOptions);
    }

    return this.threadManager.start(params.threadOptions);
  }
}
