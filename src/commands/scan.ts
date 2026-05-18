import fs from 'node:fs/promises';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {
  assembleBundleForCheck,
  assembleBundleForPolicy,
  assembleBundleForProjectChecks
} from '../lib/bundle.js';
import {
  CliError,
  normalizeCliError,
  renderCliError,
  resolveScanOutputFormat
} from '../lib/cli-error.js';
import {
  buildEmptyScopeFallbackOptions,
  type EmptyScopeFallbackAction,
  type EmptyScopeFallbackContext
} from '../lib/empty-scope-fallback.js';
import {renderScanReportMarkdown} from '../lib/markdown.js';
import {createSavedScanRequest, loadLastScanState, saveLastScanState} from '../lib/last-scan.js';
import {resolveScanOptions} from '../lib/scan-options.js';
import {discoverDefaultPullRequestTarget} from '../lib/scope.js';
import {runScan} from '../lib/scan.js';
import type {SavedScanRequest, ScanCommandOptions, ScanReport} from '../lib/types.js';
import {
  runScanWithInk,
  ScanUiCancelledError,
  ScanUiEmptyScopeFallbackSelectionError
} from '../ui/scan-app.js';

export interface ExecuteScanCommandBehavior {
  promptForFullScanWhenScopeEmpty?: boolean;
  selectEmptyScopeFallbackAction?: (
    context: EmptyScopeFallbackContext
  ) => Promise<EmptyScopeFallbackAction>;
}

export async function executeScanCommand(
  rawOptions: Partial<ScanCommandOptions>,
  behavior: ExecuteScanCommandBehavior = {}
): Promise<number> {
  let options: ScanCommandOptions;

  try {
    options = await resolveScanOptions(rawOptions);
  } catch (error) {
    return await renderScanCommandError(error, rawOptions);
  }

  let canPromptForFullScanFallback = shouldPromptForFullScanFallback(options, behavior);
  const emptyScopeFallbackContext = canPromptForFullScanFallback
    ? await resolveEmptyScopeFallbackContext(options.repoPath)
    : null;

  while (true) {
    try {
      return await executeResolvedScanCommand(options, {
        allowEmptyScopeFallbackPrompt: canPromptForFullScanFallback,
        ...(emptyScopeFallbackContext
          ? {emptyScopeFallbackContext}
          : {})
      });
    } catch (error) {
      if (error instanceof ScanUiCancelledError) {
        return 130;
      }

      if (error instanceof ScanUiEmptyScopeFallbackSelectionError) {
        canPromptForFullScanFallback = false;
        const nextOptions = applyEmptyScopeFallbackAction(options, error.action);
        if (!nextOptions) {
          process.stdout.write('Skipped scan: there are no uncommitted changes in the current folder.\n');
          return 0;
        }

        options = nextOptions;
        continue;
      }

      if (canPromptForFullScanFallback && isNoChangesInScopeError(error)) {
        canPromptForFullScanFallback = false;
        const selectEmptyScopeFallbackAction = behavior.selectEmptyScopeFallbackAction ?? promptForEmptyScopeFallback;
        const action = await selectEmptyScopeFallbackAction(
          emptyScopeFallbackContext ?? {defaultBranchTarget: null}
        );
        const nextOptions = applyEmptyScopeFallbackAction(options, action);

        if (nextOptions) {
          options = nextOptions;
          continue;
        }

        process.stdout.write('Skipped scan: there are no uncommitted changes in the current folder.\n');
        return 0;
      }

      return await renderScanCommandError(error, rawOptions, options);
    }
  }
}

