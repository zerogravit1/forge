import { describe, expect, it, vi } from 'vitest';

import { createVitestRunner } from './vitest-runner.js';

describe('createVitestRunner', () => {
  it('executes only the selected test files', async () => {
    const execute = vi.fn(async () => 0);
    const runner = createVitestRunner(execute);

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
    const runner = createVitestRunner(execute);

    await expect(runner.run([], process.cwd())).rejects.toThrow('No test files provided');

    expect(execute).not.toHaveBeenCalled();
  });

  it('returns a nonzero exit code when tests fail', async () => {
    const execute = vi.fn(async () => 1);
    const runner = createVitestRunner(execute);

    const result = await runner.run(['src/cli.test.ts'], process.cwd());

    expect(execute).toHaveBeenCalledOnce();
    expect(result).toEqual({ exitCode: 1 });
  });
});
