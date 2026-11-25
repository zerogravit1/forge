import { access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { runCommand } from './command-runner.js';
import { createVitestRunner } from './vitest-runner.js';

function readManifest(input: string | undefined) {
  if (input === undefined) {
    throw new Error('Expected a Vitest worker manifest');
  }

  return JSON.parse(input) as {
    testFiles: string[];
    evidence: { resultFile: string; invocationId: string };
  };
}

function passingReport(invocationId: string, file = 'tests/App.test.ts') {
  const identity = { id: 'app-runtime-specification', file, project: 'app' };

  return {
    invocationId,
    expected: [{ ...identity, kind: 'runtime' }],
    observed: [{ ...identity, state: 'passed', cases: { passed: 1, failed: 0, skipped: 0, pending: 0 } }],
    unhandledErrorCount: 0,
  };
}

describe('createVitestRunner', () => {
  it.each([
    {
      projectRoot: '.',
      selected: ['src/cli.test.ts', 'src/selection/select-tests.test.ts'],
      expectedFiles: ['src/cli.test.ts', 'src/selection/select-tests.test.ts'],
    },
    {
      projectRoot: 'packages/app',
      selected: ['packages/app/tests/App.test.ts', 'packages/app/tests/Orders.test.ts'],
      expectedFiles: ['tests/App.test.ts', 'tests/Orders.test.ts'],
    },
  ])('passes only the selected test files to a worker for $projectRoot', async (testCase) => {
    const execute = vi.fn<typeof runCommand>(async () => 0);
    const runner = createVitestRunner(testCase.projectRoot, execute);
    const repoRoot = process.cwd();

    const result = await runner.run(testCase.selected, repoRoot);
    const manifest = readManifest(execute.mock.calls[0]?.[3]);

    expect(execute).toHaveBeenCalledExactlyOnceWith(
      process.execPath,
      [expect.stringMatching(/vitest-worker\.(ts|js)$/)],
      resolve(repoRoot, testCase.projectRoot),
      expect.any(String),
    );
    expect(manifest.testFiles).toEqual(testCase.expectedFiles);
    expect(result).toEqual({ exitCode: 0, evidence: { status: 'incomplete', reason: 'missing-result' } });
  });

  it('does not execute when no test files are provided', async () => {
    const execute = vi.fn(async () => 0);
    const runner = createVitestRunner('.', execute);

    await expect(runner.run([], process.cwd())).rejects.toThrow('No test files provided');
    expect(execute).not.toHaveBeenCalled();
  });

  it('preserves a nonzero exit even when the worker reports matching passing observations', async () => {
    const execute = vi.fn<typeof runCommand>(async (_command, _args, _cwd, input) => {
      const { evidence } = readManifest(input);
      await writeFile(evidence.resultFile, JSON.stringify(passingReport(evidence.invocationId)));
      return 1;
    });
    const runner = createVitestRunner('.', execute);

    const result = await runner.run(['tests/App.test.ts'], process.cwd());
    const { evidence } = readManifest(execute.mock.calls[0]?.[3]);
    const report = passingReport(evidence.invocationId);

    expect(result.exitCode).toBe(1);
    expect(result.evidence).toMatchObject({
      status: 'complete',
      expected: report.expected,
      observed: report.observed,
    });
    await expect(access(evidence.resultFile)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('retains the missing specification when the worker reports no observed modules', async () => {
    const execute = vi.fn<typeof runCommand>(async (_command, _args, _cwd, input) => {
      const { evidence } = readManifest(input);
      const report = { ...passingReport(evidence.invocationId), observed: [] };
      await writeFile(evidence.resultFile, JSON.stringify(report));
      return 0;
    });
    const runner = createVitestRunner('.', execute);

    const result = await runner.run(['tests/App.test.ts'], process.cwd());

    expect(result.exitCode).toBe(0);
    expect(result.evidence).toMatchObject({
      status: 'incomplete',
      expected: [{ id: 'app-runtime-specification' }],
      observed: [],
      reconciliation: { missing: ['app-runtime-specification'] },
    });
  });

  it.each([
    {
      name: 'malformed JSON',
      report: () => '{',
      reason: 'invalid-result',
    },
    {
      name: 'a result from an earlier invocation',
      report: (invocationId: string) => JSON.stringify(passingReport('previous-' + invocationId)),
      reason: 'wrong-invocation',
    },
    {
      name: 'empty observations and expectations',
      report: (invocationId: string) =>
        JSON.stringify({ invocationId, expected: [], observed: [], unhandledErrorCount: 0 }),
      reason: 'wrong-scope',
    },
    {
      name: 'matching observations for an unselected same-basename file',
      report: (invocationId: string) => JSON.stringify(passingReport(invocationId, 'src/tests/App.test.ts')),
      reason: 'wrong-scope',
    },
    {
      name: 'an observation from the wrong Vitest project',
      report: (invocationId: string) => {
        const report = passingReport(invocationId);
        report.observed[0].project = 'sibling';
        return JSON.stringify(report);
      },
      reason: 'wrong-scope',
    },
  ])('reports incomplete evidence for $name after a zero exit', async ({ report, reason }) => {
    const execute = vi.fn<typeof runCommand>(async (_command, _args, _cwd, input) => {
      const { evidence } = readManifest(input);
      await writeFile(evidence.resultFile, report(evidence.invocationId));
      return 0;
    });
    const runner = createVitestRunner('packages/app', execute);

    const result = await runner.run(['packages/app/tests/App.test.ts'], process.cwd());
    const { evidence } = readManifest(execute.mock.calls[0]?.[3]);

    expect(result).toEqual({ exitCode: 0, evidence: { status: 'incomplete', reason } });
    await expect(access(evidence.resultFile)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each([
    'root-tests/Unrelated.test.ts',
    'packages/sibling/tests/Other.test.ts',
    'packages/app/../sibling/tests/Other.test.ts',
  ])('rejects test files outside the configured project: %s', async (testFile) => {
    const execute = vi.fn(async () => 0);
    const runner = createVitestRunner('packages/app', execute);

    await expect(runner.run([testFile], process.cwd())).rejects.toThrow('Test file outside configured project');
    expect(execute).not.toHaveBeenCalled();
  });
});
