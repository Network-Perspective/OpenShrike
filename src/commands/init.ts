import {InitCommandCancelledError, runInitCommand} from '../lib/init.js';

export async function executeInitCommand(options: {force: boolean}): Promise<number> {
  try {
    await runInitCommand({
      cwd: process.cwd(),
      force: options.force
    });

    return 0;
  } catch (error) {
    if (error instanceof InitCommandCancelledError) {
      return 130;
    }

    throw error;
  }
}
