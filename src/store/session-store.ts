import Database from 'better-sqlite3';

export type SessionRecord = {
  sessionId: string;
  threadId: string;
  modelAlias: string;
  workspaceCwd: string | null;
  updatedAt: string;
};

export type ResponseRecord = {
  responseId: string;
  sessionId: string;
  threadId: string;
  createdAt: string;
};

export class SessionStore {
  private readonly db: Database.Database;

  public constructor(options: { dbPath: string }) {
    this.db = new Database(options.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initializeSchema();
  }

  public upsertSession(input: {
    sessionId: string;
    threadId: string;
    modelAlias: string;
    workspaceCwd: string | null;
  }) {
    const updatedAt = new Date().toISOString();
    const statement = this.db.prepare(`
      INSERT INTO sessions (session_id, thread_id, model_alias, workspace_cwd, updated_at)
      VALUES (@sessionId, @threadId, @modelAlias, @workspaceCwd, @updatedAt)
      ON CONFLICT(session_id) DO UPDATE SET
        thread_id = excluded.thread_id,
        model_alias = excluded.model_alias,
        workspace_cwd = excluded.workspace_cwd,
        updated_at = excluded.updated_at
    `);

    statement.run({
      ...input,
      updatedAt,
    });
  }

  public getSession(sessionId: string): SessionRecord | null {
    const statement = this.db.prepare<
      [string],
      {
        session_id: string;
        thread_id: string;
        model_alias: string;
        workspace_cwd: string | null;
        updated_at: string;
      }
    >(`
      SELECT session_id, thread_id, model_alias, workspace_cwd, updated_at
      FROM sessions
      WHERE session_id = ?
    `);
    const row = statement.get(sessionId);

    if (!row) {
      return null;
    }

    return {
      sessionId: row.session_id,
      threadId: row.thread_id,
      modelAlias: row.model_alias,
      workspaceCwd: row.workspace_cwd,
      updatedAt: row.updated_at,
    };
  }

  public upsertResponse(input: { responseId: string; sessionId: string; threadId: string }) {
    const createdAt = new Date().toISOString();
    const statement = this.db.prepare(`
      INSERT INTO responses (response_id, session_id, thread_id, created_at)
      VALUES (@responseId, @sessionId, @threadId, @createdAt)
      ON CONFLICT(response_id) DO UPDATE SET
        session_id = excluded.session_id,
        thread_id = excluded.thread_id,
        created_at = excluded.created_at
    `);

    statement.run({
      ...input,
      createdAt,
    });
  }

  public getResponse(responseId: string): ResponseRecord | null {
    const statement = this.db.prepare<
      [string],
      {
        response_id: string;
        session_id: string;
        thread_id: string;
        created_at: string;
      }
    >(`
      SELECT response_id, session_id, thread_id, created_at
      FROM responses
      WHERE response_id = ?
    `);
    const row = statement.get(responseId);

    if (!row) {
      return null;
    }

    return {
      responseId: row.response_id,
      sessionId: row.session_id,
      threadId: row.thread_id,
      createdAt: row.created_at,
    };
  }

  public close() {
    this.db.close();
  }

  private initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        model_alias TEXT NOT NULL,
        workspace_cwd TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS responses (
        response_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }
}
