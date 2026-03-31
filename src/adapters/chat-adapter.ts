import type { ThreadOptions } from '@openai/codex-sdk';
import { z } from 'zod';

import type { BridgeConfig } from '../config/env.js';
import { findSupportedModel, type SupportedModel } from '../config/models.js';
import {
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  normalizeReasoningEffortInput,
  type ReasoningEffort,
  SUPPORTED_REASONING_EFFORTS,
} from '../config/request-defaults.js';
import { createChatCompletionId } from '../utils/ids.js';
import { createInvalidRequestError, createModelNotFoundError, createUnsupportedFeatureError } from '../server/errors/bridge-error.js';
import { toOpenAIUsage, type OpenAIUsage } from './usage.js';

const textContentPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const chatMessageSchema = z.object({
  role: z.enum(['system', 'developer', 'user', 'assistant']),
  content: z.union([z.string(), z.array(textContentPartSchema)]),
});

const reasoningEffortSchema = z.preprocess(
  normalizeReasoningEffortInput,
  z.enum(SUPPORTED_REASONING_EFFORTS).default(DEFAULT_REASONING_EFFORT),
);

const chatRequestSchema = z
  .object({
    model: z.string().min(1).default(DEFAULT_MODEL),
    messages: z.array(chatMessageSchema).min(1),
    stream: z.boolean().optional().default(false),
    max_completion_tokens: z.number().int().positive().optional(),
    reasoning_effort: reasoningEffortSchema.default(DEFAULT_REASONING_EFFORT),
    tools: z.unknown().optional(),
    audio: z.unknown().optional(),
    response_format: z.unknown().optional(),
  })
  .passthrough();

export type NormalizedChatRequest = {
  model: SupportedModel;
  stream: boolean;
  reasoningEffort: ReasoningEffort;
  input: string;
  threadOptions: ThreadOptions;
};

export type ChatCompletionResponse = {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: [
    {
      index: 0;
      message: {
        role: 'assistant';
        content: string;
      };
      finish_reason: 'stop';
    },
  ];
  usage: OpenAIUsage;
};

function extractMessageText(content: string | Array<{ type: 'text'; text: string }>): string {
  if (typeof content === 'string') {
    return content;
  }

  return content.map((part) => part.text).join('\n');
}

function resolveRequestedModel(config: BridgeConfig, id: string): SupportedModel {
  const selectedModel = findSupportedModel(config.models, id);
  if (!selectedModel) {
    throw createModelNotFoundError(id);
  }

  return selectedModel;
}

function buildInstructions(messages: z.infer<typeof chatMessageSchema>[], maxCompletionTokens?: number): string | null {
  const instructionLines = messages
    .filter((message) => message.role === 'system' || message.role === 'developer')
    .map((message) => extractMessageText(message.content));

  if (typeof maxCompletionTokens === 'number') {
    instructionLines.push(`Limit the assistant response to approximately ${maxCompletionTokens} completion tokens.`);
  }

  if (instructionLines.length === 0) {
    return null;
  }

  return instructionLines.join('\n\n');
}

function buildTranscript(messages: z.infer<typeof chatMessageSchema>[]): string {
  const transcriptLines = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => `${message.role}: ${extractMessageText(message.content)}`);

  if (transcriptLines.length === 0) {
    throw createInvalidRequestError('At least one user or assistant message is required.', 'messages');
  }

  return transcriptLines.join('\n');
}

export function normalizeChatRequest(payload: unknown, config: BridgeConfig, options?: { workingDirectory?: string }) {
  const parsed = chatRequestSchema.parse(payload);

  if (parsed.tools !== undefined) {
    throw createUnsupportedFeatureError('tools');
  }

  if (parsed.audio !== undefined) {
    throw createUnsupportedFeatureError('audio');
  }

  if (parsed.response_format !== undefined) {
    throw createUnsupportedFeatureError('response_format');
  }

  const selectedModel = resolveRequestedModel(config, parsed.model);
  const instructions = buildInstructions(parsed.messages, parsed.max_completion_tokens);
  const transcript = buildTranscript(parsed.messages);
  const input = instructions ? `Instructions:\n${instructions}\n\nTranscript:\n${transcript}` : transcript;

  return {
    model: selectedModel,
    stream: parsed.stream,
    reasoningEffort: parsed.reasoning_effort,
    input,
    threadOptions: {
      sandboxMode: config.runtimePolicy.sandboxMode,
      approvalPolicy: config.runtimePolicy.approvalPolicy,
      webSearchMode: config.runtimePolicy.webSearchMode,
      model: selectedModel.resolved_model,
      modelReasoningEffort: parsed.reasoning_effort,
      ...(options?.workingDirectory ? { workingDirectory: options.workingDirectory } : {}),
    },
  } satisfies NormalizedChatRequest;
}

export function toChatCompletionResponse(input: {
  model: string;
  content: string;
  usage: OpenAIUsage;
  createdAt?: Date;
}): ChatCompletionResponse {
  const createdAt = input.createdAt ?? new Date();

  return {
    id: createChatCompletionId(),
    object: 'chat.completion',
    created: Math.floor(createdAt.getTime() / 1000),
    model: input.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: input.content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: input.usage,
  };
}

export function createChatChunk(input: {
  id: string;
  model: string;
  created: number;
  delta?: { role?: 'assistant'; content?: string };
  finishReason?: 'stop';
}) {
  return {
    id: input.id,
    object: 'chat.completion.chunk' as const,
    created: input.created,
    model: input.model,
    choices: [
      {
        index: 0,
        delta: input.delta ?? {},
        finish_reason: input.finishReason ?? null,
      },
    ],
  };
}

export function mapUsage(usage: Parameters<typeof toOpenAIUsage>[0]): OpenAIUsage {
  return toOpenAIUsage(usage);
}
