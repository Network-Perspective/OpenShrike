import fs from 'node:fs/promises';
import path from 'node:path';
import {assembleBundleForCheck, assembleBundleForPolicy} from '../lib/bundle.js';
import {renderScanReportMarkdown} from '../lib/markdown.js';
import {resolveScanOptions} from '../lib/scan-options.js';
import {runScan} from '../lib/scan.js';
import type {ScanCommandOptions, ScanReport} from '../lib/types.js';
import {runScanWithInk, ScanUiCancelledError} from '../ui/scan-app.js';

export async function executeScanCommand(rawOptions: Partial<ScanCommandOptions>): Promise<number> {
  const options = await resolveScanOptions(rawOptions);
  const shouldUseUi = options.ui && process.stderr.isTTY;
  let report: ScanReport;

  try {
    report = shouldUseUi ? await runScanWithInk(options) : await runScan(options);
  } catch (error) {
    if (error instanceof ScanUiCancelledError) {
      return 130;
    }

    throw error;
  }

  if (options.emitBundlePath) {
    const bundle = options.policyId
      ? await assembleBundleForPolicy(options.policyId)
      : await assembleBundleForCheck(options.checkId!);
    const outputPath = path.resolve(options.emitBundlePath);
    await fs.mkdir(path.dirname(outputPath), {recursive: true});
    await fs.writeFile(outputPath, `${bundle}\n`, 'utf8');
  }

  if (options.outputFormat === 'markdown') {
    process.stdout.write(`${renderScanReportMarkdown(report)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }

  return report.summary.failed > 0 ? 2 : 0;
}
