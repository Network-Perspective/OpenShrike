#!/usr/bin/env node

import {Command} from 'commander';
import {executeInitCommand} from './commands/init.js';
import {executeScanCommand} from './commands/scan.js';
import {normalizeCliError, renderCliErrorJson} from './lib/cli-error.js';
import {DEFAULT_OUTPUT, DEFAULT_SCAN_SCOPE} from './lib/constants.js';

const program = new Command();

program.name('shrike').description('OpenShrike TypeScript CLI');

program
  .command('scan')
  .description('Run a check or policy bundle against a repository.')
  .option('--check <CHECK_ID>', 'Check identifier, e.g. csharp-rel-001-cancellation-tokens')
  .option('--policy <POLICY_ID>', 'Policy identifier, e.g. csharp-baseline')
  .option('--repo <PATH>', 'Repository path to scan', '.')
  .option('--output <FORMAT>', 'Output format: json or markdown', DEFAULT_OUTPUT)
  .option('--agent <NAME>', 'Optional OpenCode agent name')
  .option('--model <MODEL>', 'Optional model name in provider/model form')
  .option('--emit-bundle <PATH>', 'Optional path to write assembled bundle instructions')
  .option(
    '--scan-scope <SCOPE>',
    'Scan scope: uncommitted, commit, branch, pr, full',
    DEFAULT_SCAN_SCOPE
  )
  .option('--scan-target <TARGET>', 'Scope target: commit/range for commit, base branch for branch, diff spec for pr')
  .option('--mock-opencode', 'Emulate OpenCode calls locally (2-5s/check, ~90% pass)', false)
  .option('--config <PATH>', 'Path to the OpenCode runtime config', undefined)
  .option('--log <PATH>', 'Write OpenCode/runtime debug logs as JSONL', undefined)
  .option('--no-ui', 'Disable the Ink live dashboard on stderr')
  .action(async (commandOptions: Record<string, unknown>) => {
    const exitCode = await executeScanCommand({
      checkId: asOptionalString(commandOptions.check),
      policyId: asOptionalString(commandOptions.policy),
      repoPath: asOptionalString(commandOptions.repo) ?? '.',
      outputFormat: asOptionalString(commandOptions.output) as 'json' | 'markdown',
      agent: asOptionalString(commandOptions.agent),
      model: asOptionalString(commandOptions.model),
      emitBundlePath: asOptionalString(commandOptions.emitBundle),
      scanScope: asOptionalString(commandOptions.scanScope) as
        | 'uncommitted'
        | 'commit'
        | 'branch'
        | 'pr'
        | 'full',
      scanTarget: asOptionalString(commandOptions.scanTarget),
      mockOpencode: Boolean(commandOptions.mockOpencode),
      configPath: asOptionalString(commandOptions.config),
      logPath: asOptionalString(commandOptions.log),
      ui: commandOptions.ui !== false
    });

    process.exitCode = exitCode;
  });

program
  .command('init')
  .description('Write OpenCode runtime config into the local .openshrike directory.')
  .option('--force', 'Overwrite generated files if they already exist', false)
  .action(async (commandOptions: Record<string, unknown>) => {
    process.exitCode = await executeInitCommand({
      force: Boolean(commandOptions.force)
    });
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const cliError = normalizeCliError(error);
  process.stdout.write(`${renderCliErrorJson(cliError)}\n`);
  process.exitCode = 1;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
