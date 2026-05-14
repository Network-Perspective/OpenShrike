import {
  normalizeCliError,
  renderCliError,
  resolveScanOutputFormat
} from '../lib/cli-error.js';
import {fixAndRecheckCheck, updateReportCheck} from '../lib/fix.js';
import {createSavedScanRequest, loadLastScanState, saveLastScanState} from '../lib/last-scan.js';
import {renderScanReportMarkdown} from '../lib/markdown.js';
import {resolveScanOptions} from '../lib/scan-options.js';
import {createNativeScanSession, runScan} from '../lib/scan.js';
import type {SavedScanRequest, SavedScanScope, ScanCommandOptions, ScanReport} from '../lib/types.js';

export async function executeFixCommand(rawOptions: Partial<ScanCommandOptions>): Promise<number> {
  let options: ScanCommandOptions | null = null;

  try {
    options = await resolveScanOptions({
      ...rawOptions,
      ui: false
    });

    let report: ScanReport;
    let savedRequest: SavedScanRequest;
    let savedScope: SavedScanScope | undefined;

    if (options.lastScan) {
      const loaded = await loadLastScanState(options.repoPath);
      loaded.warnings.forEach(warning => {
        process.stderr.write(`OpenShrike warning: ${warning}\n`);
      });
      report = loaded.state.report;
      savedRequest = loaded.state.request;
      savedScope = loaded.state.scope;
    } else {
      report = await runScan({
        ...options,
        ui: false,
        lastScan: false
      });
      savedRequest = createSavedScanRequest(options);
      const saveWarnings = await saveLastScanState({
        report,
        request: savedRequest
      });
      saveWarnings.forEach(warning => {
        process.stderr.write(`OpenShrike warning: ${warning}\n`);
      });
    }

    let nextReport = report;

    if (savedRequest.runtimeMode === 'native') {
      const session = createNativeScanSession(
        {
          ...options,
          repoPath: report.repo.path,
          ui: false,
          lastScan: false
        },
        {
          initialReport: report,
          savedRequest,
          ...(savedScope ? {savedScope} : {})
        }
      );

      try {
        const initialFailedCheckIds = nextReport.checks
          .filter(check => check.status === 'fail')
          .map(check => check.id);

        for (const checkId of initialFailedCheckIds) {
          const check = nextReport.checks.find(candidate => candidate.id === checkId);
          if (!check || check.status !== 'fail') {
            continue;
          }

          await session.requestFix(checkId);
          nextReport = session.getReport() ?? nextReport;
          const saveWarnings = await saveLastScanState({
            report: nextReport,
            request: savedRequest,
            scope: session.getScope() ?? undefined
          });
          saveWarnings.forEach(warning => {
            process.stderr.write(`OpenShrike warning: ${warning}\n`);
          });
        }
      } finally {
        await session.close();
      }
    } else {
      const initialFailedCheckIds = nextReport.checks
        .filter(check => check.status === 'fail')
        .map(check => check.id);

      for (const checkId of initialFailedCheckIds) {
        const check = nextReport.checks.find(candidate => candidate.id === checkId);
        if (!check || check.status !== 'fail') {
          continue;
        }

        const rechecked = await fixAndRecheckCheck({
          base: {
            ...options,
            repoPath: nextReport.repo.path,
            ui: false,
            lastScan: false
          },
          request: savedRequest,
          report: nextReport,
          check,
          ...(savedScope ? {scope: savedScope} : {})
        });
        nextReport = updateReportCheck(nextReport, rechecked);
        const saveWarnings = await saveLastScanState({
          report: nextReport,
          request: savedRequest,
          ...(savedScope ? {scope: savedScope} : {})
        });
        saveWarnings.forEach(warning => {
          process.stderr.write(`OpenShrike warning: ${warning}\n`);
        });
      }
    }

    if (options.outputFormat === 'markdown') {
      process.stdout.write(`${renderScanReportMarkdown(nextReport)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(nextReport, null, 2)}\n`);
    }

    return nextReport.summary.failed > 0 ? 2 : 0;
  } catch (error) {
    const outputFormat = options?.outputFormat ?? await resolveScanOutputFormat(rawOptions);
    const cliError = normalizeCliError(error);
    process.stdout.write(`${renderCliError(cliError, outputFormat)}\n`);
    return 1;
  }
}
