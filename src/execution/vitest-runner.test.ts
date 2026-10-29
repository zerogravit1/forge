import { describe, expect, it, vi } from 'vitest';

import { createVitestRunner } from './vitest-runner.js'

describe('createVitestRunner', () => {
  it('executes only the selected test files', async () => {
    const execute = vi.fn(async () => 0);
    const runner = createVitestRunner(execute);

    const result = await runner.run(
      [
        'src/cli.test.ts',
        'src/selection/select-tests.test.ts'
      ],
      process.cwd(),
    );

    expect(execute).toHaveBeenCalledOnce();

    expect(execute).toHaveBeenCalledWith(
      'npx',
      [
        '--no-install',
        'vitest',
        'run',
        'src/cli.test.ts',
        'src/selection/select-tests.test.ts'
      ],
      process.cwd()
    );

    expect(result).toEqual({ exitCode: 0 });
  });
});