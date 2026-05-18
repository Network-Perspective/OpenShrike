import fs from 'node:fs/promises';
import path from 'node:path';
import type {ScanReport} from '../../src/lib/types.js';
import {describe, expect, it} from 'vitest';
import {MockAiServer, type MockAiRequest} from './support/mock-ai-server.js';
import {TerminalSession} from './support/terminal-session.js';
import {
  createPhase1ScanFixture,
  removeTempPaths,
  runFixtureGit,
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
      const request = expectSingleRequest(mockServer);
      expectPhase1Prompt(request, fixture);
      await expectGoldenText(
        normalizePromptText(request.promptText, fixture.repoRoot),
        'scan-single.prompt.txt'
      );

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

  it('cancels a running TUI scan without printing the final markdown report', async () => {
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
      }), {
        delayMs: 5_000
      });

      session = TerminalSession.spawn({
        command: fixture.commandPath,
        args: ['scan'],
        cwd: fixture.repoRoot,
        env: fixture.env,
        cols: 120,
        rows: 40
      });

      await session.waitForText(`Running ${fixture.checkId}`, {
        source: 'screen',
        timeoutMs: 60_000
      });

      session.press('escape');

      await session.waitForText('Exit Running Scan?', {
        source: 'screen',
        timeoutMs: 10_000
      });

      const confirmationScreen = await session.screen();
      expect(confirmationScreen).toContain('Exit Running Scan?');
      expect(confirmationScreen).toContain('Are you sure you want to exit and abandon the current scan?');

      session.send('y');

      const exit = await session.waitForExit(30_000);
      expect(exit.exitCode).toBe(130);
      expect(mockServer.requests.length).toBeLessThanOrEqual(1);
      expect(session.rawOutput()).not.toContain('# OpenShrike Scan Report');
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

  it('fails fast with a json error when the provider environment is missing', async () => {
    const mockServer = await MockAiServer.start();
    let fixture: Phase1ScanFixture | null = null;
    let session: TerminalSession | null = null;

    try {
      fixture = await createPhase1ScanFixture({
        mockProviderBaseUrl: `${mockServer.baseUrl}/v1`
      });
      const {OPENAI_API_KEY: _missingEnvVar, ...envWithoutProviderKey} = fixture.env;

      session = TerminalSession.spawn({
        command: fixture.commandPath,
        args: ['scan', '--no-ui', '--output', 'json'],
        cwd: fixture.repoRoot,
        env: envWithoutProviderKey,
        cols: 120,
        rows: 40
      });

      await session.waitForText('"error"', {
        source: 'raw',
        timeoutMs: 30_000
      });

      const exit = await session.waitForExit(30_000);
      expect(exit.exitCode).toBe(1);
      expect(mockServer.requests).toHaveLength(0);

      const error = extractJsonValue<{
        error: {
          code: string;
          message: string;
          details: {
            configPath: string;
            model: string;
            missingEnvVars: string[];
            actions: string[];
          };
        };
      }>(session.rawOutput());
      expect(error.error.code).toBe('MISSING_ENVIRONMENT');
      expect(error.error.message).toBe('OpenCode provider setup is incomplete, so checks could not start.');
      expect(error.error.details.configPath).toBe(path.join(fixture.repoRoot, '.openshrike', 'opencode.json'));
      expect(error.error.details.model).toBe('openai/gpt-4o-mini');
      expect(error.error.details.missingEnvVars).toEqual(['OPENAI_API_KEY']);
      expect(error.error.details.actions).toEqual(expect.arrayContaining([
        expect.stringContaining('OpenShrike uses OpenCode as its agent execution layer'),
        expect.stringContaining('OPENAI_API_KEY'),
        expect.stringContaining('https://opencode.ai/docs/providers/')
      ]));
    } finally {
      await session?.close();
      await mockServer.close();
      if (fixture) {
        await removeTempPaths(fixture.tempPaths);
      }
    }
  });

  it('fails fast when uncommitted scope has no changes', async () => {
    const mockServer = await MockAiServer.start();
    let fixture: Phase1ScanFixture | null = null;
    let session: TerminalSession | null = null;

    try {
      fixture = await createPhase1ScanFixture({
        mockProviderBaseUrl: `${mockServer.baseUrl}/v1`
      });
      runFixtureGit(fixture.repoRoot, ['add', '.']);
      runFixtureGit(fixture.repoRoot, ['commit', '-m', 'clean fixture working tree']);

      session = TerminalSession.spawn({
        command: fixture.commandPath,
        args: ['scan', '--no-ui', '--output', 'json'],
        cwd: fixture.repoRoot,
        env: fixture.env,
        cols: 120,
        rows: 40
      });

      await session.waitForText('"error"', {
        source: 'raw',
        timeoutMs: 30_000
      });

      const exit = await session.waitForExit(30_000);
      expect(exit.exitCode).toBe(1);
      expect(mockServer.requests).toHaveLength(0);

      const error = extractJsonValue<{
        error: {
          code: string;
          message: string;
          details: null;
        };
      }>(session.rawOutput());
      expect(error.error.code).toBe('NO_CHANGES_IN_SCOPE');
      expect(error.error.message).toBe('There are no uncommitted changes in the current folder.');
      expect(error.error.details).toBeNull();
    } finally {
      await session?.close();
      await mockServer.close();
      if (fixture) {
        await removeTempPaths(fixture.tempPaths);
      }
    }
  });

  it('returns an all-unknown report when a non-full branch scope resolves to no files', async () => {
    const mockServer = await MockAiServer.start();
    let fixture: Phase1ScanFixture | null = null;
    let session: TerminalSession | null = null;

    try {
      fixture = await createPhase1ScanFixture({
        mockProviderBaseUrl: `${mockServer.baseUrl}/v1`
      });
      runFixtureGit(fixture.repoRoot, ['add', '.']);
      runFixtureGit(fixture.repoRoot, ['commit', '-m', 'clean fixture working tree']);
      runFixtureGit(fixture.repoRoot, ['branch', 'baseline']);

      session = TerminalSession.spawn({
        command: fixture.commandPath,
        args: [
          'scan',
          '--no-ui',
          '--output',
          'json',
          '--scan-scope',
          'branch',
          '--scan-target',
          'baseline'
        ],
        cwd: fixture.repoRoot,
        env: fixture.env,
        cols: 120,
        rows: 40
      });

      await session.waitForText('"bundle_id"', {
        source: 'raw',
        timeoutMs: 30_000
      });

      const exit = await session.waitForExit(30_000);
      expect(exit.exitCode).toBe(0);
      expect(mockServer.requests).toHaveLength(0);

      const report = extractJsonReport(session.rawOutput());
      expect(report.summary).toEqual({
        total_checks: 1,
        passed: 0,
        failed: 0,
        unknown: 1
      });
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0]).toMatchObject({
        id: fixture.checkId,
        status: 'unknown',
        confidence: 'LOW',
        evidence: [],
        rationale: 'No files matched the selected scan scope.',
        remediation: [
          'Choose a scope that includes changed files.',
          "Use '--scope full' to evaluate the full repository."
        ]
      });
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

  it('offers clean-repo fallback targets and scans the last commit when selected', async () => {
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
        rationale: 'The last commit still exports validateAuthToken and returns a boolean.',
        remediation: ['No action required.']
      }));

      runFixtureGit(fixture.repoRoot, ['add', fixture.changedFilePath]);
      runFixtureGit(fixture.repoRoot, ['commit', '-m', 'record clean change']);

      session = TerminalSession.spawn({
        command: fixture.commandPath,
        args: ['scan'],
        cwd: fixture.repoRoot,
        env: fixture.env,
        cols: 120,
        rows: 40
      });

      await session.waitForText('No Uncommitted Changes', {
        source: 'screen',
        timeoutMs: 30_000
      });
      await session.waitForText('1. Scan last commit', {
        source: 'screen',
        timeoutMs: 5_000
      });

      session.press('enter');

      await session.waitForText('Scan complete', {
        source: 'screen',
        timeoutMs: 60_000
      });
      await session.waitForIdleFrame({
        idleMs: 300,
        timeoutMs: 10_000
      });

      session.press('escape');

      await session.waitForText('# OpenShrike Scan Report', {
        source: 'raw',
        timeoutMs: 30_000
      });

      const exit = await session.waitForExit(30_000);
      expect(exit.exitCode).toBe(0);
      expect(mockServer.requests).toHaveLength(1);
      expect(mockServer.requests[0]?.promptText).toContain('Commit diff for HEAD');
      expect(mockServer.requests[0]?.promptText).toContain(`- ${fixture.changedFilePath}`);
      expect(mockServer.requests[0]?.promptText).toContain('+  const normalized = token.trim();');

      const rawOutput = session.rawOutput();
      expect(rawOutput).toContain('# OpenShrike Scan Report');
      expect(rawOutput).toContain(`### \`${fixture.checkId}\``);
      expect(rawOutput).toContain('- Status: `pass`');
      expect(rawOutput).toContain('- Confidence: `HIGH`');
    } finally {
      await session?.close();
      await mockServer.close();
      if (fixture) {
        await removeTempPaths(fixture.tempPaths);
      }
    }
  });

  it('runs multiple project checks with parallelism 2, captures prompts, and writes worker logs', async () => {
    const mockServer = await MockAiServer.start();
    let fixture: Phase1ScanFixture | null = null;
    let session: TerminalSession | null = null;

    try {
      fixture = await createPhase1ScanFixture({
        mockProviderBaseUrl: `${mockServer.baseUrl}/v1`
      });

      for (const check of PARALLEL_CHECK_FIXTURES) {
        await writeProjectCheck(fixture.repoRoot, check.id, check.definition);
      }
      runFixtureGit(fixture.repoRoot, [
        'add',
        ...PARALLEL_CHECK_FIXTURES.map(check => `.openshrike/checks/${check.id}.md`)
      ]);
      runFixtureGit(fixture.repoRoot, ['commit', '-m', 'add extra project checks']);

      for (const check of [
        {
          id: fixture.checkId,
          status: 'pass' as const,
          confidence: 'HIGH' as const,
          evidence: [`${fixture.changedFilePath}:1`],
          rationale: 'The changed auth module still exports validateAuthToken and returns a boolean.',
          remediation: ['No action required.'],
          delayMs: 300
        },
        ...PARALLEL_CHECK_FIXTURES
      ]) {
        mockServer.enqueueMatchedTextResponse(
          `Check id: ${check.id}`,
          buildCheckResultTextForCheck({
            checkId: check.id,
            status: check.status,
            confidence: check.confidence,
            evidence: check.evidence,
            rationale: check.rationale,
            remediation: check.remediation
          }),
          {
            delayMs: check.delayMs
          }
        );
      }

      const logPath = path.join(fixture.homeRoot, 'phase5-scan.jsonl');
      session = TerminalSession.spawn({
        command: fixture.commandPath,
        args: [
          'scan',
          '--no-ui',
          '--output',
          'json',
          '--parallelism',
          '2',
          '--log',
          logPath
        ],
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
      expect(mockServer.requests).toHaveLength(3);

      const report = extractJsonReport(session.rawOutput());
      expect(report.execution.requested_parallelism).toBe(2);
      expect(report.execution.effective_parallelism).toBe(2);
      expect(report.summary).toEqual({
        total_checks: 3,
        passed: 2,
        failed: 1,
        unknown: 0
      });
      expect(report.checks.map(check => check.id)).toEqual([
        'e2e-scan-002',
        fixture.checkId,
        'e2e-scan-003'
      ]);
      expect(report.checks.map(check => check.status)).toEqual([
        'fail',
        'pass',
        'pass'
      ]);

      const requestsByCheckId = new Map(
        mockServer.requests.map(request => [extractPromptCheckId(request), request] as const)
      );
      expect([...requestsByCheckId.keys()].sort()).toEqual([
        fixture.checkId,
        'e2e-scan-002',
        'e2e-scan-003'
      ]);
      expect(requestsByCheckId.get(fixture.checkId)?.promptText).toContain(fixture.checkDefinition);
      expect(requestsByCheckId.get('e2e-scan-002')?.promptText).toContain(
        PARALLEL_CHECK_FIXTURES[0]!.definition
      );
      expect(requestsByCheckId.get('e2e-scan-003')?.promptText).toContain(
        PARALLEL_CHECK_FIXTURES[1]!.definition
      );
      expect(requestsByCheckId.get(fixture.checkId)?.promptText).toContain('Scoped file allowlist (1):');

      const logEntries = await readJsonLines(logPath);
      const checkStartedEvents = logEntries.filter(
        (entry): entry is {
          kind: 'scan.progress';
          data: {
            type: string;
            workerId: string | null;
          };
        } => entry.kind === 'scan.progress' && typeof entry.data === 'object' && entry.data !== null
      ).filter(entry => entry.data.type === 'check-started');
      expect(new Set(checkStartedEvents.map(entry => entry.data.workerId).filter(Boolean))).toEqual(
        new Set(['worker-1', 'worker-2'])
      );
      expect(logEntries.some(entry => entry.kind === 'scan.completed')).toBe(true);

      await expectGoldenText(
        renderPromptGoldenSet(mockServer.requests, fixture.repoRoot),
        'scan-parallel.prompts.txt'
      );
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
  return buildCheckResultTextForCheck({
    checkId: fixture.checkId,
    status: options.status,
    confidence: options.confidence,
    evidence: [`${fixture.changedFilePath}:1`],
    rationale: options.rationale,
    remediation: options.remediation
  });
}

function buildCheckResultTextForCheck(options: {
  checkId: string;
  status: 'pass' | 'fail' | 'unknown';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: string[];
  rationale: string;
  remediation: string[];
}): string {
  return JSON.stringify({
    id: options.checkId,
    version: '0.1.0',
    status: options.status,
    confidence: options.confidence,
    evidence: options.evidence,
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
    throw new Error(`Could not locate a JSON value in terminal output:\n${rawOutput}`);
  }

  return JSON.parse(rawOutput.slice(start, end + 1)) as T;
}

async function writeProjectCheck(repoRoot: string, checkId: string, definition: string): Promise<void> {
  await fs.writeFile(
    path.join(repoRoot, '.openshrike', 'checks', `${checkId}.md`),
    `${definition}\n`,
    'utf8'
  );
}

function extractPromptCheckId(request: MockAiRequest): string {
  const match = request.promptText.match(/^Check id: (?<checkId>.+)$/mu);
  if (!match?.groups?.checkId) {
    throw new Error(`Could not extract check id from prompt:\n${request.promptText}`);
  }

  return match.groups.checkId;
}

function normalizePromptText(promptText: string, repoRoot: string): string {
  return promptText
    .replaceAll(repoRoot, '<repo>')
    .replace(/\r\n/gu, '\n')
    .trim();
}

function renderPromptGoldenSet(requests: readonly MockAiRequest[], repoRoot: string): string {
  return requests
    .map(request => ({
      checkId: extractPromptCheckId(request),
      promptText: normalizePromptText(request.promptText, repoRoot)
    }))
    .sort((left, right) => left.checkId.localeCompare(right.checkId))
    .map(entry => `=== ${entry.checkId} ===\n${entry.promptText}`)
    .join('\n\n');
}

async function expectGoldenText(actual: string, fileName: string): Promise<void> {
  const expected = await fs.readFile(new URL(`./goldens/${fileName}`, import.meta.url), 'utf8');
  expect(`${actual}\n`).toBe(expected);
}

async function readJsonLines(filePath: string): Promise<Array<{kind: string; data: unknown}>> {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as {kind: string; data: unknown});
}

const PARALLEL_CHECK_FIXTURES = [
  {
    id: 'e2e-scan-002',
    definition: [
      '# E2E-SCAN-002: Require trimming',
      '',
      'Ensure the changed auth module trims the token before checking length.'
    ].join('\n'),
    status: 'fail' as const,
    confidence: 'MEDIUM' as const,
    evidence: ['src/auth.ts:2'],
    rationale: 'The auth token validation still needs a trim before length is checked.',
    remediation: ['Trim the token before checking its length.'],
    delayMs: 50
  },
  {
    id: 'e2e-scan-003',
    definition: [
      '# E2E-SCAN-003: Boolean return',
      '',
      'Ensure the changed auth module still returns a boolean result.'
    ].join('\n'),
    status: 'pass' as const,
    confidence: 'HIGH' as const,
    evidence: ['src/auth.ts:3'],
    rationale: 'The changed auth module still returns a boolean result.',
    remediation: ['No action required.'],
    delayMs: 150
  }
] as const;
