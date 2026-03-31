import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentMessageItem, ThreadEvent } from '@openai/codex-sdk';
import { afterEach, describe, expect, it } from 'vitest';

import { SessionStore } from '../src/store/session-store.js';
import { buildTestApp } from './helpers/test-server.js';
import { FakeRuntime } from './helpers/fake-runtime.js';

const openApps: Array<{ close: () => Promise<unknown> }> = [];
const openStores: SessionStore[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
  for (const store of openStores.splice(0)) {
    store.close();
  }
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

type MinimalResponseBody = {
  id: string;
  output_text?: string;
};

function createStore(): SessionStore {
  const tempDir = mkdtempSync(join(tmpdir(), 'codex-openai-bridge-store-'));
  const store = new SessionStore({
    dbPath: join(tempDir, 'bridge.sqlite'),
  });
  openStores.push(store);
  return store;
}

describe('POST /v1/responses', () => {
  it('defaults model and reasoning_effort when the client omits both fields', async () => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-response-defaults',
        finalResponse: 'Hello from defaults',
        items: [],
        usage: null,
      },
      {
        threadId: 'thread-response-defaults',
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
      url: '/v1/responses',
      payload: {
        input: 'Say hello.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<MinimalResponseBody>()).toMatchObject({
      model: 'gpt-5.4',
    });
    expect(runtime.runCalls[0]?.threadOptions).toMatchObject({
      model: 'gpt-5.4',
      modelReasoningEffort: 'low',
    });
  });

  it.each([
    { label: 'null', value: null },
    { label: 'none', value: 'none' },
    { label: 'blank string', value: '   ' },
  ])('treats compatibility reasoning_effort value $label as omitted', async ({ value }) => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-response-defaults-compat',
        finalResponse: 'Hello from defaults',
        items: [],
        usage: null,
      },
      {
        threadId: 'thread-response-defaults-compat',
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
      url: '/v1/responses',
      payload: {
        input: 'Say hello.',
        reasoning_effort: value,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(runtime.runCalls[0]?.threadOptions).toMatchObject({
      model: 'gpt-5.4',
      modelReasoningEffort: 'low',
    });
  });

  it('creates a response object, a bridge session, and response persistence for a new request', async () => {
    const sessionStore = createStore();
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-response-1',
        finalResponse: 'Hello from the responses API',
        items: [],
        usage: {
          input_tokens: 14,
          cached_input_tokens: 0,
          output_tokens: 7,
        },
      },
      {
        threadId: 'thread-response-1',
        events: createStream([]),
      },
    );

    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
      },
      runtime,
      sessionStore,
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: {
        model: 'gpt-5.4',
        input: 'Say hello.',
        instructions: 'Be brief.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-session-id']).toBeTypeOf('string');
    expect(response.headers['x-codex-thread-id']).toBe('thread-response-1');

    const body = response.json<MinimalResponseBody>();
    expect(body).toMatchObject({
      object: 'response',
      status: 'completed',
      model: 'gpt-5.4',
      output_text: 'Hello from the responses API',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Hello from the responses API',
            },
          ],
        },
      ],
      usage: {
        input_tokens: 14,
        output_tokens: 7,
        total_tokens: 21,
      },
    });

    const storedResponse = sessionStore.getResponse(body.id);
    expect(storedResponse).toMatchObject({
      responseId: body.id,
      threadId: 'thread-response-1',
      sessionId: response.headers['x-session-id'],
    });
  });

  it('resumes the same thread when the client sends the previous x-session-id', async () => {
    const runtime = new FakeRuntime(
      [
        {
          threadId: 'thread-response-2',
          finalResponse: 'First reply',
          items: [],
          usage: null,
        },
        {
          threadId: 'thread-response-2',
          finalResponse: 'Second reply',
          items: [],
          usage: null,
        },
      ],
      {
        threadId: 'thread-response-2',
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

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: {
        model: 'gpt-5.4',
        input: 'First turn',
      },
    });
    const sessionId = String(firstResponse.headers['x-session-id']);

    const secondResponse = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: {
        'x-session-id': sessionId,
      },
      payload: {
        model: 'gpt-5.4',
        input: 'Second turn',
      },
    });

    expect(secondResponse.statusCode).toBe(200);
    expect(runtime.runCalls[1]).toMatchObject({
      threadId: 'thread-response-2',
    });
  });

  it('resumes the same thread when previous_response_id is supplied', async () => {
    const runtime = new FakeRuntime(
      [
        {
          threadId: 'thread-response-3',
          finalResponse: 'Initial reply',
          items: [],
          usage: null,
        },
        {
          threadId: 'thread-response-3',
          finalResponse: 'Follow-up reply',
          items: [],
          usage: null,
        },
      ],
      {
        threadId: 'thread-response-3',
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

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: {
        model: 'gpt-5.4',
        input: 'Initial turn',
      },
    });
    const firstBody = firstResponse.json<MinimalResponseBody>();
    const previousResponseId = firstBody.id;

    const secondResponse = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: {
        model: 'gpt-5.4',
        input: 'Follow-up turn',
        previous_response_id: previousResponseId,
      },
    });

    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.headers['x-session-id']).toBe(firstResponse.headers['x-session-id']);
    expect(runtime.runCalls[1]).toMatchObject({
      threadId: 'thread-response-3',
    });
  });

  it('streams the documented v1 response events in order', async () => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-response-4',
        finalResponse: 'unused',
        items: [],
        usage: null,
      },
      {
        threadId: null,
        events: createStream([
          { type: 'thread.started', thread_id: 'thread-response-4' },
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
      url: '/v1/responses',
      payload: {
        model: 'gpt-5.4',
        input: 'Say hello.',
        stream: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.body).toContain('event: response.created');
    expect(response.body).toContain('event: response.output_text.delta');
    expect(response.body).toContain('"delta":"Hel"');
    expect(response.body).toContain('"delta":"lo"');
    expect(response.body).toContain('event: response.output_text.done');
    expect(response.body).toContain('event: response.completed');
  });

  it('does not duplicate provisional text when the runtime revises an early response snapshot', async () => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-response-revision',
        finalResponse: 'unused',
        items: [],
        usage: null,
      },
      {
        threadId: null,
        events: createStream([
          { type: 'thread.started', thread_id: 'thread-response-revision' },
          { type: 'item.started', item: agentMessage('msg-1', 'He') },
          { type: 'item.updated', item: agentMessage('msg-1', 'Hi') },
          { type: 'item.completed', item: agentMessage('msg-1', 'Hi') },
          {
            type: 'turn.completed',
            usage: {
              input_tokens: 10,
              cached_input_tokens: 0,
              output_tokens: 2,
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
      url: '/v1/responses',
      payload: {
        model: 'gpt-5.4',
        input: 'Say hi.',
        stream: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"delta":"Hi"');
    expect(response.body).not.toContain('"delta":"He"');
    expect(response.body).toContain('"text":"Hi"');
    expect(response.body).toContain('event: response.completed');
  });

  it('rejects conflicting session identifiers with a 409 error body', async () => {
    const sessionStore = createStore();
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-response-5',
        finalResponse: 'Initial reply',
        items: [],
        usage: null,
      },
      {
        threadId: 'thread-response-5',
        events: createStream([]),
      },
    );

    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
      },
      runtime,
      sessionStore,
    });
    openApps.push(app);

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: {
        model: 'gpt-5.4',
        input: 'Initial turn',
      },
    });
    const firstBody = firstResponse.json<MinimalResponseBody>();
    sessionStore.upsertSession({
      sessionId: 'sess_conflict',
      threadId: 'thread-response-other',
      modelId: 'gpt-5.4',
      workspaceCwd: null,
    });

    const conflictResponse = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: {
        'x-session-id': 'sess_conflict',
      },
      payload: {
        model: 'gpt-5.4',
        input: 'Conflicting turn',
        previous_response_id: firstBody.id,
      },
    });

    expect(conflictResponse.statusCode).toBe(409);
    expect(conflictResponse.json()).toEqual({
      error: {
        message: 'The supplied session identifiers resolve to different Codex threads.',
        type: 'invalid_request_error',
        code: 'session_conflict',
      },
    });
  });

  it('passes through a directly requested supported codex-family model', async () => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-response-6',
        finalResponse: 'Hello from GPT-5.3-Codex',
        items: [],
        usage: null,
      },
      {
        threadId: 'thread-response-6',
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
      url: '/v1/responses',
      payload: {
        model: 'gpt-5.3-codex',
        input: 'Say hello.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<MinimalResponseBody>()).toMatchObject({
      output_text: 'Hello from GPT-5.3-Codex',
      model: 'gpt-5.3-codex',
    });
    expect(runtime.runCalls[0]?.threadOptions).toMatchObject({
      model: 'gpt-5.3-codex',
    });
  });

  it('lets an explicit model and reasoning_effort override bridge defaults', async () => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-response-override',
        finalResponse: 'Hello from override',
        items: [],
        usage: null,
      },
      {
        threadId: 'thread-response-override',
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
      url: '/v1/responses',
      payload: {
        model: 'gpt-5.3-codex',
        reasoning_effort: 'high',
        input: 'Say hello.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<MinimalResponseBody>()).toMatchObject({
      model: 'gpt-5.3-codex',
    });
    expect(runtime.runCalls[0]?.threadOptions).toMatchObject({
      model: 'gpt-5.3-codex',
      modelReasoningEffort: 'high',
    });
  });
});
