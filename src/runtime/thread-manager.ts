import { Codex, type ThreadOptions } from '@openai/codex-sdk';

import type { ThreadHandle, ThreadManagerLike } from '../contracts/runtime.js';

export class ThreadManager implements ThreadManagerLike {
  public constructor(private readonly codex: Codex = new Codex()) {}

  public start(options?: ThreadOptions): ThreadHandle {
    return this.codex.startThread(options);
  }

  public resume(threadId: string, options?: ThreadOptions): ThreadHandle {
    return this.codex.resumeThread(threadId, options);
  }
}
