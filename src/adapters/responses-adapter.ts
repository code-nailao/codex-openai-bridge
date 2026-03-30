import type { ThreadOptions, Usage } from '@openai/codex-sdk';
import { z } from 'zod';

import type { BridgeConfig } from '../config/env.js';
import { findSupportedModel, type SupportedModel } from '../config/models.js';
import {
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  SUPPORTED_REASONING_EFFORTS,
} from '../config/request-defaults.js';
import { createInvalidRequestError, createModelNotFoundError, createUnsupportedFeatureError } from '../server/errors/bridge-error.js';
import { createResponseId } from '../utils/ids.js';

const textPartSchema = z.object({
  type: z.enum(['text', 'input_text']),
  text: z.string(),
});

const inputMessageSchema = z.object({
  role: z.enum(['system', 'developer', 'user', 'assistant']),
  content: z.union([z.string(), z.array(textPartSchema)]),
});

const reasoningEffortSchema = z.enum(SUPPORTED_REASONING_EFFORTS);

const responsesRequestSchema = z
  .object({
    model: z.string().min(1).default(DEFAULT_MODEL),
    input: z.union([z.string(), z.array(inputMessageSchema)]),
    instructions: z.string().optional(),
    stream: z.boolean().optional().default(false),
    previous_response_id: z.string().min(1).optional(),
    reasoning_effort: reasoningEffortSchema.default(DEFAULT_REASONING_EFFORT),
    tools: z.unknown().optional(),
    text: z.unknown().optional(),
    response_format: z.unknown().optional(),
    audio: z.unknown().optional(),
  })
  .passthrough();

export type NormalizedResponsesRequest = {
  model: SupportedModel;
  input: string;
  stream: boolean;
  reasoningEffort: (typeof SUPPORTED_REASONING_EFFORTS)[number];
  previousResponseId: string | null;
  threadOptions: ThreadOptions;
};

export type ResponsesUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

export type ResponseObject = {
  id: string;
  object: 'response';
  created_at: number;
  status: 'completed';
  model: string;
  output_text: string;
  output: [
    {
      id: string;
      type: 'message';
      role: 'assistant';
      content: [
        {
          type: 'output_text';
          text: string;
          annotations: [];
        },
      ];
    },
  ];
  usage: ResponsesUsage;
};

function extractText(content: string | Array<{ type: 'text' | 'input_text'; text: string }>): string {
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

function buildResponsesTranscript(input: z.infer<typeof responsesRequestSchema>['input']): string {
  if (typeof input === 'string') {
    return `user: ${input}`;
  }

  const transcriptLines = input.map((message) => `${message.role}: ${extractText(message.content)}`);
  if (transcriptLines.length === 0) {
    throw createInvalidRequestError('The input array must contain at least one message.', 'input');
  }

  return transcriptLines.join('\n');
}

export function normalizeResponsesRequest(
  payload: unknown,
  config: BridgeConfig,
  options?: { workingDirectory?: string },
): NormalizedResponsesRequest {
  const parsed = responsesRequestSchema.parse(payload);

  if (parsed.tools !== undefined) {
    throw createUnsupportedFeatureError('tools');
  }

  if (parsed.audio !== undefined) {
    throw createUnsupportedFeatureError('audio');
  }

  if (parsed.response_format !== undefined) {
    throw createUnsupportedFeatureError('response_format');
  }

  if (parsed.text !== undefined) {
    throw createUnsupportedFeatureError('text');
  }

  const selectedModel = resolveRequestedModel(config, parsed.model);
  const transcript = buildResponsesTranscript(parsed.input);
  const input = parsed.instructions
    ? `Instructions:\n${parsed.instructions}\n\nTranscript:\n${transcript}`
    : transcript;

  return {
    model: selectedModel,
    input,
    stream: parsed.stream,
    reasoningEffort: parsed.reasoning_effort,
    previousResponseId: parsed.previous_response_id ?? null,
    threadOptions: {
      sandboxMode: config.runtimePolicy.sandboxMode,
      approvalPolicy: config.runtimePolicy.approvalPolicy,
      webSearchMode: config.runtimePolicy.webSearchMode,
      model: selectedModel.resolved_model,
      modelReasoningEffort: parsed.reasoning_effort,
      ...(options?.workingDirectory ? { workingDirectory: options.workingDirectory } : {}),
    },
  };
}

export function toResponsesUsage(usage: Usage | null): ResponsesUsage {
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
  };
}

export function createResponseObject(input: {
  responseId?: string;
  model: string;
  text: string;
  usage: Usage | null;
  createdAt?: Date;
}): ResponseObject {
  const responseId = input.responseId ?? createResponseId();
  const messageId = `msg_${responseId.replace(/^resp_/, '')}`;
  const createdAt = input.createdAt ?? new Date();

  return {
    id: responseId,
    object: 'response',
    created_at: Math.floor(createdAt.getTime() / 1000),
    status: 'completed',
    model: input.model,
    output_text: input.text,
    output: [
      {
        id: messageId,
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: input.text,
            annotations: [],
          },
        ],
      },
    ],
    usage: toResponsesUsage(input.usage),
  };
}
