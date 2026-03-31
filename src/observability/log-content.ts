import type { BridgeLogContentMode } from '../config/env.js';

export type LogContentConfig = {
  contentMode: BridgeLogContentMode;
  maxContentChars: number;
};

export type LogContentSummary = {
  chars: number;
  preview?: string;
  truncated?: boolean;
};

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+[^\s,;]+/gi,
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]+\b/g,
];

const KEY_VALUE_PATTERN =
  /((?:"|')?[A-Za-z0-9._-]*?(?:api[_-]?key|token|secret|password)[A-Za-z0-9._-]*(?:"|')?\s*[:=]\s*(?:"|')?)([^"',\s}]+)/gi;

function redactSensitiveText(text: string): string {
  const withMaskedValues = SENSITIVE_VALUE_PATTERNS.reduce((current, pattern) => {
    if (pattern.source.startsWith('\\bBearer')) {
      return current.replace(pattern, 'Bearer [REDACTED]');
    }

    return current.replace(pattern, '[REDACTED]');
  }, text);

  return withMaskedValues.replace(KEY_VALUE_PATTERN, '$1[REDACTED]');
}

function truncatePreview(text: string, maxContentChars: number): { preview: string; truncated: boolean } {
  if (text.length <= maxContentChars) {
    return {
      preview: text,
      truncated: false,
    };
  }

  if (maxContentChars <= 3) {
    return {
      preview: text.slice(0, maxContentChars),
      truncated: true,
    };
  }

  return {
    preview: `${text.slice(0, maxContentChars - 3)}...`,
    truncated: true,
  };
}

export function summarizeLogText(text: string, config: LogContentConfig): LogContentSummary {
  const chars = text.length;

  if (config.contentMode === 'none') {
    return { chars };
  }

  const redacted = redactSensitiveText(text);
  const { preview, truncated } = truncatePreview(redacted, config.maxContentChars);

  return {
    chars,
    preview,
    truncated,
  };
}

export function shouldIncludeContentPreview(config: LogContentConfig, statusCode: number): boolean {
  switch (config.contentMode) {
    case 'full':
      return true;
    case 'errors-only':
      return statusCode >= 400;
    case 'none':
    default:
      return false;
  }
}
