import { spawn } from 'node:child_process';

export function runCommand(
  command: string,
  args: string[] = [],
  cwd?: string,
  input?: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
      cwd,
    });

    child.on('error', reject);

    if (input !== undefined) {
      child.stdin?.on('error', reject);
      child.stdin?.end(input);
    }

    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}
