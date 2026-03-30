import { EventNormalizer } from '../adapters/event-normalizer.js';
import type { NormalizedRuntimeEvent, RuntimeStreamResult } from '../contracts/runtime.js';
import { createInternalServerError } from '../server/errors/bridge-error.js';

export type NormalizedRuntimeStream = {
  threadId: string;
  events: AsyncGenerator<NormalizedRuntimeEvent>;
};

export async function normalizeRuntimeStream(
  streamResult: RuntimeStreamResult,
  options?: { normalizer?: EventNormalizer },
): Promise<NormalizedRuntimeStream> {
  const normalizer = options?.normalizer ?? new EventNormalizer();
  const iterator = streamResult.events[Symbol.asyncIterator]();
  const bufferedEvents: NormalizedRuntimeEvent[] = [];
  let threadId = streamResult.threadId;

  while (!threadId) {
    const next = await iterator.next();
    if (next.done) {
      break;
    }

    const normalizedEvents = normalizer.normalize(next.value);
    for (const event of normalizedEvents) {
      if (event.type === 'run_started') {
        threadId = event.threadId;
      }
      bufferedEvents.push(event);
    }

    const terminalEvent = bufferedEvents.find(
      (event) => event.type === 'approval_required' || event.type === 'run_failed',
    );
    if (threadId || terminalEvent) {
      break;
    }
  }

  if (!threadId) {
    throw createInternalServerError('The Codex runtime did not expose a thread id.');
  }

  async function* iterate(): AsyncGenerator<NormalizedRuntimeEvent> {
    for (const event of bufferedEvents) {
      yield event;
    }

    while (true) {
      const next = await iterator.next();
      if (next.done) {
        return;
      }

      const normalizedEvents = normalizer.normalize(next.value);
      for (const event of normalizedEvents) {
        yield event;
      }
    }
  }

  return {
    threadId,
    events: iterate(),
  };
}
