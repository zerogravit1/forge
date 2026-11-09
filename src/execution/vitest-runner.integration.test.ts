import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm , symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createVitestRunner } from './vitest-runner.js';

describe('Vitest runner integration', () => {
  it('executes multiple selected files without including colliding paths', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-vitest-multiple-'));
    const appRoot = join(repoRoot, 'packages/app');

    const selectedTests = [
      'packages/app/tests/App.test.ts',
      'packages/app/tests/Orders.test.ts',
    ];

    async function write(path: string, content: string): Promise<void> {
      const file = join(repoRoot, path);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, content);
    }

    try {
      await symlink(resolve('node_modules'), join(repoRoot, 'node_modules'), 'dir');

      await write(
        'packages/app/vitest.config.mjs',
        `export default {
          test: {
            include: [
              'tests/**/*.test.ts',
              'src/tests/**/*.test.ts'
            ],
            maxWorkers: 1,
            reporters: ['json'],
            outputFile: 'app-results.json'
          }
        };`,
      );

      await write(
        selectedTests[0],
        `import { test, expect } from 'vitest';
         test('selected app test', () => expect(true).toBe(true));`,
      );

      await write(
        selectedTests[1],
        `import { test, expect } from 'vitest';
         test('selected orders test', () => expect(true).toBe(true));`,
      );

      // Must not execute even though its filename collides.
      await write(
        'packages/app/src/tests/App.test.ts',
        `import { test, expect } from 'vitest';
         test('excluded app test', () => expect(true).toBe(false));`,
      );

      const runner = createVitestRunner('packages/app');
      const result = await runner.run(selectedTests, repoRoot);

      expect.soft(result.exitCode).toBe(0);

      const report: unknown = JSON.parse(
        await readFile(join(appRoot, 'app-results.json'), 'utf8'),
      );

      expect(report).toMatchObject({
        numTotalTestSuites: 2,
        numTotalTests: 2,
        numPassedTests: 2,
        numFailedTests: 0,
        testResults: expect.arrayContaining([
          expect.objectContaining({
            name: resolve(appRoot, 'tests/App.test.ts'),
          }),
          expect.objectContaining({
            name: resolve(appRoot, 'tests/Orders.test.ts'),
          }),
        ]),
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
