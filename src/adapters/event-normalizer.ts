import type { AgentMessageItem, ThreadErrorEvent, ThreadEvent, TurnFailedEvent } from '@openai/codex-sdk';

import type { NormalizedRuntimeEvent } from '../contracts/runtime.js';

type MessageState = {
  bufferedText: string;
  emittedText: string;
};

function isApprovalRequired(message: string): boolean {
  return /approval required/i.test(message);
}

function isAgentMessageItem(item: unknown): item is AgentMessageItem {
  return typeof item === 'object' && item !== null && 'type' in item && item.type === 'agent_message';
}

export class EventNormalizer {
  private readonly messageState = new Map<string, MessageState>();

  public normalize(event: ThreadEvent): NormalizedRuntimeEvent[] {
    switch (event.type) {
      case 'thread.started':
        return [{ type: 'run_started', threadId: event.thread_id }];
      case 'item.started':
        return this.captureStartedMessage(event.item);
      case 'item.updated':
        return this.normalizeItemEvent(event.item, false);
      case 'item.completed':
        return this.normalizeItemEvent(event.item, true);
      case 'turn.completed':
        return [{ type: 'run_completed', usage: event.usage }];
      case 'turn.failed':
        return this.normalizeFailure(event);
      case 'error':
        return this.normalizeStreamError(event);
      case 'turn.started':
        return [];
      default:
        return [];
    }
  }

  private captureStartedMessage(item: unknown): NormalizedRuntimeEvent[] {
    if (!isAgentMessageItem(item)) {
      return [];
    }

    this.messageState.set(item.id, {
      bufferedText: item.text,
      emittedText: '',
    });

    return [];
  }

  private normalizeItemEvent(item: unknown, isCompleted: boolean): NormalizedRuntimeEvent[] {
    if (!isAgentMessageItem(item)) {
      return [];
    }

    const state = this.messageState.get(item.id) ?? {
      bufferedText: '',
      emittedText: '',
    };
    const nextText = item.text;
    const events: NormalizedRuntimeEvent[] = [];

    const bufferedDelta = this.computeBufferedDelta(state, nextText);
    if (bufferedDelta) {
      events.push({ type: 'message_delta', text: bufferedDelta });
      state.emittedText += bufferedDelta;
    }

    if (isCompleted) {
      const completionDelta = this.computeCompletionDelta(state.emittedText, nextText);
      if (completionDelta) {
        events.push({ type: 'message_delta', text: completionDelta });
        state.emittedText += completionDelta;
      }

      events.push({ type: 'message_done', text: nextText });
      this.messageState.delete(item.id);
      return events;
    }

    state.bufferedText = nextText;
    this.messageState.set(item.id, state);
    return events;
  }

  private normalizeFailure(event: TurnFailedEvent): NormalizedRuntimeEvent[] {
    if (isApprovalRequired(event.error.message)) {
      return [{ type: 'approval_required', message: event.error.message }];
    }

    return [{ type: 'run_failed', message: event.error.message }];
  }

  private normalizeStreamError(event: ThreadErrorEvent): NormalizedRuntimeEvent[] {
    if (isApprovalRequired(event.message)) {
      return [{ type: 'approval_required', message: event.message }];
    }

    return [{ type: 'run_failed', message: event.message }];
  }

  private computeBufferedDelta(state: MessageState, nextText: string): string {
    const { bufferedText, emittedText } = state;
    if (!bufferedText) {
      return '';
    }

    if (!nextText.startsWith(bufferedText)) {
      return '';
    }

    if (!bufferedText.startsWith(emittedText)) {
      return '';
    }

    return bufferedText.slice(emittedText.length);
  }

  private computeCompletionDelta(emittedText: string, finalText: string): string {
    if (!finalText) {
      return '';
    }

    if (finalText.startsWith(emittedText)) {
      return finalText.slice(emittedText.length);
    }

    // OpenAI-compatible SSE is append-only; once earlier bytes are exposed we cannot
    // safely rewrite them if the upstream runtime later revises the text.
    return '';
  }
}
