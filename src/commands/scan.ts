import fs from 'node:fs/promises';
import path from 'node:path';
import {createInterface} from 'node:readline/promises';
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
import {renderScanReportMarkdown} from '../lib/markdown.js';
import {createSavedScanRequest, loadLastScanState, saveLastScanState} from '../lib/last-scan.js';
import {resolveScanOptions} from '../lib/scan-options.js';
import {runScan} from '../lib/scan.js';
import type {SavedScanRequest, ScanCommandOptions, ScanReport} from '../lib/types.js';
import {runScanWithInk, ScanUiCancelledError} from '../ui/scan-app.js';

export interface ExecuteScanCommandBehavior {
  promptForFullScanWhenScopeEmpty?: boolean;
  confirmFullScanFallback?: () => Promise<boolean>;
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

  while (true) {
    try {
      return await executeResolvedScanCommand(options);
    } catch (error) {
      if (error instanceof ScanUiCancelledError) {
        return 130;
      }

      if (canPromptForFullScanFallback && isNoChangesInScopeError(error)) {
        canPromptForFullScanFallback = false;
        const confirmFullScanFallback = behavior.confirmFullScanFallback ?? promptForFullScanFallback;

        if (await confirmFullScanFallback()) {
          options = {
            ...options,
            scanScope: 'full',
            scanTarget: undefined
          };
          continue;
        }

        process.stdout.write('Skipped scan: there are no uncommitted changes in the current folder.\n');
        return 0;
      }

      return await renderScanCommandError(error, rawOptions, options);
    }
  }
}

async function executeResolvedScanCommand(options: ScanCommandOptions): Promise<number> {
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
        })
      : loaded.state.report;
  } else {
    savedRequest = createSavedScanRequest(options);
    report = shouldUseUi ? await runScanWithInk(options) : await runScan(options);
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

async function promptForFullScanFallback(): Promise<boolean> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = await readline.question(
      'There are no uncommitted changes in the current folder. Run a full repository scan instead? [y/N] '
    );
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    readline.close();
  }
}
