import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ThreadEvent } from '@openai/codex-sdk';
import { afterEach, describe, expect, it } from 'vitest';
import OpenAI from 'openai';

import { createApp } from '../src/app.js';
import { FakeRuntime } from './helpers/fake-runtime.js';

const openApps: Array<{ close: () => Promise<unknown> }> = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

function createEnv() {
  const tempDir = mkdtempSync(join(tmpdir(), 'codex-openai-bridge-compat-'));
  return {
    LOCAL_BRIDGE_API_KEY: 'compat-key',
    SQLITE_PATH: join(tempDir, 'bridge.sqlite'),
  };
}

async function* createEmptyEvents(): AsyncGenerator<ThreadEvent> {
  await Promise.resolve();
  for (const event of [] as ThreadEvent[]) {
    yield event;
  }
}

describe('OpenAI SDK compatibility', () => {
  it('supports `chat.completions.create()` via `baseURL`', async () => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-compat-chat',
        finalResponse: 'Hello from SDK chat',
        items: [],
        usage: {
          input_tokens: 11,
          cached_input_tokens: 0,
          output_tokens: 5,
        },
      },
      {
        threadId: 'thread-compat-chat',
        events: createEmptyEvents(),
      },
    );
    const app = await createApp({ env: createEnv(), runtime });
    openApps.push(app);

    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve a compatibility test port.');
    }

    const client = new OpenAI({
      apiKey: 'compat-key',
      baseURL: `http://127.0.0.1:${address.port}/v1`,
    });

    const completion = await client.chat.completions.create({
      model: 'codex',
      messages: [{ role: 'user', content: 'Say hello.' }],
    });

    expect(completion.choices[0]?.message.content).toBe('Hello from SDK chat');
    expect(completion.model).toBe('codex');
  });

  it('supports `responses.create()` via `baseURL`', async () => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-compat-response',
        finalResponse: 'Hello from SDK responses',
        items: [],
        usage: {
          input_tokens: 13,
          cached_input_tokens: 0,
          output_tokens: 6,
        },
      },
      {
        threadId: 'thread-compat-response',
        events: createEmptyEvents(),
      },
    );
    const app = await createApp({ env: createEnv(), runtime });
    openApps.push(app);

    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve a compatibility test port.');
    }

    const client = new OpenAI({
      apiKey: 'compat-key',
      baseURL: `http://127.0.0.1:${address.port}/v1`,
    });

    const response = await client.responses.create({
      model: 'codex',
      input: 'Say hello.',
    });

    expect(response.output_text).toBe('Hello from SDK responses');
    expect(response.model).toBe('codex');
  });
});
