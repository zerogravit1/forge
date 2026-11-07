import { describe, expect, it, vi } from 'vitest';

import { createVitestRunner } from './vitest-runner.js';

import { resolve } from 'node:path';

describe('createVitestRunner', () => {
  it('executes only the selected test files', async () => {
    const execute = vi.fn(async () => 0);
    const runner = createVitestRunner('.', execute);

    const result = await runner.run(['src/cli.test.ts', 'src/selection/select-tests.test.ts'], process.cwd());

    expect(execute).toHaveBeenCalledOnce();

    expect(execute).toHaveBeenCalledWith(
      'npx',
      ['--no-install', 'vitest', 'run', 'src/cli.test.ts', 'src/selection/select-tests.test.ts'],
      process.cwd(),
    );

    expect(result).toEqual({ exitCode: 0 });
  });

  it('does not execute when no test files are provided', async () => {
    const execute = vi.fn(async () => 0);
    const runner = createVitestRunner('.', execute);

    await expect(runner.run([], process.cwd())).rejects.toThrow('No test files provided');

    expect(execute).not.toHaveBeenCalled();
  });

  it('returns a nonzero exit code when tests fail', async () => {
    const execute = vi.fn(async () => 1);
    const runner = createVitestRunner('.', execute);

    const result = await runner.run(['src/cli.test.ts'], process.cwd());

    expect(execute).toHaveBeenCalledOnce();
    expect(result).toEqual({ exitCode: 1 });
  });

  it('translates repository-relative test paths for nested projects', async () => {
    const execute = vi.fn(async () => 0);
    const runner = createVitestRunner('packages/app', execute);
    const repoRoot = process.cwd();

    const result = await runner.run(['packages/app/tests/App.test.ts', 'packages/app/tests/Orders.test.ts'], repoRoot);

    expect(execute).toHaveBeenCalledOnce();

    expect(execute).toHaveBeenCalledWith(
      'npx',
      ['--no-install', 'vitest', 'run', 'tests/App.test.ts', 'tests/Orders.test.ts'],
      resolve(repoRoot, 'packages/app'),
    );

    expect(result).toEqual({ exitCode: 0 });
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
