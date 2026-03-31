import type { Usage } from '@openai/codex-sdk';

import type { NormalizedRuntimeEvent } from '../../contracts/runtime.js';
import { createChatChunk } from '../../adapters/chat-adapter.js';
import { writeSseData, type SseStream } from './sse-stream.js';

export type StreamedChatCompletion = {
  text: string;
  usage: Usage | null;
};

export async function streamChatCompletion(options: {
  stream: SseStream;
  events: AsyncGenerator<NormalizedRuntimeEvent>;
  responseId: string;
  model: string;
  created: number;
}): Promise<StreamedChatCompletion> {
  let sentRoleChunk = false;
  let accumulatedText = '';
  let completedUsage: StreamedChatCompletion['usage'] = null;

  for await (const event of options.events) {
    if (event.type === 'message_delta') {
      if (!sentRoleChunk) {
        writeSseData(
          options.stream,
          createChatChunk({
            id: options.responseId,
            model: options.model,
            created: options.created,
            delta: { role: 'assistant' },
          }),
        );
        sentRoleChunk = true;
      }

      writeSseData(
        options.stream,
        createChatChunk({
          id: options.responseId,
          model: options.model,
          created: options.created,
          delta: { content: event.text },
        }),
      );
      accumulatedText += event.text;
      continue;
    }

    if (event.type === 'run_completed') {
      completedUsage = event.usage;
      if (!sentRoleChunk) {
        writeSseData(
          options.stream,
          createChatChunk({
            id: options.responseId,
            model: options.model,
            created: options.created,
            delta: { role: 'assistant' },
          }),
        );
      }

      writeSseData(
        options.stream,
        createChatChunk({
          id: options.responseId,
          model: options.model,
          created: options.created,
          finishReason: 'stop',
        }),
      );
      break;
    }

    if (event.type === 'approval_required') {
      throw new Error(event.message);
    }

    if (event.type === 'run_failed') {
      throw new Error(event.message);
    }
  }

  options.stream.write('data: [DONE]\n\n');
  return {
    text: accumulatedText,
    usage: completedUsage,
  };
}
