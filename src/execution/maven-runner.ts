import { basename, join } from 'node:path';

import type { TestRunner } from './test-runner.js';
import { runCommand } from './command-runner.js';

export function createMavenRunner(
  projectPath: string,
  execute: typeof runCommand = runCommand,
): TestRunner {
  return {
    id: 'maven',

    async run(testFiles, repoRoot) {
      if (testFiles.length === 0) {
        throw new Error('No test files provided');
      }

      const testClasses = testFiles.map((file) => basename(file, '.java'));

      const exitCode = await execute(
        'mvn',
        [
          '-f',
          join(projectPath, 'pom.xml'),
          `-Dtest=${testClasses.join(',')}`,
          'test',
        ],
        repoRoot,
      );

      return { exitCode };
    },
  };
}
