#!/usr/bin/env node

import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Command, CommanderError, Option} from 'commander';
import {executeFixCommand} from './commands/fix.js';
import {executeInternalFixWorkerCommand} from './commands/fix-worker.js';
import {executeInitCommand} from './commands/init.js';
import {executeInternalScanWorkerCommand} from './commands/scan-worker.js';
import {executeScanCommand} from './commands/scan.js';
import {
  normalizeCliError,
  renderCliError,
  resolveCliOutputFormatFromArgv
} from './lib/cli-error.js';
import {discoverDefaultPullRequestTargetSync} from './lib/scope.js';
import type {ScanCommandOptions} from './lib/types.js';

interface HelpOptionRow {
  term: string;
  description: string;
}

interface CommandHelpSpec {
  usage: string;
  description: string;
  groups: HelpOptionRow[][];
}

export async function runCli(argv: string[] = process.argv): Promise<number> {
  const program = createProgram(argv);
  process.exitCode = 0;

  if (argv.length <= 2) {
    program.outputHelp();
    return 0;
  }

  try {
    await program.parseAsync(argv);
    return process.exitCode ?? 0;
  } catch (error) {
    if (error instanceof CommanderError && error.code === 'commander.helpDisplayed') {
      return 0;
    }

    const cliError = normalizeCliError(error);
    const outputFormat = await resolveCliOutputFormatFromArgv(argv);
    process.stdout.write(`${renderCliError(cliError, outputFormat)}\n`);
    return error instanceof CommanderError ? error.exitCode : 1;
  }
}

