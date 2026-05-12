import {describe, expect, it, vi} from 'vitest';

const mockRunProcess = vi.fn();

vi.mock('../src/lib/process.js', () => ({
  runProcess: mockRunProcess
}));

const {resolveScanScope} = await import('../src/lib/scope.js');

describe('resolveScanScope ownership errors', () => {
  it('reports git safe.directory ownership protection explicitly', async () => {
    mockRunProcess.mockRejectedValueOnce(
      new Error(
        "Command failed (git -C /workspace/repo rev-parse --is-inside-work-tree): fatal: detected dubious ownership in repository at '/workspace/repo'"
      )
    );

    await expect(resolveScanScope('/workspace/repo', 'full')).rejects.toThrow(
      /git safe\.directory ownership protection/i
    );
  });
});
