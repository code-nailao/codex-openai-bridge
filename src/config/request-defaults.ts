export const SUPPORTED_REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export type ReasoningEffort = (typeof SUPPORTED_REASONING_EFFORTS)[number];

export const DEFAULT_MODEL = 'gpt-5.4';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low';

export function normalizeReasoningEffortInput(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '' || normalized === 'none') {
    return undefined;
  }

  return normalized;
}
