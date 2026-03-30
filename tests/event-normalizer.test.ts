import type { AgentMessageItem, ThreadEvent } from '@openai/codex-sdk';
import { describe, expect, it } from 'vitest';

import { EventNormalizer } from '../src/adapters/event-normalizer.js';
import { CodexRuntime } from '../src/runtime/codex-runtime.js';
import { MockThread, MockThreadManager } from './runtime/mock-runtime.js';

function agentMessage(id: string, text: string): AgentMessageItem {
  return {
    id,
    type: 'agent_message',
    text,
  };
}

describe('EventNormalizer', () => {
  it('converts agent message updates into deltas and completion events', () => {
    const normalizer = new EventNormalizer();
    const events: ThreadEvent[] = [
      { type: 'thread.started', thread_id: 'thread-1' },
      { type: 'item.started', item: agentMessage('msg-1', 'Hel') },
      { type: 'item.updated', item: agentMessage('msg-1', 'Hello') },
      { type: 'item.completed', item: agentMessage('msg-1', 'Hello') },
      {
        type: 'turn.completed',
        usage: {
          input_tokens: 10,
          cached_input_tokens: 0,
          output_tokens: 5,
        },
      },
    ];

    const normalized = events.flatMap((event) => normalizer.normalize(event));

    expect(normalized).toEqual([
      { type: 'run_started', threadId: 'thread-1' },
      { type: 'message_delta', text: 'Hel' },
      { type: 'message_delta', text: 'lo' },
      { type: 'message_done', text: 'Hello' },
      {
        type: 'run_completed',
        usage: {
          input_tokens: 10,
          cached_input_tokens: 0,
          output_tokens: 5,
        },
      },
    ]);
  });

  it('maps approval failures into approval_required events', () => {
    const normalizer = new EventNormalizer();

    expect(
      normalizer.normalize({
        type: 'turn.failed',
        error: {
          message: 'Approval required before tool execution can continue.',
        },
      }),
    ).toEqual([
      {
        type: 'approval_required',
        message: 'Approval required before tool execution can continue.',
      },
    ]);
  });
});

describe('CodexRuntime', () => {
  it('passes abort signals into the thread run call and preserves thread ids', async () => {
    const controller = new AbortController();
    const thread = new MockThread('thread-2', {
      finalResponse: 'done',
      items: [],
      usage: null,
    });
    const runtime = new CodexRuntime({
      threadManager: new MockThreadManager(thread),
    });

    await runtime.run({
      input: 'hello',
      signal: controller.signal,
    });

    expect(thread.runCalls).toHaveLength(1);
    expect(thread.runCalls[0]?.options?.signal).toBe(controller.signal);
  });

  it('resumes existing threads when a thread id is provided', async () => {
    const thread = new MockThread('thread-3', {
      finalResponse: 'done',
      items: [],
      usage: null,
    });
    const manager = new MockThreadManager(thread);
    const runtime = new CodexRuntime({ threadManager: manager });

    const result = await runtime.run({
      threadId: 'thread-3',
      input: 'resume',
    });

    expect(manager.resumed).toEqual([{ threadId: 'thread-3', options: undefined }]);
    expect(result.threadId).toBe('thread-3');
  });
});
