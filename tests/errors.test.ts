import { afterEach, describe, expect, it } from 'vitest';

import type { ThreadEvent } from '@openai/codex-sdk';

import type { RuntimeLike, RuntimeRunParams, RuntimeRunResult, RuntimeStreamResult } from '../src/contracts/runtime.js';
import { buildTestApp } from './helpers/test-server.js';
import { FakeRuntime } from './helpers/fake-runtime.js';

const openApps: Array<{ close: () => Promise<unknown> }> = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

class ApprovalRequiredRuntime implements RuntimeLike {
  public run(_params: RuntimeRunParams): Promise<RuntimeRunResult> {
    void _params;
    return Promise.reject(new Error('Approval required: the current sandbox does not allow file writes.'));
  }

  public runStreamed(_params: RuntimeRunParams): Promise<RuntimeStreamResult> {
    void _params;
    return Promise.reject(new Error('Approval required: the current sandbox does not allow file writes.'));
  }
}

async function* createEmptyEvents(): AsyncGenerator<ThreadEvent> {
  await Promise.resolve();
  for (const event of [] as ThreadEvent[]) {
    yield event;
  }
}

describe('error handling and auth', () => {
  it('rejects unauthenticated `/v1/*` requests with a 401 OpenAI-style body', async () => {
    const app = await buildTestApp({
      env: {
        LOCAL_BRIDGE_API_KEY: 'test-key',
      },
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/models',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        message: 'Missing or invalid bearer token.',
        type: 'invalid_request_error',
        code: 'unauthorized',
      },
    });
  });

  it('maps approval-required runtime failures to a 409 bridge error', async () => {
    const app = await buildTestApp({
      env: {
        BRIDGE_DISABLE_AUTH: 'true',
      },
      runtime: new ApprovalRequiredRuntime(),
    });
    openApps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'codex',
        messages: [{ role: 'user', content: 'Try a write action.' }],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        message: 'Approval required: the current sandbox does not allow file writes.',
        type: 'invalid_request_error',
        code: 'approval_required',
      },
    });
  });

  it('rejects unknown previous_response_id values before the runtime is called', async () => {
    const runtime = new FakeRuntime(
      {
        threadId: 'thread-unused',
        finalResponse: 'unused',
        items: [],
        usage: null,
      },
      {
        threadId: 'thread-unused',
        events: createEmptyEvents(),
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
        model: 'codex',
        input: 'Follow up',
        previous_response_id: 'resp_missing',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        message: 'The previous_response_id value does not exist.',
        type: 'invalid_request_error',
        code: 'invalid_request',
        param: 'previous_response_id',
      },
    });
    expect(runtime.runCalls).toHaveLength(0);
  });
});
