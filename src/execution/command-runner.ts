import { spawn } from 'node:child_process';

export interface CommandResult {
  // Runners use a normalized numeric failure status when the child has no numeric exit.
  exitCode: number;
  termination: { exitCode: number | null; signal: NodeJS.Signals | null };
}

export async function runCommand(command: string, args: string[] = [], cwd?: string, input?: string): Promise<number> {
  return (await runCommandWithTermination(command, args, cwd, input)).exitCode;
}

export function runCommandWithTermination(
  command: string,
  args: string[] = [],
  cwd?: string,
  input?: string,
): Promise<CommandResult> {
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

    child.on('close', (code, signal) => {
      resolve({ exitCode: code ?? 1, termination: { exitCode: code, signal } });
    });
  });
}
