import type { ExecutionResults, TestRunner } from './test-runner.js';
import { type CommandResult, runCommandWithTermination } from './command-runner.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readVitestEvidence,
  readVitestShutdown,
  type VitestExecutionEvidence,
  type VitestShutdownStatus,
} from './vitest-evidence.js';

interface VitestRunner extends TestRunner {
  run(
    testFiles: string[],
    repoRoot: string,
  ): Promise<
    ExecutionResults & {
      evidence: VitestExecutionEvidence;
      shutdown: VitestShutdownStatus;
      termination?: CommandResult['termination'];
    }
  >;
}

export function createVitestRunner(
  projectRoot = '.',
  execute: (
    ...args: Parameters<typeof runCommandWithTermination>
  ) => Promise<number | CommandResult> = runCommandWithTermination,
): VitestRunner {
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

      // An unavailable evidence channel must not prevent the configured tests from running.
      const directory = await mkdtemp(join(tmpdir(), 'forge-vitest-evidence-')).catch(() => undefined);
      const destination = directory && {
        resultFile: join(directory, 'result.json'),
        shutdownFile: join(directory, 'shutdown'),
        invocationId: basename(directory),
      };

      try {
        const manifest = JSON.stringify({ testFiles: projectTestFiles, evidence: destination });
        const execution = await execute(process.execPath, [workerPath], projectDirectory, manifest);
        const processResult = typeof execution === 'number' ? { exitCode: execution } : execution;
        const evidence: VitestExecutionEvidence = destination
          ? await readVitestEvidence(destination, projectTestFiles)
          : { status: 'incomplete', reason: 'missing-result' };

        const shutdown = destination ? await readVitestShutdown(destination) : 'unverified';
        return { ...processResult, evidence, shutdown };
      } finally {
        if (directory) {
          await rm(directory, { recursive: true, force: true }).catch(() => undefined);
        }
      }
    },
  };
}
