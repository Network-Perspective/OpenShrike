import {describe, expect, it} from 'vitest';
import {MAX_CHECK_EVIDENCE_ITEMS} from '../src/lib/constants.js';
import {
  encodeDockerWireMessage,
  parseDockerFixRequest,
  parseDockerScanRequest,
  parseScanReport,
  tryDecodeDockerWireMessage
} from '../src/lib/docker-protocol.js';

describe('docker protocol', () => {
  it('parses a docker scan request envelope', () => {
    const request = parseDockerScanRequest({
      options: {
        policyId: 'typescript-baseline',
        repoPath: '/workspace/repo',
        outputFormat: 'json',
        scanScope: 'full',
        mockOpencode: false,
        runtimeMode: 'docker',
        parallelism: 4,
        ui: false
      },
      reportPath: '/io/report.json'
    });

    expect(request.reportPath).toBe('/io/report.json');
    expect(request.options.policyId).toBe('typescript-baseline');
  });

  it('decodes validated docker wire messages', () => {
    const line = encodeDockerWireMessage({
      kind: 'progress',
      event: {
        type: 'check-started',
        scopeLabel: 'full repository',
        scopeFileCount: 0,
        isFullRepository: true,
        checkIds: ['check-a'],
        checkId: 'check-a',
        workerId: 'worker-1',
        checkStatus: null,
        checkResult: null,
        passedCount: 0,
        failedCount: 0,
        unknownCount: 0,
        checkIndex: 0,
        completedCount: 0,
        totalChecks: 1,
        runningCheckIds: ['check-a'],
        statusLabel: 'Running check-a',
        detailLines: []
      }
    });

    const parsed = tryDecodeDockerWireMessage(line);
    expect(parsed).toMatchObject({
      kind: 'progress'
    });
  });

  it('parses a docker fix request envelope', () => {
    const request = parseDockerFixRequest({
      repoPath: '/workspace/repo',
      projectChecksDir: '/workspace/repo/.openshrike/checks',
      logPath: '/io/fix.log.jsonl',
      request: {
        checkId: 'check-a',
        policyId: null,
        projectChecksDir: '/workspace/repo/.openshrike/checks',
        scanScope: 'full',
        scanTarget: null,
        runtimeMode: 'docker'
      },
      check: {
        id: 'check-a',
        version: '0.1.0',
        status: 'fail',
        confidence: 'HIGH',
        evidence: ['README.md:1'],
        rationale: 'broken',
        remediation: ['fix it']
      },
      scope: {
        kind: 'full',
        label: 'full repository',
        files: [],
        isFullRepository: true
      },
      agent: 'shrike-fixer',
      model: 'azure/gpt-5.4',
      emulateOpencode: false
    });

    expect(request.repoPath).toBe('/workspace/repo');
    expect(request.logPath).toBe('/io/fix.log.jsonl');
    expect(request.request.runtimeMode).toBe('docker');
    expect(request.check.id).toBe('check-a');
  });

  it('rejects malformed report payloads', () => {
    expect(() => parseScanReport('{"bundle_id":"x"}')).toThrow();
  });

  it('rejects report payloads with oversized evidence arrays', () => {
    const evidence = Array.from({length: MAX_CHECK_EVIDENCE_ITEMS + 1}, (_, index) => `src/file-${index}.ts:1`);

    expect(() => parseScanReport(JSON.stringify({
      bundle_id: 'typescript-baseline',
      policy_version: '2026-03-23',
      repo: {
        path: '/workspace/repo'
      },
      summary: {
        total_checks: 1,
        passed: 1,
        failed: 0,
        unknown: 0
      },
      checks: [{
        id: 'check-a',
        version: '0.1.0',
        status: 'pass',
        confidence: 'HIGH',
        evidence,
        rationale: 'ok',
        remediation: []
      }]
    }))).toThrow();
  });
});
