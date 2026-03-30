import type {
  RuntimeLike,
  RuntimeRunParams,
  RuntimeRunResult,
  RuntimeStreamResult,
} from '../../src/contracts/runtime.js';

export class FakeRuntime implements RuntimeLike {
  public readonly runCalls: RuntimeRunParams[] = [];
  public readonly runStreamedCalls: RuntimeRunParams[] = [];
  private readonly runResults: RuntimeRunResult[];
  private readonly streamResults: RuntimeStreamResult[];

  public constructor(
    nextRunResult: RuntimeRunResult | RuntimeRunResult[],
    nextStreamResult: RuntimeStreamResult | RuntimeStreamResult[],
  ) {
    this.runResults = Array.isArray(nextRunResult) ? [...nextRunResult] : [nextRunResult];
    this.streamResults = Array.isArray(nextStreamResult) ? [...nextStreamResult] : [nextStreamResult];
  }

  public run(params: RuntimeRunParams): Promise<RuntimeRunResult> {
    this.runCalls.push(params);
    return Promise.resolve(this.takeNext(this.runResults, 'run'));
  }

  public runStreamed(params: RuntimeRunParams): Promise<RuntimeStreamResult> {
    this.runStreamedCalls.push(params);
    return Promise.resolve(this.takeNext(this.streamResults, 'runStreamed'));
  }

  private takeNext<T>(queue: T[], label: 'run' | 'runStreamed'): T {
    const nextValue = queue.shift();
    if (!nextValue) {
      throw new Error(`No queued fake runtime result remains for ${label}.`);
    }

    return nextValue;
  }
}
