export class SessionLockManager {
  private readonly tails = new Map<string, Promise<void>>();

  public async withSessionLock<T>(sessionId: string, task: () => Promise<T> | T): Promise<T> {
    const previous = this.tails.get(sessionId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.tails.set(sessionId, previous.then(() => current));
    await previous;

    try {
      return await task();
    } finally {
      release?.();
      if (this.tails.get(sessionId) === current) {
        this.tails.delete(sessionId);
      }
    }
  }
}
