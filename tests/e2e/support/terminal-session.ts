import {Terminal} from '@xterm/headless';
import * as nodePty from '@lydell/node-pty';

type TextSource = 'raw' | 'screen' | 'either';
type SupportedKey = 'enter' | 'escape' | 'ctrl-c' | 'up' | 'down' | 'left' | 'right';

export interface TerminalExit {
  exitCode: number;
  signal?: number;
}

export class TerminalSession {
  private readonly terminal: Terminal;
  private readonly ptyProcess: nodePty.IPty;
  private readonly rawChunks: string[] = [];
  private writeQueue: Promise<void> = Promise.resolve();
  private lastOutputAt = Date.now();
  private readonly exitPromise: Promise<TerminalExit>;
  private exitResult: TerminalExit | null = null;

  private constructor(options: {
    command: string;
    args?: string[];
    cwd: string;
    env?: Record<string, string | undefined>;
    cols?: number;
    rows?: number;
  }) {
    const cols = options.cols ?? 120;
    const rows = options.rows ?? 40;

    this.terminal = new Terminal({
      cols,
      rows,
      scrollback: 2_000,
      allowProposedApi: true
    });
    this.ptyProcess = nodePty.spawn(options.command, options.args ?? [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env
      } as Record<string, string>
    });
    this.exitPromise = new Promise<TerminalExit>(resolve => {
      this.ptyProcess.onExit(event => {
        const exit: TerminalExit = {
          exitCode: event.exitCode,
          ...(event.signal === undefined ? {} : {signal: event.signal})
        };
        this.exitResult = exit;
        resolve(exit);
      });
    });

    this.ptyProcess.onData(data => {
      this.rawChunks.push(data);
      this.lastOutputAt = Date.now();
      this.writeQueue = this.writeQueue.then(async () => {
        await new Promise<void>(resolve => {
          this.terminal.write(data, () => resolve());
        });
      });
    });
  }

  static spawn(options: {
    command: string;
    args?: string[];
    cwd: string;
    env?: Record<string, string | undefined>;
    cols?: number;
    rows?: number;
  }): TerminalSession {
    return new TerminalSession(options);
  }

  type(text: string): void {
    this.ptyProcess.write(text);
  }

  send(text: string): void {
    this.type(text);
  }

  press(key: SupportedKey): void {
    this.ptyProcess.write(resolveKeySequence(key));
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
    this.terminal.resize(cols, rows);
  }

  rawOutput(): string {
    return this.rawChunks.join('');
  }

  async screen(): Promise<string> {
    await this.writeQueue;

    const buffer = this.terminal.buffer.active;
    const lineCount = Math.min(this.terminal.rows, buffer.length);
    const startLine = Math.max(0, buffer.length - lineCount);
    const lines: string[] = [];

    for (let index = 0; index < lineCount; index += 1) {
      const line = buffer.getLine(startLine + index);
      lines.push(line ? line.translateToString(true) : '');
    }

    return normalizeScreen(lines);
  }

  async waitForText(
    text: string,
    options?: {
      source?: TextSource;
      timeoutMs?: number;
      intervalMs?: number;
    }
  ): Promise<void> {
    const source = options?.source ?? 'either';
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const intervalMs = options?.intervalMs ?? 50;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const raw = this.rawOutput();
      const screen = await this.screen();

      if (matchesTextSource(source, text, raw, screen)) {
        return;
      }

      await delay(intervalMs);
    }

    throw new Error(
      [
        `Timed out after ${timeoutMs}ms waiting for '${text}' in ${source} output.`,
        '',
        'Visible screen:',
        await this.screen(),
        '',
        'Raw output tail:',
        tail(this.rawOutput(), 4_000)
      ].join('\n')
    );
  }

  async waitForIdleFrame(options?: {
    idleMs?: number;
    timeoutMs?: number;
  }): Promise<void> {
    const idleMs = options?.idleMs ?? 300;
    const timeoutMs = options?.timeoutMs ?? 10_000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      await this.writeQueue;

      if (Date.now() - this.lastOutputAt >= idleMs) {
        return;
      }

      await delay(25);
    }

    throw new Error(`Timed out after ${timeoutMs}ms waiting for the terminal to go idle.`);
  }

  async waitForExit(timeoutMs = 30_000): Promise<TerminalExit> {
    if (this.exitResult) {
      return this.exitResult;
    }

    return await promiseWithTimeout(this.exitPromise, timeoutMs, 'terminal exit');
  }

  async close(): Promise<void> {
    if (!this.exitResult) {
      this.ptyProcess.kill();
    }

    await this.waitForExit(5_000).catch(() => undefined);
  }
}

function matchesTextSource(
  source: TextSource,
  text: string,
  raw: string,
  screen: string
): boolean {
  if (source === 'raw') {
    return raw.includes(text);
  }

  if (source === 'screen') {
    return screen.includes(text);
  }

  return raw.includes(text) || screen.includes(text);
}

function resolveKeySequence(key: SupportedKey): string {
  switch (key) {
    case 'enter':
      return '\r';
    case 'escape':
      return '\u001B';
    case 'ctrl-c':
      return '\u0003';
    case 'up':
      return '\u001B[A';
    case 'down':
      return '\u001B[B';
    case 'left':
      return '\u001B[D';
    case 'right':
      return '\u001B[C';
  }
}

function normalizeScreen(lines: string[]): string {
  return trimEmptyLines(lines.map(line => line.replace(/\s+$/u, ''))).join('\n');
}

function trimEmptyLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start]?.trim() === '') {
    start += 1;
  }

  while (end > start && lines[end - 1]?.trim() === '') {
    end -= 1;
  }

  return lines.slice(start, end);
}

function tail(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(value.length - maxLength);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function promiseWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  description: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${description}.`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
