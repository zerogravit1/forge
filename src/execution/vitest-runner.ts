import type { TestRunner } from './test-runner.js';
import { runCommand, } from './command-runner.js';

export function createVitestRunner(
  execute: typeof runCommand = runCommand,
): TestRunner {
  return {
    id: 'vitest',

    async run(testFiles, repoRoot) {
      const exitCode = await execute(
        'npx',
        ['--no-install', 'vitest', 'run', ...testFiles],
        repoRoot
      );

      return { exitCode };
    },
  };
}