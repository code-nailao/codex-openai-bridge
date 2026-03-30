# V1 Core Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tighten the v1 bridge implementation so streaming behavior is robust, HTTP orchestration is easier to maintain, health checks are real, and local dev logging is production-like without changing the public API surface.

**Architecture:** Keep the existing high-level layers (`server/`, `runtime/`, `adapters/`, `store/`, `config/`) but move duplicated orchestration into a shared execution layer and move runtime/stateful concerns behind focused interfaces. Treat logging and health as infrastructure services, not route-local conditionals.

**Tech Stack:** Node.js 22, TypeScript, Fastify, @openai/codex-sdk, better-sqlite3, Vitest.

---

### Task 1: Make streaming normalization resilient to non-prefix updates

**Files:**
- Modify: `tests/event-normalizer.test.ts`
- Modify: `src/adapters/event-normalizer.ts`
- Modify: `src/server/sse/chat-stream.ts`
- Modify: `src/server/sse/responses-stream.ts`

**Step 1: Write failing regression tests**
- Add a case where the same message id emits a revised full text that does not start with the previous text.
- Assert that chat streaming and responses streaming emit a coherent final transcript instead of duplicated text.

**Step 2: Run targeted tests to verify they fail**
- Run: `npm test -- tests/event-normalizer.test.ts`

**Step 3: Implement the minimal state model**
- Extend normalized runtime events so stream consumers can reconcile text by message id, not only append raw deltas.
- Keep the public HTTP event format unchanged.

**Step 4: Re-run targeted tests**
- Run: `npm test -- tests/event-normalizer.test.ts`

**Step 5: Commit**
- Commit message: `refactor: harden streamed text normalization`

### Task 2: Extract shared endpoint execution orchestration

**Files:**
- Create: `src/application/execution-context.ts`
- Create: `src/application/chat-execution.ts`
- Create: `src/application/responses-execution.ts`
- Modify: `src/server/routes/chat-completions.ts`
- Modify: `src/server/routes/responses.ts`
- Modify: `tests/chat-completions.test.ts`
- Modify: `tests/responses.test.ts`

**Step 1: Write or expand route-level regression tests**
- Cover both non-stream and stream paths after refactor.
- Preserve session headers and persistence guarantees.

**Step 2: Run targeted tests to verify behavior is pinned**
- Run: `npm test -- tests/chat-completions.test.ts tests/responses.test.ts`

**Step 3: Move duplicated orchestration out of routes**
- Centralize working directory resolution, abort controller handling, runtime parameter assembly, session persistence, and response header writes.
- Keep routes thin and protocol-focused.

**Step 4: Re-run targeted tests**
- Run: `npm test -- tests/chat-completions.test.ts tests/responses.test.ts`

**Step 5: Commit**
- Commit message: `refactor: extract endpoint execution services`

### Task 3: Implement actual health probing and structured local file logging

**Files:**
- Create: `src/observability/bridge-logger.ts`
- Create: `src/observability/file-log-sink.ts`
- Create: `src/observability/request-logging.ts`
- Create: `src/services/health-service.ts`
- Modify: `src/app.ts`
- Modify: `src/server/routes/healthz.ts`
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Modify: `tests/healthz.test.ts`
- Create or modify tests for logger behavior

**Step 1: Write failing tests**
- Add health route tests for sqlite and codex CLI probe status.
- Add logger tests for log path generation under `log/dev/yy-mm/yy-mm-dd.log`.

**Step 2: Run targeted tests to verify they fail**
- Run: `npm test -- tests/healthz.test.ts`

**Step 3: Implement infrastructure services**
- Add a logger abstraction with dev file sink and minimal structured fields.
- Add a health service that checks SQLite connectivity and cached `codex --version` status without running inference.

**Step 4: Re-run targeted tests**
- Run: `npm test -- tests/healthz.test.ts`

**Step 5: Commit**
- Commit message: `feat: add dev logging and active health probes`

### Task 4: Tighten workspace boundary checks and documentation sync

**Files:**
- Modify: `src/server/workspace.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/development.md`
- Modify: `CHANGELOG.md`

**Step 1: Write regression tests if workspace semantics change**
- Add allowlist tests if needed.

**Step 2: Implement path-safe containment checks**
- Avoid naive string-prefix directory checks.

**Step 3: Sync docs**
- Document health probe semantics, dev log layout, and mandatory Claude Opus 4.6 review gate when external review is available.

**Step 4: Commit**
- Commit message: `docs: align operational guidance with optimized runtime`

### Task 5: Full verification and local runtime validation

**Files:**
- No new code by default; touch docs only if verification uncovers mismatches.

**Step 1: Run full repository verification**
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

**Step 2: Run local bridge with the real runtime**
- Start the service with local env.
- Validate `GET /healthz`, `GET /v1/models`, and at least one `POST /v1/chat/completions` call against `http://127.0.0.1:8787/v1`.

**Step 3: Review final diff for patch-on-patch regressions**
- Ensure no new duplicate orchestration or hidden config reads remain.

**Step 4: Commit and push**
- Use small conventional commits if any verification-driven fixes are needed.
