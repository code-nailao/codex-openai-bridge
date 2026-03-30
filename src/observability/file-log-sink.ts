import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function resolveDevLogFilePath(rootDir: string, at: Date): string {
  const year = padTwoDigits(at.getFullYear() % 100);
  const month = padTwoDigits(at.getMonth() + 1);
  const day = padTwoDigits(at.getDate());

  return join(rootDir, `${year}-${month}`, `${year}-${month}-${day}.log`);
}

export interface LogSink {
  write(line: string, at?: Date): void;
  close(): void;
}

export class FileLogSink implements LogSink {
  public constructor(private readonly options: { rootDir: string }) {}

  public write(line: string, at = new Date()) {
    const filePath = resolveDevLogFilePath(this.options.rootDir, at);
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, `${line}\n`, 'utf8');
  }

  public close() {}
}
