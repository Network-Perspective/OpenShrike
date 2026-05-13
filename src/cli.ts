#!/usr/bin/env node

import {Command, CommanderError} from 'commander';
import {executeFixCommand} from './commands/fix.js';
import {executeInitCommand} from './commands/init.js';
import {executeInternalScanWorkerCommand} from './commands/scan-worker.js';
import {executeScanCommand} from './commands/scan.js';
import {
  normalizeCliError,
  renderCliError,
  resolveCliOutputFormatFromArgv
} from './lib/cli-error.js';
import type {ScanCommandOptions} from './lib/types.js';

const program = new Command();

program
  .name('shrike')
  .description('OpenShrike TypeScript CLI')
  .exitOverride()
  .configureOutput({
    writeOut: str => {
      process.stdout.write(str);
    },
    writeErr: () => {},
    outputError: () => {}
  });

program
  .command('scan')
  .description('Run a check or policy bundle against a repository.')
  .option('--check <CHECK_ID>', 'Check identifier, e.g. csharp-rel-001-cancellation-tokens')
  .option('--policy <POLICY_ID>', 'Policy identifier, e.g. csharp-baseline')
  .option('--repo <PATH>', 'Repository path to scan')
  .option('--output <FORMAT>', 'Output format: markdown or json')
  .option('--agent <NAME>', 'Optional OpenCode agent name')
  .option('--model <MODEL>', 'Optional model name in provider/model form')
  .option('--emit-bundle <PATH>', 'Optional path to write assembled bundle instructions')
  .option(
    '--scan-scope <SCOPE>',
    'Scan scope: uncommitted, commit, branch, pr, full'
  )
  .option('--scan-target <TARGET>', 'Scope target: commit/range for commit, base branch for branch, diff spec for pr')
  .option('--mock-opencode', 'Emulate OpenCode calls locally (2-5s/check, ~90% pass)', false)
  .option('--config <PATH>', 'Path to the OpenCode runtime config', undefined)
  .option('--log <PATH>', 'Write OpenCode/runtime debug logs as JSONL', undefined)
  .option('--runtime <MODE>', 'Runtime mode: native or docker')
  .option('--image <REF>', 'Docker image to use when --runtime docker is selected')
  .option('--artifacts-dir <PATH>', 'Directory for runtime artifacts such as report.json and logs')
  .option('--parallelism <N_OR_AUTO>', 'Run checks concurrently. Accepts an integer or auto.')
  .option('--last-scan', 'Load the saved .openshrike/last-scan.json report instead of rescanning', false)
  .option('--no-ui', 'Disable the Ink live dashboard on stderr')
  .action(async (commandOptions: Record<string, unknown>) => {
    const rawOptions: Partial<ScanCommandOptions> = {
      mockOpencode: Boolean(commandOptions.mockOpencode),
      lastScan: Boolean(commandOptions.lastScan)
    };

    assignIfDefined(rawOptions, 'checkId', asOptionalString(commandOptions.check));
    assignIfDefined(rawOptions, 'policyId', asOptionalString(commandOptions.policy));
    assignIfDefined(rawOptions, 'repoPath', asOptionalString(commandOptions.repo));
    assignIfDefined(rawOptions, 'outputFormat', asOptionalString(commandOptions.output) as 'json' | 'markdown' | undefined);
    assignIfDefined(rawOptions, 'agent', asOptionalString(commandOptions.agent));
    assignIfDefined(rawOptions, 'model', asOptionalString(commandOptions.model));
    assignIfDefined(rawOptions, 'emitBundlePath', asOptionalString(commandOptions.emitBundle));
    assignIfDefined(rawOptions, 'scanScope', asOptionalString(commandOptions.scanScope) as
      | 'uncommitted'
      | 'commit'
      | 'branch'
      | 'pr'
      | 'full'
      | undefined);
    assignIfDefined(rawOptions, 'scanTarget', asOptionalString(commandOptions.scanTarget));
    assignIfDefined(rawOptions, 'configPath', asOptionalString(commandOptions.config));
    assignIfDefined(rawOptions, 'logPath', asOptionalString(commandOptions.log));
    assignIfDefined(rawOptions, 'runtimeMode', asOptionalString(commandOptions.runtime) as 'native' | 'docker' | undefined);
    assignIfDefined(rawOptions, 'image', asOptionalString(commandOptions.image));
    assignIfDefined(rawOptions, 'artifactsDir', asOptionalString(commandOptions.artifactsDir));
    assignIfDefined(rawOptions, 'parallelism', parseParallelism(commandOptions.parallelism));

    if (process.argv.includes('--no-ui')) {
      rawOptions.ui = false;
    }

    const exitCode = await executeScanCommand(rawOptions);

    process.exitCode = exitCode;
  });

