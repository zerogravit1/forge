import { spawn } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';

function isWithinDirectory(directory: string, file: string): boolean {
  const path = relative(directory, file);

  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function parseVitestFileList(output: string): string[] {
  const parsed: unknown = JSON.parse(output);

  if (!Array.isArray(parsed)) {
    throw new Error('Expected Vitest discovery to return an array');
  }

  return parsed.map((entry: unknown) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('file' in entry) ||
      typeof entry.file !== 'string' ||
      entry.file.length === 0
    ) {
      throw new Error('Invalid Vitest discovery entry');
    }

    return entry.file;
  });
}

export function discoverVitestTestFiles(
  repoRoot: string,
  projectRoot = '.',
  testRoots: readonly string[] = ['.'],
): Promise<string[]> {
  const projectDirectory = resolve(repoRoot, projectRoot);

  return new Promise<string[]>((resolveDiscovery, reject) => {
    const child = spawn('npx', ['--no-install', 'vitest', 'list', '--filesOnly', '--json'], {
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

      try {
        const discoveredFiles = parseVitestFileList(output);

        const allowedDirectories = testRoots.map((root) => resolve(projectDirectory, root));

        const testFiles = discoveredFiles
          .map((file) => resolve(projectDirectory, file))
          .filter(
            (file) =>
              isWithinDirectory(projectDirectory, file) &&
              allowedDirectories.some((directory) => isWithinDirectory(directory, file)),
          )
          .map((file) => relative(repoRoot, file).split(sep).join('/'));

        resolveDiscovery([...new Set(testFiles)]);
      } catch (error) {
        reject(new Error(`Invalid Vitest discovery output: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  });
}