function createProgram(argv: string[]): Command {
  const program = new Command();
  const defaultTarget = resolveHelpDefaultTarget(argv);

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

  const scanCommand = program
    .command('scan')
    .description('Run a check or policy bundle against a repository.')
    .configureHelp({
      formatHelp: () => renderCommandHelp(buildScanHelpSpec(defaultTarget))
    })
    .addOption(new Option('--path <PATH>', 'Repository path to scan'))
    .addOption(new Option('--repo <PATH>').hideHelp())
    .addOption(new Option('--scope <SCOPE>', 'Scan scope: uncommitted, commit, branch, pr, full'))
    .addOption(new Option('--scan-scope <SCOPE>').hideHelp())
    .addOption(new Option('--target <TARGET>', 'Scope target'))
    .addOption(new Option('--scan-target <TARGET>').hideHelp())
    .addOption(new Option('--runtime <MODE>', 'Runtime mode: native or docker'))
    .addOption(new Option('-p, --parallelism <N_OR_AUTO_OR_FULL>', 'Run checks concurrently'))
    .addOption(new Option('-l, --last-scan', 'Load the saved .openshrike/last-scan.json report instead of rescanning'))
    .addOption(new Option('--no-ui', 'Disable the live dashboard'))
    .addOption(new Option('--check <CHECK_ID>', 'Check identifier, e.g. csharp-rel-001-cancellation-tokens'))
    .addOption(new Option('--policy <POLICY_ID>', 'Policy identifier, e.g. csharp-baseline'))
    .addOption(new Option('--output <FORMAT>', 'Output format: markdown or json'))
    .addOption(new Option('--agent <NAME>', 'Optional OpenCode agent name'))
    .addOption(new Option('--model <MODEL>', 'Optional model name in provider/model form'))
    .addOption(new Option('--mock-run', 'Emulate OpenCode calls locally (2-5s/check, ~90% pass)'))
    .addOption(new Option('--mock-opencode').hideHelp())
    .addOption(new Option('--config <PATH>', 'Path to the OpenCode runtime config'))
    .addOption(new Option('--log <PATH>', 'Write OpenCode/runtime debug logs as JSONL'))
    .addOption(new Option('--image <REF>', 'Docker image to use when --runtime docker is selected'))
    .addOption(new Option('--artifacts-dir <PATH>', 'Directory for runtime artifacts such as report.json and logs'))
    .addOption(new Option('--emit-bundle <PATH>', 'Optional path to write assembled bundle instructions').hideHelp())
    .action(async (commandOptions: Record<string, unknown>) => {
      const rawOptions: Partial<ScanCommandOptions> = {
        mockOpencode: resolveBooleanOption(commandOptions.mockRun, commandOptions.mockOpencode),
        lastScan: Boolean(commandOptions.lastScan)
      };

      assignIfDefined(rawOptions, 'checkId', asOptionalString(commandOptions.check));
      assignIfDefined(rawOptions, 'policyId', asOptionalString(commandOptions.policy));
      assignIfDefined(rawOptions, 'repoPath', firstOptionalString(commandOptions.path, commandOptions.repo));
      assignIfDefined(rawOptions, 'outputFormat', asOptionalString(commandOptions.output) as 'json' | 'markdown' | undefined);
      assignIfDefined(rawOptions, 'agent', asOptionalString(commandOptions.agent));
      assignIfDefined(rawOptions, 'model', asOptionalString(commandOptions.model));
      assignIfDefined(rawOptions, 'emitBundlePath', asOptionalString(commandOptions.emitBundle));
      assignIfDefined(rawOptions, 'scanScope', firstOptionalString(commandOptions.scope, commandOptions.scanScope) as
        | 'uncommitted'
        | 'commit'
        | 'branch'
        | 'pr'
        | 'full'
        | undefined);
      assignIfDefined(rawOptions, 'scanTarget', firstOptionalString(commandOptions.target, commandOptions.scanTarget));
      assignIfDefined(rawOptions, 'configPath', asOptionalString(commandOptions.config));
      assignIfDefined(rawOptions, 'logPath', asOptionalString(commandOptions.log));
      assignIfDefined(rawOptions, 'runtimeMode', asOptionalString(commandOptions.runtime) as 'native' | 'docker' | undefined);
      assignIfDefined(rawOptions, 'image', asOptionalString(commandOptions.image));
      assignIfDefined(rawOptions, 'artifactsDir', asOptionalString(commandOptions.artifactsDir));
      assignIfDefined(rawOptions, 'parallelism', parseParallelism(commandOptions.parallelism));

      if (commandOptions.ui === false) {
        rawOptions.ui = false;
      }

      process.exitCode = await executeScanCommand(rawOptions, {
        promptForFullScanWhenScopeEmpty: isBareScanInvocation(argv)
      });
    });

  const fixCommand = program
    .command('fix')
    .description('Fix failing checks one by one and recheck them.')
    .configureHelp({
      formatHelp: () => renderCommandHelp(buildFixHelpSpec(defaultTarget))
    })
    .addOption(new Option('--path <PATH>', 'Repository path to scan'))
    .addOption(new Option('--repo <PATH>').hideHelp())
    .addOption(new Option('--scope <SCOPE>', 'Scan scope: uncommitted, commit, branch, pr, full'))
    .addOption(new Option('--scan-scope <SCOPE>').hideHelp())
    .addOption(new Option('--target <TARGET>', 'Scope target'))
    .addOption(new Option('--scan-target <TARGET>').hideHelp())
    .addOption(new Option('--runtime <MODE>', 'Runtime mode: native or docker'))
    .addOption(new Option('-p, --parallelism <N_OR_AUTO_OR_FULL>', 'Run checks concurrently'))
    .addOption(new Option('-l, --last-scan', 'Load the saved .openshrike/last-scan.json report instead of rescanning'))
    .addOption(new Option('--check <CHECK_ID>', 'Check identifier, e.g. csharp-rel-001-cancellation-tokens'))
    .addOption(new Option('--policy <POLICY_ID>', 'Policy identifier, e.g. csharp-baseline'))
    .addOption(new Option('--output <FORMAT>', 'Output format: markdown or json'))
    .addOption(new Option('--agent <NAME>', 'Optional OpenCode fix agent name'))
    .addOption(new Option('--fix-agent <NAME>').hideHelp())
    .addOption(new Option('--model <MODEL>', 'Optional fix model name in provider/model form'))
    .addOption(new Option('--fix-model <MODEL>').hideHelp())
    .addOption(new Option('--mock-run', 'Emulate OpenCode calls locally (2-5s/check, ~90% pass)'))
    .addOption(new Option('--mock-opencode').hideHelp())
    .addOption(new Option('--config <PATH>', 'Path to the OpenCode runtime config'))
    .addOption(new Option('--log <PATH>', 'Write OpenCode/runtime debug logs as JSONL'))
    .addOption(new Option('--image <REF>', 'Docker image to use when --runtime docker is selected'))
    .addOption(new Option('--artifacts-dir <PATH>', 'Directory for runtime artifacts such as report.json and logs'))
    .action(async (commandOptions: Record<string, unknown>) => {
      const rawOptions: Partial<ScanCommandOptions> = {
        mockOpencode: resolveBooleanOption(commandOptions.mockRun, commandOptions.mockOpencode),
        lastScan: Boolean(commandOptions.lastScan),
        ui: false
      };

      assignIfDefined(rawOptions, 'checkId', asOptionalString(commandOptions.check));
      assignIfDefined(rawOptions, 'policyId', asOptionalString(commandOptions.policy));
      assignIfDefined(rawOptions, 'repoPath', firstOptionalString(commandOptions.path, commandOptions.repo));
      assignIfDefined(rawOptions, 'outputFormat', asOptionalString(commandOptions.output) as 'json' | 'markdown' | undefined);
      assignIfDefined(rawOptions, 'fixAgent', firstOptionalString(commandOptions.agent, commandOptions.fixAgent));
      assignIfDefined(rawOptions, 'fixModel', firstOptionalString(commandOptions.model, commandOptions.fixModel));
      assignIfDefined(rawOptions, 'scanScope', firstOptionalString(commandOptions.scope, commandOptions.scanScope) as
        | 'uncommitted'
        | 'commit'
        | 'branch'
        | 'pr'
        | 'full'
        | undefined);
      assignIfDefined(rawOptions, 'scanTarget', firstOptionalString(commandOptions.target, commandOptions.scanTarget));
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
    .command('fix-worker')
    .description('Internal fix worker entry point.')
    .requiredOption('--request <PATH>', 'Path to the worker request JSON')
    .action(async (commandOptions: Record<string, unknown>) => {
      process.exitCode = await executeInternalFixWorkerCommand({
        requestPath: asOptionalString(commandOptions.request) ?? ''
      });
    });

  internal
    .command('scan-worker')
    .description('Internal scan worker entry point.')
    .requiredOption('--request <PATH>', 'Path to the worker request JSON')
    .action(async (commandOptions: Record<string, unknown>) => {
      process.exitCode = await executeInternalScanWorkerCommand({
        requestPath: asOptionalString(commandOptions.request) ?? ''
      });
    });

  void scanCommand;
  void fixCommand;
  return program;
}

function buildScanHelpSpec(defaultTarget: string | null): CommandHelpSpec {
  return {
    usage: 'shrike scan [options]',
    description: 'Run a check or policy bundle against a repository.',
    groups: [
      [
        {term: '-h, --help', description: 'display help for command'}
      ],
      [
        {term: '--scope <SCOPE>', description: 'Scan scope: uncommitted, commit, branch, pr, full (default: uncommitted).'},
        {term: '--target <TARGET>', description: `Scope target: commit/range for commit, base branch for branch, diff spec for pr${defaultTarget ? ` (default: ${defaultTarget})` : ''}.`},
        {term: '--runtime <MODE>', description: 'Runtime mode: native or docker.'},
        {term: '--path <PATH>', description: 'Repository path to scan (default: current folder).'},
        {term: '-p, --parallelism <N_OR_AUTO_OR_FULL>', description: 'Run checks concurrently. Accepts an integer, auto, or full (spawn as many agents as checks).'},
        {term: '-l, --last-scan', description: 'Load the saved .openshrike/last-scan.json report instead of rescanning (default: false).'},
        {term: '--no-ui', description: 'Disable the live dashboard.'}
      ],
      [
        {term: '--check <CHECK_ID>', description: 'Check identifier, e.g. csharp-rel-001-cancellation-tokens.'},
        {term: '--policy <POLICY_ID>', description: 'Policy identifier, e.g. csharp-baseline.'},
        {term: '--output <FORMAT>', description: 'Output format: markdown or json (default: markdown).'},
        {term: '--agent <NAME>', description: 'Optional OpenCode agent name.'},
        {term: '--model <MODEL>', description: 'Optional model name in provider/model form.'},
        {term: '--mock-run', description: 'Emulate OpenCode calls locally (2-5s/check, ~90% pass) (default: false).'},
        {term: '--config <PATH>', description: 'Path to the OpenCode runtime config.'},
        {term: '--log <PATH>', description: 'Write OpenCode/runtime debug logs as JSONL.'},
        {term: '--image <REF>', description: 'Docker image to use when --runtime docker is selected.'},
        {term: '--artifacts-dir <PATH>', description: 'Directory for runtime artifacts such as report.json and logs.'}
      ]
    ]
  };
}

function buildFixHelpSpec(defaultTarget: string | null): CommandHelpSpec {
  return {
    usage: 'shrike fix [options]',
    description: 'Fix failing checks one by one and recheck them.',
    groups: [
      [
        {term: '-h, --help', description: 'display help for command'}
      ],
      [
        {term: '--scope <SCOPE>', description: 'Scan scope: uncommitted, commit, branch, pr, full (default: uncommitted).'},
        {term: '--target <TARGET>', description: `Scope target: commit/range for commit, base branch for branch, diff spec for pr${defaultTarget ? ` (default: ${defaultTarget})` : ''}.`},
        {term: '--runtime <MODE>', description: 'Runtime mode: native or docker.'},
        {term: '--path <PATH>', description: 'Repository path to scan (default: current folder).'},
        {term: '-p, --parallelism <N_OR_AUTO_OR_FULL>', description: 'Run checks concurrently. Accepts an integer, auto, or full (spawn as many agents as checks).'},
        {term: '-l, --last-scan', description: 'Load the saved .openshrike/last-scan.json report instead of rescanning (default: false).'}
      ],
      [
        {term: '--check <CHECK_ID>', description: 'Check identifier, e.g. csharp-rel-001-cancellation-tokens.'},
        {term: '--policy <POLICY_ID>', description: 'Policy identifier, e.g. csharp-baseline.'},
        {term: '--output <FORMAT>', description: 'Output format: markdown or json (default: markdown).'},
        {term: '--agent <NAME>', description: 'Optional OpenCode fix agent name.'},
        {term: '--model <MODEL>', description: 'Optional fix model name in provider/model form.'},
        {term: '--mock-run', description: 'Emulate OpenCode calls locally (2-5s/check, ~90% pass) (default: false).'},
        {term: '--config <PATH>', description: 'Path to the OpenCode runtime config.'},
        {term: '--log <PATH>', description: 'Write OpenCode/runtime debug logs as JSONL.'},
        {term: '--image <REF>', description: 'Docker image to use when --runtime docker is selected.'},
        {term: '--artifacts-dir <PATH>', description: 'Directory for runtime artifacts such as report.json and logs.'}
      ]
    ]
  };
}

function renderCommandHelp(spec: CommandHelpSpec): string {
  const allRows = spec.groups.flat();
  const termWidth = Math.max(...allRows.map(row => row.term.length), 18) + 2;
  const lines = [
    `Usage: ${spec.usage}`,
    '',
    spec.description,
    '',
    'Options:'
  ];

  spec.groups.forEach((group, groupIndex) => {
    group.forEach(row => {
      lines.push(...renderHelpRow(row, termWidth));
    });

    if (groupIndex < spec.groups.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n');
}

function renderHelpRow(row: HelpOptionRow, termWidth: number): string[] {
  const totalWidth = 112;
  const descriptionWidth = Math.max(24, totalWidth - termWidth - 2);
  const descriptionLines = wrapText(row.description, descriptionWidth);
  const [firstLine, ...rest] = descriptionLines;
  const prefix = `  ${row.term.padEnd(termWidth, ' ')}`;
  const continuationPrefix = `  ${' '.repeat(termWidth)}`;
  const rendered = [`${prefix}${firstLine ?? ''}`];

  rest.forEach(line => {
    rendered.push(`${continuationPrefix}${line}`);
  });

  return rendered;
}

function wrapText(text: string, width: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

function resolveHelpDefaultTarget(argv: string[]): string | null {
  if (argv[2] !== 'scan' && argv[2] !== 'fix') {
    return null;
  }

  const repoPath = path.resolve(readOptionValue(argv.slice(3), '--path', '--repo') ?? '.');
  return discoverDefaultPullRequestTargetSync(repoPath);
}

function readOptionValue(argv: string[], ...optionNames: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    for (const optionName of optionNames) {
      if (token === optionName) {
        return argv[index + 1];
      }

      if (token.startsWith(`${optionName}=`)) {
        return token.slice(optionName.length + 1);
      }
    }
  }

  return undefined;
}

function resolveBooleanOption(...values: unknown[]): boolean {
  return values.some(value => value === true);
}

function firstOptionalString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}

function isBareScanInvocation(argv: string[]): boolean {
  return argv[2] === 'scan' && argv.length === 3;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseParallelism(value: unknown): number | 'auto' | 'full' | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'full') {
    return normalized;
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

function isExecutedAsScript(moduleUrl: string, argvEntry: string | undefined): boolean {
  if (!argvEntry) {
    return false;
  }

  return pathToFileURL(path.resolve(argvEntry)).href === moduleUrl;
}

if (isExecutedAsScript(import.meta.url, process.argv[1])) {
  process.exitCode = await runCli(process.argv);
}
