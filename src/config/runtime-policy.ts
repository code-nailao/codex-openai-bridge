export type ApprovalPolicy = 'never' | 'on-request' | 'on-failure' | 'untrusted';
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export type WebSearchMode = 'disabled' | 'cached' | 'live';

export type RuntimePolicy = {
  sandboxMode: SandboxMode;
  approvalPolicy: ApprovalPolicy;
  webSearchMode: WebSearchMode;
};

export function createRuntimePolicy(): RuntimePolicy {
  return {
    sandboxMode: 'read-only',
    approvalPolicy: 'never',
    webSearchMode: 'disabled',
  };
}
