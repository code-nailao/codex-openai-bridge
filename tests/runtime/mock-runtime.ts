import type {
  Input,
  RunResult,
  RunStreamedResult,
  ThreadEvent,
  ThreadOptions,
  TurnOptions,
} from '@openai/codex-sdk';

import type { ThreadHandle, ThreadManagerLike } from '../../src/contracts/runtime.js';

export class MockThread implements ThreadHandle {
  public id: string | null;
  public readonly runCalls: Array<{ input: Input; options: TurnOptions | undefined }> = [];
  public readonly runStreamedCalls: Array<{ input: Input; options: TurnOptions | undefined }> = [];

  public constructor(
    threadId: string | null,
    private readonly runResult: RunResult,
    private readonly streamEvents: ThreadEvent[] = [],
  ) {
    this.id = threadId;
  }

  public async run(input: Input, options?: TurnOptions): Promise<RunResult> {
    await Promise.resolve();
    this.runCalls.push({ input, options });
    return this.runResult;
  }

  public async runStreamed(input: Input, options?: TurnOptions): Promise<RunStreamedResult> {
    await Promise.resolve();
    this.runStreamedCalls.push({ input, options });

    return {
      events: this.createEventStream(),
    };
  }

  private async *createEventStream(): AsyncGenerator<ThreadEvent> {
    await Promise.resolve();

    for (const event of this.streamEvents) {
      yield event;
    }
  }
}

export class MockThreadManager implements ThreadManagerLike {
  public readonly started: ThreadOptions[] = [];
  public readonly resumed: Array<{ threadId: string; options: ThreadOptions | undefined }> = [];

  public constructor(private readonly nextThread: MockThread) {}

  public start(options?: ThreadOptions): ThreadHandle {
    this.started.push(options ?? {});
    return this.nextThread;
  }

  public resume(threadId: string, options?: ThreadOptions): ThreadHandle {
    this.resumed.push({ threadId, options });
    return this.nextThread;
  }
}
