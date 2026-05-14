import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assembleBundleForCheck,
  assembleBundleForPolicy,
  assembleBundleForProjectChecks
} from '../lib/bundle.js';
import {
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

export async function executeScanCommand(rawOptions: Partial<ScanCommandOptions>): Promise<number> {
  let options: ScanCommandOptions | null = null;
  try {
    options = await resolveScanOptions(rawOptions);
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
  } catch (error) {
    if (error instanceof ScanUiCancelledError) {
      return 130;
    }

    const outputFormat = options?.outputFormat ?? await resolveScanOutputFormat(rawOptions);
    const cliError = normalizeCliError(error);
    process.stdout.write(`${renderCliError(cliError, outputFormat)}\n`);
    return 1;
  }
}
