import fs from 'node:fs/promises';
import path from 'node:path';

export interface ScanLogger {
  readonly path: string;
  write(kind: string, data?: unknown): void;
  close(): Promise<void>;
}

class FileScanLogger implements ScanLogger {
  readonly path: string;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(logPath: string) {
    this.path = logPath;
  }

  write(kind: string, data?: unknown): void {
    const entry = {
      ts: new Date().toISOString(),
      kind,
      data: normalizeJsonValue(data)
    };
    const line = `${JSON.stringify(entry)}\n`;
    this.pendingWrite = this.pendingWrite.then(() => fs.appendFile(this.path, line, 'utf8'));
  }

  async close(): Promise<void> {
    await this.pendingWrite;
  }
}

export async function createScanLogger(logPath?: string): Promise<ScanLogger | null> {
  if (!logPath) {
    return null;
  }

  const absolutePath = path.resolve(logPath);
  await fs.mkdir(path.dirname(absolutePath), {recursive: true});
  await fs.writeFile(absolutePath, '', 'utf8');

  const logger = new FileScanLogger(absolutePath);
  logger.write('log.opened', {
    cwd: process.cwd(),
    pid: process.pid
  });
  return logger;
}

function normalizeJsonValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeJsonValue(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);
    const result = Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, normalizeJsonValue(entryValue, seen)])
    );
    seen.delete(value);
    return result;
  }

  return String(value);
}
