import type { TestRunner } from './test-runner.js';
import { runCommand } from './command-runner.js';
import { resolve, relative, isAbsolute, sep } from 'node:path';

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

      const exitCode = await execute('npx', ['--no-install', 'vitest', 'run', ...projectTestFiles], projectDirectory);

      return { exitCode };
    },
  };
}
