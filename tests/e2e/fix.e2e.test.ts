import fs from 'node:fs/promises';
import path from 'node:path';
import type {ScanReport} from '../../src/lib/types.js';
import {describe, expect, it} from 'vitest';
import {TerminalSession} from './support/terminal-session.js';
import {
  createPhase3FixFixture,
  removeTempPaths,
  type Phase3FixFixture
} from './support/test-env.js';

describe('fix terminal e2e', () => {
  it('fixes a failing saved report, rechecks it, and captures both outbound prompts', async () => {
    let fixture: Phase3FixFixture | null = null;
    let session: TerminalSession | null = null;

    try {
      fixture = await createPhase3FixFixture();

      session = TerminalSession.spawn({
        command: fixture.commandPath,
        args: ['fix', '--last-scan', '--output', 'json'],
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

      const report = extractJsonValue<ScanReport>(session.rawOutput());
      expect(report.bundle_id).toBe('project-checks');
      expect(report.summary.total_checks).toBe(1);
      expect(report.summary.passed).toBe(1);
      expect(report.summary.failed).toBe(0);
      expect(report.summary.unknown).toBe(0);
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0]).toMatchObject({
        id: fixture.checkId,
        status: 'pass',
        confidence: 'HIGH',
        evidence: [`${fixture.changedFilePath}:1`],
        rationale: 'The auth token is trimmed before checking length.'
      });

      await expect(fs.readFile(path.join(fixture.repoRoot, fixture.changedFilePath), 'utf8'))
        .resolves.toBe(fixture.fixedSource);

      const savedReport = extractJsonValue<{
        report: ScanReport;
      }>(
        await fs.readFile(path.join(fixture.repoRoot, '.openshrike', 'last-scan.json'), 'utf8')
      );
      expect(savedReport.report.summary.passed).toBe(1);
      expect(savedReport.report.summary.failed).toBe(0);
      expect(savedReport.report.checks[0]?.status).toBe('pass');

      const promptLog = await readJsonLines(fixture.fakeOpencodeLogPath);
      const promptEntries = promptLog.filter(
        (entry): entry is {
          type: 'session.prompt';
          title: string;
          promptText: string;
          model: {providerID: string; modelID: string};
        } => entry.type === 'session.prompt'
      );
      expect(promptEntries).toHaveLength(2);

      const [fixPrompt, recheckPrompt] = promptEntries;
      expect(fixPrompt?.title).toBe(`${fixture.checkId} fix`);
      expect(fixPrompt?.model).toEqual({
        providerID: 'openai',
        modelID: 'gpt-4o-mini'
      });
      expect(fixPrompt?.promptText).toContain('You are fixing one OpenShrike finding in repository path:');
      expect(fixPrompt?.promptText).toContain(`Check id: ${fixture.checkId}`);
      expect(fixPrompt?.promptText).toContain(fixture.checkDefinition);
      expect(fixPrompt?.promptText).toContain('Latest failed result:');
      expect(fixPrompt?.promptText).toContain('"status": "fail"');
      expect(fixPrompt?.promptText).toContain('Trim the token before testing its length.');
      expect(fixPrompt?.promptText).toContain('Make the smallest repository change needed to satisfy this one check.');

      expect(recheckPrompt?.title).toBe(fixture.checkId);
      expect(recheckPrompt?.model).toEqual({
        providerID: 'openai',
        modelID: 'gpt-4o-mini'
      });
      expect(recheckPrompt?.promptText).toContain(`Check id: ${fixture.checkId}`);
      expect(recheckPrompt?.promptText).toContain(fixture.checkDefinition);
      expect(recheckPrompt?.promptText).toContain('Scoped file allowlist (1):');
      expect(recheckPrompt?.promptText).toContain(`- ${fixture.changedFilePath}`);
    } finally {
      await session?.close();
      if (fixture) {
        await removeTempPaths(fixture.tempPaths);
      }
    }
  });
});

async function readJsonLines(filePath: string): Promise<Array<Record<string, unknown>>> {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>);
}

function extractJsonValue<T>(rawOutput: string): T {
  const start = rawOutput.indexOf('{');
  const end = rawOutput.lastIndexOf('}');

  if (start < 0 || end < start) {
    throw new Error(`Could not locate a JSON value in terminal output:\n${rawOutput}`);
  }

  return JSON.parse(rawOutput.slice(start, end + 1)) as T;
}
