import type { LogSink } from './file-log-sink.js';

type LogValue = string | number | boolean | null | undefined;

export type LogFields = Record<string, LogValue>;

export interface LoggerLike {
  info(event: string, fields?: LogFields, at?: Date): void;
  error(event: string, fields?: LogFields, at?: Date): void;
  close(): void;
}

function normalizeFields(fields: LogFields): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Record<
    string,
    string | number | boolean | null
  >;
}

function writeStdout(line: string) {
  process.stdout.write(`${line}\n`);
}

export class BridgeLogger implements LoggerLike {
  public constructor(private readonly options?: { sink?: LogSink | null }) {}

  public info(event: string, fields: LogFields = {}, at = new Date()) {
    this.write('info', event, fields, at);
  }

  public error(event: string, fields: LogFields = {}, at = new Date()) {
    this.write('error', event, fields, at);
  }

  public close() {
    this.options?.sink?.close();
  }

  private write(level: 'info' | 'error', event: string, fields: LogFields, at: Date) {
    const line = JSON.stringify({
      timestamp: at.toISOString(),
      level,
      event,
      ...normalizeFields(fields),
    });

    if (this.options?.sink) {
      this.options.sink.write(line, at);
      return;
    }

    writeStdout(line);
  }
}

class NoopLogger implements LoggerLike {
  public info() {}

  public error() {}

  public close() {}
}

export function createNoopLogger(): LoggerLike {
  return new NoopLogger();
}
