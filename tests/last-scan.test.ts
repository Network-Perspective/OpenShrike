import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadLastScanState, saveLastScanState} from '../src/lib/last-scan.js';
import type {SavedScanRequest, ScanReport} from '../src/lib/types.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map(directory =>
    fs.rm(directory, {recursive: true, force: true})
  ));
});

describe('last scan state', () => {
  it('saves and loads the last completed report', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-last-scan-'));
    tempDirectories.push(repoRoot);
    const report = makeReport(repoRoot);
    const request: SavedScanRequest = {
      checkId: 'check-a',
      policyId: null,
      projectChecksDir: null,
      scanScope: 'full',
      scanTarget: null,
      runtimeMode: 'native'
    };

    const warnings = await saveLastScanState({report, request});
    const loaded = await loadLastScanState(repoRoot);

    expect(warnings).toEqual([]);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.state.request).toEqual(request);
    expect(loaded.state.scope).toEqual({
      kind: 'full',
      label: 'full repository',
      files: [],
      isFullRepository: true
    });
    expect(loaded.state.report).toEqual(report);
    await expect(fs.readFile(path.join(repoRoot, '.openshrike', 'last-scan.md'), 'utf8')).resolves.toContain(
      'JSON source of truth: `last-scan.json`'
    );
  });

  it('fails clearly when the saved state file is missing', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openshrike-last-scan-missing-'));
    tempDirectories.push(repoRoot);

    await expect(loadLastScanState(repoRoot)).rejects.toThrow(/Run `shrike scan` first/i);
  });
});

function makeReport(repoRoot: string): ScanReport {
  return {
    bundle_id: 'check-a',
    policy_version: '2026-05-12',
    repo: {
      path: repoRoot
    },
    execution: {
      runtime_mode: 'native',
      requested_parallelism: 1,
      effective_parallelism: 1,
      artifacts_dir: null
    },
    summary: {
      total_checks: 1,
      passed: 0,
      failed: 1,
      unknown: 0
    },
    checks: [
      {
        id: 'check-a',
        version: '0.1.0',
        status: 'fail',
        confidence: 'HIGH',
        evidence: ['src/index.ts:1'],
        rationale: 'Needs fixing.',
        remediation: ['Update the implementation.']
      }
    ]
  };
}
