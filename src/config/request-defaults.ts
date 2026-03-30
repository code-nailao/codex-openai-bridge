export const SUPPORTED_REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export type ReasoningEffort = (typeof SUPPORTED_REASONING_EFFORTS)[number];

export const DEFAULT_MODEL = 'gpt-5.4';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'medium';
