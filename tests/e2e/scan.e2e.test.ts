import type {ScanReport} from '../../src/lib/types.js';
import {describe, expect, it} from 'vitest';
import {MockAiServer, type MockAiRequest} from './support/mock-ai-server.js';
import {TerminalSession} from './support/terminal-session.js';
import {
  createPhase1ScanFixture,
  removeTempPaths,
  type Phase1ScanFixture
} from './support/test-env.js';

describe('scan terminal e2e', () => {
  it('runs shrike scan in a PTY and captures the outbound prompt', async () => {
    const mockServer = await MockAiServer.start();
    let fixture: Phase1ScanFixture | null = null;
    let session: TerminalSession | null = null;

    try {
      fixture = await createPhase1ScanFixture({
        mockProviderBaseUrl: `${mockServer.baseUrl}/v1`
      });
      mockServer.enqueueTextResponse(buildCheckResultText(fixture, {
        status: 'pass',
        confidence: 'HIGH',
        rationale: 'The changed auth module still exports validateAuthToken and returns a boolean.',
        remediation: ['No action required.']
      }));

      session = TerminalSession.spawn({
        command: fixture.commandPath,
        args: ['scan'],
        cwd: fixture.repoRoot,
        env: fixture.env,
        cols: 120,
        rows: 40
      });

      await session.waitForText('Scan complete', {
        source: 'screen',
        timeoutMs: 60_000
      });
      await session.waitForIdleFrame({
        idleMs: 300,
        timeoutMs: 10_000
      });

      const completedScreen = await session.screen();
      expect(completedScreen).toContain('Status: Scan complete');
      expect(completedScreen).toContain('1 TOTAL CHECKS');
      expect(completedScreen).toContain('1 Passed');

      session.press('escape');

      await session.waitForText('# OpenShrike Scan Report', {
        source: 'raw',
        timeoutMs: 30_000
      });

      const exit = await session.waitForExit(30_000);
      expect(exit.exitCode).toBe(0);
      expectPhase1Prompt(expectSingleRequest(mockServer), fixture);

      const rawOutput = session.rawOutput();
      expect(rawOutput).toContain('# OpenShrike Scan Report');
      expect(rawOutput).toContain(`### \`${fixture.checkId}\``);
      expect(rawOutput).toContain('- Status: `pass`');
      expect(rawOutput).toContain('- Confidence: `HIGH`');
      expect(rawOutput).toContain(`- \`${fixture.changedFilePath}:1\``);
    } finally {
      await session?.close();
      await mockServer.close();
      if (fixture) {
        await removeTempPaths(fixture.tempPaths);
      }
    }
  });

  it('returns exit code 2 and prints markdown when the check fails in the TUI flow', async () => {
    const mockServer = await MockAiServer.start();
    let fixture: Phase1ScanFixture | null = null;
    let session: TerminalSession | null = null;

    try {
      fixture = await createPhase1ScanFixture({
        mockProviderBaseUrl: `${mockServer.baseUrl}/v1`
      });
      mockServer.enqueueTextResponse(buildCheckResultText(fixture, {
        status: 'fail',
        confidence: 'HIGH',
        rationale: 'The auth token validation no longer trims whitespace before checking emptiness.',
        remediation: ['Normalize the token before testing its length.']
      }));

      session = TerminalSession.spawn({
        command: fixture.commandPath,
        args: ['scan'],
        cwd: fixture.repoRoot,
        env: fixture.env,
        cols: 120,
        rows: 40
      });

      await session.waitForText('Scan complete', {
        source: 'screen',
        timeoutMs: 60_000
      });
      await session.waitForIdleFrame({
        idleMs: 300,
        timeoutMs: 10_000
      });

      const completedScreen = await session.screen();
      expect(completedScreen).toContain('Status: Scan complete');
      expect(completedScreen).toContain('1 TOTAL CHECKS');
      expect(completedScreen).toContain('1 Failed');

      session.press('escape');

      await session.waitForText('# OpenShrike Scan Report', {
        source: 'raw',
        timeoutMs: 30_000
      });

      const exit = await session.waitForExit(30_000);
      expect(exit.exitCode).toBe(2);
      expectPhase1Prompt(expectSingleRequest(mockServer), fixture);

      const rawOutput = session.rawOutput();
      expect(rawOutput).toContain('# OpenShrike Scan Report');
      expect(rawOutput).toContain('## Failing Checks');
      expect(rawOutput).toContain(`### \`${fixture.checkId}\``);
      expect(rawOutput).toContain('- Status: `fail`');
      expect(rawOutput).toContain('- Confidence: `HIGH`');
      expect(rawOutput).toContain(`- \`${fixture.changedFilePath}:1\``);
      expect(rawOutput).toContain('Normalize the token before testing its length.');
    } finally {
      await session?.close();
      await mockServer.close();
      if (fixture) {
        await removeTempPaths(fixture.tempPaths);
      }
    }
  });

  it('returns exit code 2 and prints json in headless mode when the check fails', async () => {
    const mockServer = await MockAiServer.start();
    let fixture: Phase1ScanFixture | null = null;
    let session: TerminalSession | null = null;

    try {
      fixture = await createPhase1ScanFixture({
        mockProviderBaseUrl: `${mockServer.baseUrl}/v1`
      });
      mockServer.enqueueTextResponse(buildCheckResultText(fixture, {
        status: 'fail',
        confidence: 'MEDIUM',
        rationale: 'The updated auth token validation needs a guard for trimmed empty input.',
        remediation: [
          'Trim the token before validation.',
          'Keep the function return type boolean.'
        ]
      }));

      session = TerminalSession.spawn({
        command: fixture.commandPath,
        args: ['scan', '--no-ui', '--output', 'json'],
        cwd: fixture.repoRoot,
        env: fixture.env,
        cols: 120,
        rows: 40
      });

      await session.waitForText('"bundle_id"', {
        source: 'raw',
        timeoutMs: 60_000
      });

      const exit = await session.waitForExit(30_000);
      expect(exit.exitCode).toBe(2);
      expectPhase1Prompt(expectSingleRequest(mockServer), fixture);

      const report = extractJsonReport(session.rawOutput());
      expect(report.bundle_id).toBe('project-checks');
      expect(report.summary.total_checks).toBe(1);
      expect(report.summary.failed).toBe(1);
      expect(report.summary.passed).toBe(0);
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0]?.id).toBe(fixture.checkId);
      expect(report.checks[0]?.status).toBe('fail');
      expect(report.checks[0]?.confidence).toBe('MEDIUM');
      expect(report.checks[0]?.evidence).toEqual([`${fixture.changedFilePath}:1`]);
      expect(report.checks[0]?.remediation).toEqual([
        'Trim the token before validation.',
        'Keep the function return type boolean.'
      ]);
    } finally {
      await session?.close();
      await mockServer.close();
      if (fixture) {
        await removeTempPaths(fixture.tempPaths);
      }
    }
  });

  it('returns an unknown json report when the agent output is malformed on both attempts', async () => {
    const mockServer = await MockAiServer.start();
    let fixture: Phase1ScanFixture | null = null;
    let session: TerminalSession | null = null;

    try {
      fixture = await createPhase1ScanFixture({
        mockProviderBaseUrl: `${mockServer.baseUrl}/v1`
      });
      mockServer.enqueueTextResponse('still not json');
      mockServer.enqueueTextResponse('still not json');

      session = TerminalSession.spawn({
        command: fixture.commandPath,
        args: ['scan', '--no-ui', '--output', 'json'],
        cwd: fixture.repoRoot,
        env: fixture.env,
        cols: 120,
        rows: 40
      });

      await session.waitForText('"bundle_id"', {
        source: 'raw',
        timeoutMs: 60_000
      });

      const exit = await session.waitForExit(30_000);
      expect(exit.exitCode).toBe(0);
      expect(mockServer.requests).toHaveLength(2);
      expectPhase1Prompt(mockServer.requests[0]!, fixture);
      expectPhase1Prompt(mockServer.requests[1]!, fixture);

      const report = extractJsonReport(session.rawOutput());
      expect(report.bundle_id).toBe('project-checks');
      expect(report.summary.total_checks).toBe(1);
      expect(report.summary.failed).toBe(0);
      expect(report.summary.unknown).toBe(1);
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0]?.id).toBe(fixture.checkId);
      expect(report.checks[0]?.status).toBe('unknown');
      expect(report.checks[0]?.confidence).toBe('LOW');
      expect(report.checks[0]?.evidence).toEqual([]);
      expect(report.checks[0]?.rationale).toContain('Inconclusive result after 2 attempt(s):');
      expect(report.checks[0]?.rationale).toContain('Could not find complete JSON object in agent response.');
      expect(report.checks[0]?.rationale).toContain('Original agent result:');
      expect(report.checks[0]?.rationale).toContain('still not json');
    } finally {
      await session?.close();
      await mockServer.close();
      if (fixture) {
        await removeTempPaths(fixture.tempPaths);
      }
    }
  });
});

