import { spawn } from 'node:child_process';

const STDIN_FAILURE_OBSERVATION_MS = 1_000;

export interface CommandResult {
  // Runners normalize a failed write or a missing numeric exit to a failure status.
  exitCode: number;
  termination: { exitCode: number | null; signal: NodeJS.Signals | null };
  stdinError?: Error;
}

function spawnCommand(command: string, args: string[], cwd: string | undefined, input: string | undefined) {
  return spawn(command, args, {
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    cwd,
  });
}

export async function runCommand(command: string, args: string[] = [], cwd?: string, input?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, cwd, input);
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));

    if (input !== undefined) {
      child.stdin?.on('error', reject);
      child.stdin?.end(input);
    }
  });
}

export function runCommandWithTermination(
  command: string,
  args: string[] = [],
  cwd?: string,
  input?: string,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, cwd, input);
    const stdin = child.stdin;
    let stdinClosed = stdin === null;
    let termination: CommandResult['termination'] | undefined;
    let stdinError: Error | undefined;
    let observationDeadline: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const complete = (observed: CommandResult['termination']) => {
      if (settled) return;
      settled = true;
      clearTimeout(observationDeadline);
      resolve({
        exitCode: stdinError ? 1 : (observed.exitCode ?? 1),
        termination: observed,
        ...(stdinError && { stdinError }),
      });
    };

    // A failed launch can emit close without ever having run a process.
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(observationDeadline);
      reject(error);
    });

    // Child close does not wait for piped stdin. Its pending write can still fail.
    child.once('close', (exitCode, signal) => {
      termination = { exitCode, signal };
      if (stdinClosed) complete(termination);
    });

    if (stdin) {
      stdin.once('close', () => {
        stdinClosed = true;
        if (termination) complete(termination);
      });
      stdin.on('error', (error) => {
        if (settled || stdinError) return;
        stdinError = error;

        // A child can stop reading and remain alive. Give it a bounded chance to exit.
        observationDeadline = setTimeout(() => {
          const observed = termination ?? { exitCode: child.exitCode, signal: child.signalCode };
          if (observed.exitCode === null && observed.signal === null) {
            stdin.destroy();
            child.unref();
          }
          complete(observed);
        }, STDIN_FAILURE_OBSERVATION_MS);
      });
      stdin.end(input);
    }
  });
}
