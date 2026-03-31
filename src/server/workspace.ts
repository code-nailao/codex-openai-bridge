import { isAbsolute, relative, resolve } from 'node:path';

import type { FastifyRequest } from 'fastify';

import type { BridgeConfig } from '../config/env.js';
import { createInvalidRequestError } from './errors/bridge-error.js';

function isWithinAllowedRoots(candidate: string, allowedRoots: string[]): boolean {
  return allowedRoots.some((root) => {
    const relation = relative(root, candidate);
    return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
  });
}

export function resolveWorkingDirectory(config: BridgeConfig, request: FastifyRequest): string {
  const requestedCwd = request.headers['x-codex-cwd'];

  if (!requestedCwd) {
    return config.workspace.root;
  }

  if (!config.workspace.allowHeaderOverride) {
    throw createInvalidRequestError('The x-codex-cwd header is disabled on this bridge.', 'x-codex-cwd');
  }

  if (Array.isArray(requestedCwd)) {
    throw createInvalidRequestError('The x-codex-cwd header must be a single path string.', 'x-codex-cwd');
  }

  const resolvedCwd = resolve(requestedCwd);
  if (!isWithinAllowedRoots(resolvedCwd, config.workspace.allowedRoots)) {
    throw createInvalidRequestError('The requested x-codex-cwd path is outside the configured allowlist.', 'x-codex-cwd');
  }

  return resolvedCwd;
}
