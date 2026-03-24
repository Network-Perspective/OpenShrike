import path from 'node:path';
import {runInitCommand} from '../lib/init.js';

export async function executeInitCommand(options: {force: boolean}): Promise<number> {
  const result = await runInitCommand({
    cwd: process.cwd(),
    force: options.force
  });

  console.error(`Wrote OpenCode config to ${relative(result.configPath)}`);
  console.error(`Listed required env vars in ${relative(result.requiredEnvFilePath)}`);
  console.error(`Wrote example env file to ${relative(result.envExamplePath)}`);

  return 0;
}

function relative(filePath: string): string {
  return path.relative(process.cwd(), filePath) || '.';
}