program
  .command('fix')
  .description('Fix failing checks one by one and recheck them.')
  .option('--check <CHECK_ID>', 'Check identifier, e.g. csharp-rel-001-cancellation-tokens')
  .option('--policy <POLICY_ID>', 'Policy identifier, e.g. csharp-baseline')
  .option('--repo <PATH>', 'Repository path to scan')
  .option('--output <FORMAT>', 'Output format: markdown or json')
  .option('--fix-agent <NAME>', 'Optional OpenCode fix agent name')
  .option('--fix-model <MODEL>', 'Optional fix model name in provider/model form')
  .option(
    '--scan-scope <SCOPE>',
    'Scan scope: uncommitted, commit, branch, pr, full'
  )
  .option('--scan-target <TARGET>', 'Scope target: commit/range for commit, base branch for branch, diff spec for pr')
  .option('--mock-opencode', 'Emulate OpenCode calls locally (2-5s/check, ~90% pass)', false)
  .option('--config <PATH>', 'Path to the OpenCode runtime config', undefined)
  .option('--log <PATH>', 'Write OpenCode/runtime debug logs as JSONL', undefined)
  .option('--runtime <MODE>', 'Runtime mode: native or docker')
  .option('--image <REF>', 'Docker image to use when --runtime docker is selected')
  .option('--artifacts-dir <PATH>', 'Directory for runtime artifacts such as report.json and logs')
  .option('--parallelism <N_OR_AUTO>', 'Run checks concurrently. Accepts an integer or auto.')
  .option('--last-scan', 'Load the saved .openshrike/last-scan.json report instead of rescanning', false)
  .action(async (commandOptions: Record<string, unknown>) => {
    const rawOptions: Partial<ScanCommandOptions> = {
      mockOpencode: Boolean(commandOptions.mockOpencode),
      lastScan: Boolean(commandOptions.lastScan),
      ui: false
    };

    assignIfDefined(rawOptions, 'checkId', asOptionalString(commandOptions.check));
    assignIfDefined(rawOptions, 'policyId', asOptionalString(commandOptions.policy));
    assignIfDefined(rawOptions, 'repoPath', asOptionalString(commandOptions.repo));
    assignIfDefined(rawOptions, 'outputFormat', asOptionalString(commandOptions.output) as 'json' | 'markdown' | undefined);
    assignIfDefined(rawOptions, 'fixAgent', asOptionalString(commandOptions.fixAgent));
    assignIfDefined(rawOptions, 'fixModel', asOptionalString(commandOptions.fixModel));
    assignIfDefined(rawOptions, 'scanScope', asOptionalString(commandOptions.scanScope) as
      | 'uncommitted'
      | 'commit'
      | 'branch'
      | 'pr'
      | 'full'
      | undefined);
    assignIfDefined(rawOptions, 'scanTarget', asOptionalString(commandOptions.scanTarget));
    assignIfDefined(rawOptions, 'configPath', asOptionalString(commandOptions.config));
    assignIfDefined(rawOptions, 'logPath', asOptionalString(commandOptions.log));
    assignIfDefined(rawOptions, 'runtimeMode', asOptionalString(commandOptions.runtime) as 'native' | 'docker' | undefined);
    assignIfDefined(rawOptions, 'image', asOptionalString(commandOptions.image));
    assignIfDefined(rawOptions, 'artifactsDir', asOptionalString(commandOptions.artifactsDir));
    assignIfDefined(rawOptions, 'parallelism', parseParallelism(commandOptions.parallelism));

    process.exitCode = await executeFixCommand(rawOptions);
  });

program
  .command('init')
  .description('Interactively initialize Shrike defaults in the local .openshrike directory.')
  .option('--force', 'Overwrite generated files if they already exist', false)
  .action(async (commandOptions: Record<string, unknown>) => {
    process.exitCode = await executeInitCommand({
      force: Boolean(commandOptions.force)
    });
  });

const internal = program.command('internal').description('Internal OpenShrike commands');

internal
  .command('scan-worker')
  .description('Internal scan worker entry point.')
  .requiredOption('--request <PATH>', 'Path to the worker request JSON')
  .action(async (commandOptions: Record<string, unknown>) => {
    process.exitCode = await executeInternalScanWorkerCommand({
      requestPath: asOptionalString(commandOptions.request) ?? ''
    });
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError && error.code === 'commander.helpDisplayed') {
    process.exitCode = 0;
  } else {
    const cliError = normalizeCliError(error);
    const outputFormat = await resolveCliOutputFormatFromArgv(process.argv);
    process.stdout.write(`${renderCliError(cliError, outputFormat)}\n`);
    process.exitCode = error instanceof CommanderError ? error.exitCode : 1;
  }
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseParallelism(value: unknown): number | 'auto' | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  if (value.trim().toLowerCase() === 'auto') {
    return 'auto';
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function assignIfDefined<K extends keyof ScanCommandOptions>(
  target: Partial<ScanCommandOptions>,
  key: K,
  value: ScanCommandOptions[K] | undefined
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
