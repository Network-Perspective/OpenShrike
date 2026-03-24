import fs from 'node:fs/promises';
import path from 'node:path';
import {assembleBundleForCheck, assembleBundleForPolicy} from '../lib/bundle.js';
import {renderScanReportMarkdown} from '../lib/markdown.js';
import {validateScanOptions} from '../lib/scan-options.js';
import {runScan} from '../lib/scan.js';
import type {ScanCommandOptions} from '../lib/types.js';
import {runScanWithInk} from '../ui/scan-app.js';

export async function executeScanCommand(rawOptions: Partial<ScanCommandOptions>): Promise<number> {
  const options = validateScanOptions(rawOptions);
  const shouldUseUi = options.ui && process.stderr.isTTY;
  const report = shouldUseUi ? await runScanWithInk(options) : await runScan(options);

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
