import {readCheckDefinition} from './checks.js';
import {
  OPENCODE_FIX_POLL_TIMEOUT_MS,
  OPENCODE_FIX_REQUEST_TIMEOUT_MS
} from './constants.js';
import {type OpenCodeRuntime} from './runtime.js';
import type {CheckResult, SavedScanRequest, ScanScopeContext} from './types.js';

export async function runFixForCheck(options: {
  check: CheckResult;
  request: SavedScanRequest;
  repoPath: string;
  projectChecksDir?: string | undefined;
  agent: string;
  model: string;
  runtime: OpenCodeRuntime | null;
  emulateOpencode: boolean;
  scopeContext: ScanScopeContext;
}): Promise<void> {
  if (options.emulateOpencode) {
    return;
  }

  if (!options.runtime) {
    throw new Error('OpenCode runtime is not available.');
  }

  const definition = await readCheckDefinition(options.check.id, {
    checksDirectory: options.projectChecksDir
  });
  const prompt = buildFixPrompt({
    check: options.check,
    checkDefinition: definition,
    repoPath: options.repoPath,
    request: options.request,
    scopeContext: options.scopeContext
  });

  await options.runtime.runPrompt({
    prompt,
    agent: options.agent,
    model: options.model,
    title: `${options.check.id} fix`,
    checkId: options.check.id,
    allowEmptyText: true,
    requestTimeoutMs: OPENCODE_FIX_REQUEST_TIMEOUT_MS,
    completionTimeoutMs: OPENCODE_FIX_POLL_TIMEOUT_MS
  });
}

export function buildFixPrompt(options: {
  check: CheckResult;
  checkDefinition: string;
  repoPath: string;
  request: SavedScanRequest;
  scopeContext: ScanScopeContext;
}): string {
  return [
    `You are fixing one OpenShrike finding in repository path: ${options.repoPath}`,
    '',
    `Check id: ${options.check.id}`,
    `Saved scan scope: ${options.request.scanScope}${options.request.scanTarget ? ` (${options.request.scanTarget})` : ''}`,
    options.scopeContext.isFullRepository
      ? 'Review scope for recheck: full repository.'
      : `Review scope for recheck: ${options.scopeContext.label}.`,
    '',
    'Best-practice check definition markdown:',
    '---',
    options.checkDefinition,
    '---',
    '',
    'Latest failed result:',
    '```json',
    JSON.stringify(options.check, null, 2),
    '```',
    '',
    'Instructions:',
    '- Make the smallest repository change needed to satisfy this one check.',
    '- Do not opportunistically fix unrelated findings.',
    '- After making the change, stop. Do not print diffs, markdown, or a report.',
    '- A follow-up recheck will be run separately by OpenShrike.'
  ].join('\n');
}
