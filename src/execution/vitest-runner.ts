import type { TestRunner } from './test-runner.js';
import { runCommand } from './command-runner.js';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createVitestRunner(projectRoot = '.', execute: typeof runCommand = runCommand): TestRunner {
  return {
    id: 'vitest',

    async run(testFiles, repoRoot) {
      if (testFiles.length === 0) {
        throw new Error('No test files provided');
      }

      const projectDirectory = resolve(repoRoot, projectRoot);

      const projectTestFiles = testFiles.map((file) => {
        if (isAbsolute(file)) {
          throw new Error(`Expected repository-relative test path: ${file}`);
        }

        const absolutePath = resolve(repoRoot, file);
        const projectRelativePath = relative(projectDirectory, absolutePath);

        if (
          !projectRelativePath ||
          projectRelativePath === '..' ||
          projectRelativePath.startsWith(`..${sep}`) ||
          isAbsolute(projectRelativePath)
        ) {
          throw new Error(`Test file outside configured project: ${file}`);
        }

        return projectRelativePath.split(sep).join('/');
      });

      // Source execution uses .ts; compiled execution uses .js.
      const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';

      const workerPath = fileURLToPath(new URL(`./vitest-worker${extension}`, import.meta.url));

      const manifest = JSON.stringify({
        testFiles: projectTestFiles,
      });

      const exitCode = await execute(process.execPath, [workerPath], projectDirectory, manifest);

      return { exitCode };
    },
  };
}
