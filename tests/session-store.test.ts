import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { SessionLockManager } from '../src/store/locks.js';
import { SessionStore } from '../src/store/session-store.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createDbPath() {
  const dir = await mkdtemp(join(tmpdir(), 'codex-openai-bridge-'));
  tempDirs.push(dir);
  return join(dir, 'bridge.sqlite');
}

describe('SessionStore', () => {
  it('persists sessions and response mappings across restarts', async () => {
    const dbPath = await createDbPath();

    const firstStore = new SessionStore({ dbPath });
    firstStore.upsertSession({
      sessionId: 'session-1',
      threadId: 'thread-1',
      modelId: 'gpt-5.4',
      workspaceCwd: '/tmp/workspace',
    });
    firstStore.upsertResponse({
      responseId: 'resp-1',
      sessionId: 'session-1',
      threadId: 'thread-1',
    });
    firstStore.close();

    const secondStore = new SessionStore({ dbPath });

    const session = secondStore.getSession('session-1');
    const response = secondStore.getResponse('resp-1');

    expect(session).not.toBeNull();
    expect(session).toMatchObject({
      sessionId: 'session-1',
      threadId: 'thread-1',
      modelId: 'gpt-5.4',
      workspaceCwd: '/tmp/workspace',
    });
    expect(typeof session?.updatedAt).toBe('string');

    expect(response).not.toBeNull();
    expect(response).toMatchObject({
      responseId: 'resp-1',
      sessionId: 'session-1',
      threadId: 'thread-1',
    });
    expect(typeof response?.createdAt).toBe('string');

    secondStore.close();
  });

  it('migrates legacy model_alias session rows to model_id', async () => {
    const dbPath = await createDbPath();
    const legacyDb = new Database(dbPath);

    legacyDb.exec(`
      CREATE TABLE sessions (
        session_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        model_alias TEXT NOT NULL,
        workspace_cwd TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE responses (
        response_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    legacyDb
      .prepare(`
        INSERT INTO sessions (session_id, thread_id, model_alias, workspace_cwd, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run('legacy-session', 'legacy-thread', 'gpt-5.4', '/tmp/legacy-workspace', new Date().toISOString());
    legacyDb.close();

    const store = new SessionStore({ dbPath });
    const session = store.getSession('legacy-session');
    const migratedDb = new Database(dbPath, { readonly: true });
    const columns = migratedDb
      .prepare<
        [],
        {
          name: string;
        }
      >('PRAGMA table_info(sessions)')
      .all()
      .map((column) => column.name);

    expect(columns).toContain('model_id');
    expect(session).toMatchObject({
      sessionId: 'legacy-session',
      threadId: 'legacy-thread',
      modelId: 'gpt-5.4',
      workspaceCwd: '/tmp/legacy-workspace',
    });

    migratedDb.close();
    store.close();
  });
});

describe('SessionLockManager', () => {
  it('serializes work for the same session id', async () => {
    const locks = new SessionLockManager();
    const events: string[] = [];

    const first = locks.withSessionLock('session-1', async () => {
      events.push('first:start');
      await new Promise((resolve) => setTimeout(resolve, 25));
      events.push('first:end');
    });

    const second = locks.withSessionLock('session-1', () => {
      events.push('second:start');
      events.push('second:end');
    });

    await Promise.all([first, second]);

    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });
});
