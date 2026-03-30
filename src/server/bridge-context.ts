import type { BridgeConfig } from '../config/env.js';
import type { RuntimeLike } from '../contracts/runtime.js';
import type { SessionLockManager } from '../store/locks.js';
import type { SessionStore } from '../store/session-store.js';

export type BridgeServices = {
  config: BridgeConfig;
  getRuntime(): RuntimeLike;
  sessionStore: SessionStore;
  lockManager: SessionLockManager;
};
