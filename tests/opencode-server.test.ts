import {EventEmitter} from 'node:events';
import {afterEach, describe, expect, it, vi} from 'vitest';

const mockSpawn = vi.fn();
const mockCreateOpencodeClient = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: mockSpawn
}));

vi.mock('@opencode-ai/sdk', () => ({
  createOpencodeClient: mockCreateOpencodeClient
}));

const {createManagedOpencodeServer} = await import('../src/lib/opencode-server.js');

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('createManagedOpencodeServer', () => {
  it('kills the OpenCode process group on close', async () => {
    const proc = new FakeChildProcess();
    mockSpawn.mockReturnValue(proc);
    mockCreateOpencodeClient.mockReturnValue({tag: 'client'});

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((pid: number, signal?: number | NodeJS.Signals) => {
      proc.signalCode = typeof signal === 'string' ? signal : 'SIGTERM';
      queueMicrotask(() => {
        proc.emit('exit', null, proc.signalCode);
      });
      return true;
    }) as typeof process.kill);

    const serverPromise = createManagedOpencodeServer({
      config: {},
      port: 42113
    });

    proc.stdout.emit('data', Buffer.from('opencode server listening on http://127.0.0.1:42113\n'));

    const server = await serverPromise;
    expect(server.pid).toBe(4321);
    expect(mockCreateOpencodeClient).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:42113'
    });

    await server.close();

    if (process.platform === 'win32') {
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    } else {
      expect(killSpy).toHaveBeenCalledWith(-4321, 'SIGTERM');
    }
    expect(proc.stdout.destroyed).toBe(true);
    expect(proc.stderr.destroyed).toBe(true);
  });
});

class FakeStream extends EventEmitter {
  destroyed = false;

  destroy(): void {
    this.destroyed = true;
  }
}

class FakeChildProcess extends EventEmitter {
  readonly pid = 4321;
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();
  readonly kill = vi.fn((signal?: number | NodeJS.Signals) => {
    this.signalCode = typeof signal === 'string' ? signal : 'SIGTERM';
    queueMicrotask(() => {
      this.emit('exit', null, this.signalCode);
    });
    return true;
  });
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
}
