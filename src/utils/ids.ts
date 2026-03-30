import { randomUUID } from 'node:crypto';

export function createSessionId(): string {
  return `sess_${randomUUID()}`;
}

export function createResponseId(): string {
  return `resp_${randomUUID()}`;
}

export function createChatCompletionId(): string {
  return `chatcmpl_${randomUUID()}`;
}
