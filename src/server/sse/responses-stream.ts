import type { Usage } from '@openai/codex-sdk';

import type { NormalizedRuntimeEvent } from '../../contracts/runtime.js';
import { createResponseObject } from '../../adapters/responses-adapter.js';
import { writeNamedSseEvent, type SseStream } from './sse-stream.js';

export type StreamedResponseResult = {
  text: string;
  usage: Usage | null;
};

export async function streamResponses(options: {
  stream: SseStream;
  events: AsyncGenerator<NormalizedRuntimeEvent>;
  responseId: string;
  model: string;
  createdAt: Date;
}): Promise<StreamedResponseResult> {
  const messageId = `msg_${options.responseId.replace(/^resp_/, '')}`;
  let accumulatedText = '';
  let completedUsage: NormalizedRuntimeEvent | null = null;

  writeNamedSseEvent(options.stream, 'response.created', {
    type: 'response.created',
    response: {
      id: options.responseId,
      object: 'response',
      created_at: Math.floor(options.createdAt.getTime() / 1000),
      status: 'in_progress',
      model: options.model,
      output: [],
    },
  });

  for await (const event of options.events) {
    if (event.type === 'message_delta') {
      accumulatedText += event.text;
      writeNamedSseEvent(options.stream, 'response.output_text.delta', {
        type: 'response.output_text.delta',
        response_id: options.responseId,
        item_id: messageId,
        output_index: 0,
        content_index: 0,
        delta: event.text,
      });
      continue;
    }

    if (event.type === 'run_completed') {
      completedUsage = event;
      break;
    }

    if (event.type === 'approval_required') {
      throw new Error(event.message);
    }

    if (event.type === 'run_failed') {
      throw new Error(event.message);
    }
  }

  writeNamedSseEvent(options.stream, 'response.output_text.done', {
    type: 'response.output_text.done',
    response_id: options.responseId,
    item_id: messageId,
    output_index: 0,
    content_index: 0,
    text: accumulatedText,
  });

  writeNamedSseEvent(options.stream, 'response.completed', {
    type: 'response.completed',
    response: createResponseObject({
      responseId: options.responseId,
      model: options.model,
      text: accumulatedText,
      usage: completedUsage?.type === 'run_completed' ? completedUsage.usage : null,
      createdAt: options.createdAt,
    }),
  });

  return {
    text: accumulatedText,
    usage: completedUsage?.type === 'run_completed' ? completedUsage.usage : null,
  };
}
