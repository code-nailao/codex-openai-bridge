import type { AgentMessageItem, ThreadErrorEvent, ThreadEvent, TurnFailedEvent } from '@openai/codex-sdk';

import type { NormalizedRuntimeEvent } from '../contracts/runtime.js';

function isApprovalRequired(message: string): boolean {
  return /approval required/i.test(message);
}

function isAgentMessageItem(item: unknown): item is AgentMessageItem {
  return typeof item === 'object' && item !== null && 'type' in item && item.type === 'agent_message';
}

export class EventNormalizer {
  private readonly messageState = new Map<string, string>();

  public normalize(event: ThreadEvent): NormalizedRuntimeEvent[] {
    switch (event.type) {
      case 'thread.started':
        return [{ type: 'run_started', threadId: event.thread_id }];
      case 'item.started':
      case 'item.updated':
      case 'item.completed':
        return this.normalizeItemEvent(event.item, event.type === 'item.completed');
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

  private normalizeItemEvent(item: unknown, isCompleted: boolean): NormalizedRuntimeEvent[] {
    if (!isAgentMessageItem(item)) {
      return [];
    }

    const previousText = this.messageState.get(item.id) ?? '';
    const nextText = item.text;
    const events: NormalizedRuntimeEvent[] = [];
    const delta = this.computeDelta(previousText, nextText);

    if (delta) {
      events.push({ type: 'message_delta', text: delta });
    }

    this.messageState.set(item.id, nextText);

    if (isCompleted) {
      events.push({ type: 'message_done', text: nextText });
      this.messageState.delete(item.id);
    }

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

  private computeDelta(previousText: string, nextText: string): string {
    if (!nextText) {
      return '';
    }

    if (nextText.startsWith(previousText)) {
      return nextText.slice(previousText.length);
    }

    return nextText;
  }
}
