import { spawn } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';

function isWithinDirectory(directory: string, file: string): boolean {
  const path = relative(directory, file);

  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export function discoverVitestTestFiles(
  repoRoot: string,
  projectRoot = '.',
  testRoots: readonly string[] = ['.'],
): Promise<string[]> {
  const projectDirectory = resolve(repoRoot, projectRoot);

  return new Promise<string[]>((resolveDiscovery, reject) => {
    const child = spawn('npx', ['--no-install', 'vitest', 'list', '--filesOnly'], {
      cwd: projectDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

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

      const allowDirectories = testRoots.map((root) => resolve(projectDirectory, root));

      const testFiles = output
        .split(/\r?\n/)
        .map((file) => file.trim())
        .filter(Boolean)
        .map((file) => resolve(projectDirectory, file))
        .filter(
          (file) =>
            isWithinDirectory(projectDirectory, file) &&
            allowDirectories.some((directory) => isWithinDirectory(directory, file)),
        )
        .map((file) => relative(repoRoot, file).split(sep).join('/'));

      resolveDiscovery(testFiles);
    });
  });
}
