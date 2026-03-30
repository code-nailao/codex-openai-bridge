export type OpenAIErrorBody = {
  error: {
    message: string;
    type: string;
    code: string;
    param?: string;
  };
};

export type BridgeErrorOptions = {
  statusCode: number;
  type: string;
  code: string;
  param?: string;
};

export class BridgeError extends Error {
  public readonly statusCode: number;
  public readonly type: string;
  public readonly code: string;
  public readonly param: string | undefined;

  public constructor(message: string, options: BridgeErrorOptions) {
    super(message);
    this.name = 'BridgeError';
    this.statusCode = options.statusCode;
    this.type = options.type;
    this.code = options.code;
    this.param = options.param;
  }

  public toResponseBody(): OpenAIErrorBody {
    return {
      error: {
        message: this.message,
        type: this.type,
        code: this.code,
        ...(this.param ? { param: this.param } : {}),
      },
    };
  }
}

export function createUnsupportedFeatureError(param: string): BridgeError {
  return new BridgeError(`The field "${param}" is not supported in v1.`, {
    statusCode: 422,
    type: 'invalid_request_error',
    code: 'unsupported_feature',
    param,
  });
}

export function createInvalidRequestError(message: string, param?: string): BridgeError {
  return new BridgeError(message, {
    statusCode: 400,
    type: 'invalid_request_error',
    code: 'invalid_request',
    ...(param ? { param } : {}),
  });
}

export function createUnauthorizedError(): BridgeError {
  return new BridgeError('Missing or invalid bearer token.', {
    statusCode: 401,
    type: 'invalid_request_error',
    code: 'unauthorized',
  });
}

export function createModelNotFoundError(model: string): BridgeError {
  return new BridgeError(`The model "${model}" is not available on this bridge.`, {
    statusCode: 404,
    type: 'invalid_request_error',
    code: 'model_not_found',
    param: 'model',
  });
}

export function createSessionConflictError(
  message = 'The supplied session identifiers resolve to different Codex threads.',
): BridgeError {
  return new BridgeError(message, {
    statusCode: 409,
    type: 'invalid_request_error',
    code: 'session_conflict',
  });
}

export function createApprovalRequiredError(message: string): BridgeError {
  return new BridgeError(message, {
    statusCode: 409,
    type: 'invalid_request_error',
    code: 'approval_required',
  });
}

export function createUpstreamUnavailableError(message: string): BridgeError {
  return new BridgeError(message, {
    statusCode: 503,
    type: 'server_error',
    code: 'upstream_unavailable',
  });
}

export function createUpstreamTimeoutError(message: string): BridgeError {
  return new BridgeError(message, {
    statusCode: 504,
    type: 'server_error',
    code: 'upstream_timeout',
  });
}

export function createRateLimitError(message: string): BridgeError {
  return new BridgeError(message, {
    statusCode: 429,
    type: 'rate_limit_error',
    code: 'rate_limit_exceeded',
  });
}

export function createInternalServerError(
  message = 'An unexpected bridge error occurred.',
): BridgeError {
  return new BridgeError(message, {
    statusCode: 500,
    type: 'server_error',
    code: 'internal_error',
  });
}