function buildCheckResultText(
  fixture: Phase1ScanFixture,
  options: {
    status: 'pass' | 'fail' | 'unknown';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    rationale: string;
    remediation: string[];
  }
): string {
  return JSON.stringify({
    id: fixture.checkId,
    version: '0.1.0',
    status: options.status,
    confidence: options.confidence,
    evidence: [`${fixture.changedFilePath}:1`],
    rationale: options.rationale,
    remediation: options.remediation
  }, null, 2);
}

function expectSingleRequest(mockServer: MockAiServer): MockAiRequest {
  expect(mockServer.requests).toHaveLength(1);
  return mockServer.requests[0]!;
}

function expectPhase1Prompt(request: MockAiRequest, fixture: Phase1ScanFixture): void {
  expect(request.method).toBe('POST');
  expect(request.path).toBe('/v1/responses');
  expect(request.body?.model).toBe('gpt-4o-mini');
  expect(request.promptText).toContain(`Check id: ${fixture.checkId}`);
  expect(request.promptText).toContain('Ensure the changed auth module still exports `validateAuthToken`');
  expect(request.promptText).toContain('Scoped file allowlist (1):');
  expect(request.promptText).toContain(`- ${fixture.changedFilePath}`);
  expect(request.promptText).toContain('Authoritative scope evidence:');
  expect(request.promptText).toContain('Tracked changes relative to HEAD');
  expect(request.promptText).toContain('+  const normalized = token.trim();');
  expect(request.promptText).toContain(fixture.checkDefinition);
}

function extractJsonReport(rawOutput: string): ScanReport {
  return extractJsonValue<ScanReport>(rawOutput);
}

function extractJsonValue<T>(rawOutput: string): T {
  const start = rawOutput.indexOf('{');
  const end = rawOutput.lastIndexOf('}');

  if (start < 0 || end < start) {
    throw new Error(`Could not locate a JSON report in terminal output:\n${rawOutput}`);
  }

  return JSON.parse(rawOutput.slice(start, end + 1)) as T;
}
