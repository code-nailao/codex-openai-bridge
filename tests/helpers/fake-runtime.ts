import type {
  RuntimeLike,
  RuntimeRunParams,
  RuntimeRunResult,
  RuntimeStreamResult,
} from '../../src/contracts/runtime.js';

export class FakeRuntime implements RuntimeLike {
  public readonly runCalls: RuntimeRunParams[] = [];
  public readonly runStreamedCalls: RuntimeRunParams[] = [];

  public constructor(
    private readonly nextRunResult: RuntimeRunResult,
    private readonly nextStreamResult: RuntimeStreamResult,
  ) {}

  public run(params: RuntimeRunParams): Promise<RuntimeRunResult> {
    this.runCalls.push(params);
    return Promise.resolve(this.nextRunResult);
  }

  public runStreamed(params: RuntimeRunParams): Promise<RuntimeStreamResult> {
    this.runStreamedCalls.push(params);
    return Promise.resolve(this.nextStreamResult);
  }
}
