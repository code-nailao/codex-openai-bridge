import type { AgentMessageItem, ThreadEvent } from '@openai/codex-sdk';
import { afterEach, describe, expect, it } from 'vitest';

import { buildTestApp } from './helpers/test-server.js';
import { FakeRuntime } from './helpers/fake-runtime.js';

const openApps: Array<{ close: () => Promise<unknown> }> = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

function agentMessage(id: string, text: string): AgentMessageItem {
  return {
    id,
    type: 'agent_message',
    text,
  };
}

async function* createStream(events: ThreadEvent[]) {
  await Promise.resolve();
  for (const event of events) {
    yield event;
  }
}

function getRuntimeInputText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

describe('POST /v1/chat/completions', () => {
  it('returns a non-stream OpenAI-compatible completion and session headers', async () => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-chat-1',
        finalResponse: 'Hello from Codex',
        items: [],
        usage: {
          input_tokens: 20,
          cached_input_tokens: 0,
          output_tokens: 8,
        },
      },
      {
        threadId: 'thread-chat-1',
        events: createStream([]),
      },
    );

    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
      },
      runtime,
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'gpt-5.4',
        messages: [
          { role: 'system', content: 'Be concise.' },
          { role: 'user', content: 'Say hello.' },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-session-id']).toBeTypeOf('string');
    expect(response.headers['x-codex-thread-id']).toBe('thread-chat-1');
    expect(response.json()).toMatchObject({
      object: 'chat.completion',
      model: 'gpt-5.4',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: 'Hello from Codex',
          },
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 8,
        total_tokens: 28,
      },
    });
    expect(runtime.runCalls).toHaveLength(1);
    expect(getRuntimeInputText(runtime.runCalls[0]?.input)).toContain('Instructions:\nBe concise.');
    expect(getRuntimeInputText(runtime.runCalls[0]?.input)).toContain('user: Say hello.');
  });

  it('streams chat completion chunks and a final DONE marker', async () => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-chat-2',
        finalResponse: 'unused',
        items: [],
        usage: null,
      },
      {
        threadId: null,
        events: createStream([
          { type: 'thread.started', thread_id: 'thread-chat-2' },
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
        ]),
      },
    );

    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
      },
      runtime,
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'gpt-5.4',
        stream: true,
        messages: [{ role: 'user', content: 'Say hello.' }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['x-codex-thread-id']).toBe('thread-chat-2');
    expect(response.body).toContain('"object":"chat.completion.chunk"');
    expect(response.body).toContain('"role":"assistant"');
    expect(response.body).toContain('"content":"Hel"');
    expect(response.body).toContain('"content":"lo"');
    expect(response.body).toContain('"finish_reason":"stop"');
    expect(response.body).toContain('data: [DONE]');
  });

  it('rejects unsupported tool inputs with a 422 OpenAI-style error body', async () => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-chat-3',
        finalResponse: 'unused',
        items: [],
        usage: null,
      },
      {
        threadId: 'thread-chat-3',
        events: createStream([]),
      },
    );

    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
      },
      runtime,
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [{ type: 'function', function: { name: 'noop' } }],
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: {
        message: 'The field "tools" is not supported in v1.',
        type: 'invalid_request_error',
        code: 'unsupported_feature',
        param: 'tools',
      },
    });
  });

  it('passes through a directly requested supported model such as gpt-5.4', async () => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-chat-4',
        finalResponse: 'Hello from GPT-5.4',
        items: [],
        usage: null,
      },
      {
        threadId: 'thread-chat-4',
        events: createStream([]),
      },
    );

    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
      },
      runtime,
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'gpt-5.4',
        messages: [{ role: 'user', content: 'Say hello.' }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      model: 'gpt-5.4',
    });
    expect(runtime.runCalls[0]?.threadOptions).toMatchObject({
      model: 'gpt-5.4',
    });
  });
});
