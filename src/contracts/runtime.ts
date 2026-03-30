import type {
  Input,
  RunResult,
  RunStreamedResult,
  ThreadEvent,
  ThreadItem,
  ThreadOptions,
  TurnOptions,
  Usage,
} from '@openai/codex-sdk';

export type NormalizedRuntimeEvent =
  | { type: 'run_started'; threadId: string }
  | { type: 'message_delta'; text: string }
  | { type: 'message_done'; text: string }
  | { type: 'approval_required'; message: string }
  | { type: 'run_failed'; message: string }
  | { type: 'run_completed'; usage: Usage };

export interface ThreadHandle {
  readonly id: string | null;
  run(input: Input, options?: TurnOptions): Promise<RunResult>;
  runStreamed(input: Input, options?: TurnOptions): Promise<RunStreamedResult>;
}

export interface ThreadManagerLike {
  start(options?: ThreadOptions): ThreadHandle;
  resume(threadId: string, options?: ThreadOptions): ThreadHandle;
}

export type RuntimeRunParams = {
  threadId?: string;
  input: Input;
  threadOptions?: ThreadOptions;
  signal?: AbortSignal;
};

export type RuntimeRunResult = {
  threadId: string | null;
  finalResponse: string;
  items: ThreadItem[];
  usage: Usage | null;
};

export type RuntimeStreamResult = {
  threadId: string | null;
  events: AsyncGenerator<ThreadEvent>;
};

export interface RuntimeLike {
  run(params: RuntimeRunParams): Promise<RuntimeRunResult>;
  runStreamed(params: RuntimeRunParams): Promise<RuntimeStreamResult>;
}
