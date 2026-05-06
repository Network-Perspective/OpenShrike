import {executeScanCommand} from './scan.js';
import {InitCommandCancelledError, runInitCommand} from '../lib/init.js';

export async function executeInitCommand(options: {force: boolean}): Promise<number> {
  try {
    const result = await runInitCommand({
      cwd: process.cwd(),
      force: options.force
    });

    if (result.action === 'run-scan') {
      return await executeScanCommand({
        repoPath: result.repoRoot
      });
    }

    return 0;
  } catch (error) {
    if (error instanceof InitCommandCancelledError) {
      return 130;
    }

    throw error;
  }
}
