import {EventEmitter} from 'node:events';
import {afterEach, describe, expect, it, vi} from 'vitest';

const mockSpawn = vi.fn();
const mockCreateOpencodeClient = vi.fn();
const mockAccess = vi.fn();
const mockFindToolRoot = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: mockSpawn
}));

vi.mock('node:fs/promises', () => ({
  access: mockAccess
}));

vi.mock('@opencode-ai/sdk', () => ({
  createOpencodeClient: mockCreateOpencodeClient
}));

vi.mock('../src/lib/project-root.js', () => ({
  findToolRoot: mockFindToolRoot
}));

const {createManagedOpencodeServer} = await import('../src/lib/opencode-server.js');

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete process.env.OPENSHRIKE_OPENCODE_BINARY;
  delete process.env.OPENSHRIKE_OPENCODE_DB;
  delete process.env.OPENSHRIKE_NODE_BINARY;
});

describe('createManagedOpencodeServer', () => {
  it('kills the OpenCode process group on close', async () => {
    const proc = new FakeChildProcess();
    mockAccess.mockRejectedValue(new Error('missing'));
    mockFindToolRoot.mockReturnValue('/tool');
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

    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['serve', '--hostname=127.0.0.1', '--port=42113'],
        expect.objectContaining({
          stdio: ['ignore', 'pipe', 'pipe']
        })
      );
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

  it('prefers the bundled OpenCode launcher when available', async () => {
    const proc = new FakeChildProcess();
    process.env.OPENSHRIKE_NODE_BINARY = '/usr/local/bin/node';
    mockFindToolRoot.mockReturnValue('/tool');
    mockAccess.mockResolvedValue(undefined);
    mockSpawn.mockReturnValue(proc);
    mockCreateOpencodeClient.mockReturnValue({tag: 'client'});

    const serverPromise = createManagedOpencodeServer({
      config: {},
      port: 42113
    });

    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/local/bin/node',
        [
          '/tool/node_modules/opencode-ai/bin/opencode',
          'serve',
          '--hostname=127.0.0.1',
          '--port=42113'
        ],
        expect.objectContaining({
          env: expect.objectContaining({
            OPENCODE_DB: ':memory:',
            OPENSHRIKE_NODE_BINARY: '/usr/local/bin/node',
            OPENCODE_CONFIG_CONTENT: '{}'
          }),
          stdio: ['ignore', 'pipe', 'pipe']
        })
      );
    });

    proc.stdout.emit('data', Buffer.from('opencode server listening on http://127.0.0.1:42113\n'));

    const server = await serverPromise;
    expect(server.pid).toBe(4321);
  });

  it('uses the explicitly configured OpenCode binary when provided', async () => {
    const proc = new FakeChildProcess();
    process.env.OPENSHRIKE_OPENCODE_BINARY = '/tmp/fake-opencode';
    mockSpawn.mockReturnValue(proc);
    mockCreateOpencodeClient.mockReturnValue({tag: 'client'});

    const serverPromise = createManagedOpencodeServer({
      config: {},
      port: 42113
    });

    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledWith(
        '/tmp/fake-opencode',
        ['serve', '--hostname=127.0.0.1', '--port=42113'],
        expect.objectContaining({
          env: expect.objectContaining({
            OPENCODE_DB: ':memory:',
            OPENSHRIKE_OPENCODE_BINARY: '/tmp/fake-opencode',
            OPENCODE_CONFIG_CONTENT: '{}'
          }),
          stdio: ['ignore', 'pipe', 'pipe']
        })
      );
    });

    expect(mockFindToolRoot).not.toHaveBeenCalled();
    expect(mockAccess).not.toHaveBeenCalled();

    proc.stdout.emit('data', Buffer.from('opencode server listening on http://127.0.0.1:42113\n'));

    const server = await serverPromise;
    expect(server.pid).toBe(4321);
  });

  it('allows overriding the OpenCode database path explicitly', async () => {
    const proc = new FakeChildProcess();
    process.env.OPENSHRIKE_OPENCODE_DB = '/tmp/openshrike-opencode.db';
    mockAccess.mockRejectedValue(new Error('missing'));
    mockFindToolRoot.mockReturnValue('/tool');
    mockSpawn.mockReturnValue(proc);
    mockCreateOpencodeClient.mockReturnValue({tag: 'client'});

    const serverPromise = createManagedOpencodeServer({
      config: {},
      port: 42113
    });

    await vi.waitFor(() => {
      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        ['serve', '--hostname=127.0.0.1', '--port=42113'],
        expect.objectContaining({
          env: expect.objectContaining({
            OPENSHRIKE_OPENCODE_DB: '/tmp/openshrike-opencode.db',
            OPENCODE_DB: '/tmp/openshrike-opencode.db',
            OPENCODE_CONFIG_CONTENT: '{}'
          }),
          stdio: ['ignore', 'pipe', 'pipe']
        })
      );
    });

    proc.stdout.emit('data', Buffer.from('opencode server listening on http://127.0.0.1:42113\n'));

    const server = await serverPromise;
    expect(server.pid).toBe(4321);
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
