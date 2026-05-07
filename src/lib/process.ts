import {spawn} from 'node:child_process';

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

export async function runProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    allowedExitCodes?: number[];
  }
): Promise<ProcessResult> {
  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', code => {
      const allowedExitCodes = options.allowedExitCodes ?? [0];
      if (!allowedExitCodes.includes(code ?? -1)) {
        reject(
          new Error(
            `Command failed (${command} ${args.join(' ')}): ${stderr.trim() || `exit code ${code}`}`
          )
        );
        return;
      }

      resolve({stdout, stderr});
    });
  });
}