async function executeResolvedScanCommand(
  options: ScanCommandOptions,
  behavior: {
    allowEmptyScopeFallbackPrompt?: boolean;
    emptyScopeFallbackContext?: EmptyScopeFallbackContext;
  } = {}
): Promise<number> {
  const shouldUseUi = options.ui && process.stderr.isTTY;
  let report: ScanReport;
  let savedRequest: SavedScanRequest;

  if (options.lastScan) {
    const loaded = await loadLastScanState(options.repoPath);
    loaded.warnings.forEach(warning => {
      process.stderr.write(`OpenShrike warning: ${warning}\n`);
    });
    savedRequest = loaded.state.request;
    report = shouldUseUi
      ? await runScanWithInk(options, {
          initialReport: loaded.state.report,
          savedRequest,
          ...(loaded.state.scope ? {savedScope: loaded.state.scope} : {})
        }, behavior)
      : loaded.state.report;
  } else {
    savedRequest = createSavedScanRequest(options);
    report = shouldUseUi ? await runScanWithInk(options, undefined, behavior) : await runScan(options);
  }

  if (!options.lastScan && options.emitBundlePath) {
    const bundle = options.projectChecksDir
      ? await assembleBundleForProjectChecks(options.projectChecksDir, options.checkId)
      : options.policyId
        ? await assembleBundleForPolicy(options.policyId)
        : await assembleBundleForCheck(options.checkId!);
    const outputPath = path.resolve(options.emitBundlePath);
    await fs.mkdir(path.dirname(outputPath), {recursive: true});
    await fs.writeFile(outputPath, `${bundle}\n`, 'utf8');
  }

  if (!options.lastScan) {
    const saveWarnings = await saveLastScanState({
      report,
      request: savedRequest
    });
    saveWarnings.forEach(warning => {
      process.stderr.write(`OpenShrike warning: ${warning}\n`);
    });
  }

  if (options.outputFormat === 'markdown') {
    process.stdout.write(`${renderScanReportMarkdown(report)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }

  return report.summary.failed > 0 ? 2 : 0;
}

async function renderScanCommandError(
  error: unknown,
  rawOptions: Partial<ScanCommandOptions>,
  resolvedOptions?: ScanCommandOptions
): Promise<number> {
  const outputFormat = resolvedOptions?.outputFormat ?? await resolveScanOutputFormat(rawOptions);
  const cliError = normalizeCliError(error);
  process.stdout.write(`${renderCliError(cliError, outputFormat)}\n`);
  return 1;
}

function shouldPromptForFullScanFallback(
  options: ScanCommandOptions,
  behavior: ExecuteScanCommandBehavior
): boolean {
  return Boolean(behavior.promptForFullScanWhenScopeEmpty)
    && !options.lastScan
    && options.scanScope === 'uncommitted'
    && process.stdin.isTTY === true
    && process.stdout.isTTY === true;
}

function isNoChangesInScopeError(error: unknown): boolean {
  return error instanceof CliError && error.code === 'NO_CHANGES_IN_SCOPE';
}

async function resolveEmptyScopeFallbackContext(repoPath: string): Promise<EmptyScopeFallbackContext> {
  return {
    defaultBranchTarget: await discoverDefaultPullRequestTarget(repoPath).catch(() => null)
  };
}

function applyEmptyScopeFallbackAction(
  options: ScanCommandOptions,
  action: EmptyScopeFallbackAction
): ScanCommandOptions | null {
  switch (action) {
    case 'commit':
      return {
        ...options,
        lastScan: false,
        scanScope: 'commit',
        scanTarget: 'HEAD'
      };
    case 'branch':
      return {
        ...options,
        lastScan: false,
        scanScope: 'branch',
        scanTarget: undefined
      };
    case 'full':
      return {
        ...options,
        lastScan: false,
        scanScope: 'full',
        scanTarget: undefined
      };
    case 'last-scan':
      return {
        ...options,
        lastScan: true,
        scanTarget: undefined
      };
    case 'skip':
      return null;
  }
}

async function promptForEmptyScopeFallback(
  context: EmptyScopeFallbackContext
): Promise<EmptyScopeFallbackAction> {
  const stdin = process.stdin as NodeJS.ReadStream & {
    isRaw?: boolean;
    setRawMode?: (mode: boolean) => void;
  };
  const wasRaw = stdin.isRaw === true;
  const prompt = renderEmptyScopeFallbackPrompt(context);

  if (wasRaw) {
    stdin.setRawMode?.(false);
  }

  stdin.resume();
  const readline = createInterface({
    input: stdin,
    output: process.stdout
  });

  try {
    while (true) {
      const answer = await new Promise<string>(resolve => {
        readline.question(prompt, resolve);
      });
      const selection = parseEmptyScopeFallbackSelection(answer);
      if (selection) {
        return selection;
      }

      process.stdout.write('Enter 1-4, or press Enter to skip this scan.\n');
    }
  } finally {
    readline.close();

    if (wasRaw) {
      stdin.setRawMode?.(true);
    }
  }
}

function renderEmptyScopeFallbackPrompt(context: EmptyScopeFallbackContext): string {
  const options = buildEmptyScopeFallbackOptions(context);
  const labelWidth = options.reduce((width, option) => Math.max(width, option.label.length), 0);
  const lines = [
    'There are no uncommitted changes in the current folder. Choose what to scan next:',
    ...options.map((option, index) =>
      `  ${index + 1}. ${option.label.padEnd(labelWidth, ' ')}  ${option.detail}`
    ),
    '  Enter: skip this scan',
    'Selection [1-4]: '
  ];

  return lines.join('\n');
}

function parseEmptyScopeFallbackSelection(answer: string): EmptyScopeFallbackAction | null {
  const normalized = answer.trim().toLowerCase();
  if (!normalized) {
    return 'skip';
  }

  switch (normalized) {
    case '1':
    case 'commit':
    case 'last commit':
      return 'commit';
    case '2':
    case 'branch':
    case 'current branch':
    case 'diff':
      return 'branch';
    case '3':
    case 'full':
    case 'repo':
    case 'whole':
    case 'whole repository':
      return 'full';
    case '4':
    case 'last-scan':
    case 'last scan':
    case 'saved':
    case 'results':
      return 'last-scan';
    case '5':
    case 'skip':
    case 'n':
    case 'no':
      return 'skip';
    default:
      return null;
  }
}
