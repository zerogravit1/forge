import { spawn } from 'node:child_process';

export function discoverVitestTestFiles(repoRoot: string): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    const child = spawn('npx', ['--no-install', 'vitest', 'list', '--filesOnly'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    let errorOutput = '';

    child.stderr.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start Vitest discovery: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Vitest discovery failed with exit code ${code}: ${errorOutput.trim()}`));
        return;
      }

      const testFiles = output
        .split(/\r?\n/)
        .map((file) => file.trim())
        .filter(Boolean);

      resolve(testFiles);
    });
  });
}
