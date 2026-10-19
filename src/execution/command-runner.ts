import { spawn } from 'node:child_process';

export function runCommand(command: string, args: string[] = [], cwd?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd,
    });

    child.on('error', reject);

    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}
