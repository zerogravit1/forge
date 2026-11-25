import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

import { createVitestRunner } from './vitest-runner.js';
import { withTempRepository } from '../helpers/temp-repo.js';

describe('Vitest runner integration', () => {
  it('executes multiple selected files without including colliding paths', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-vitest-multiple-'));
    const appRoot = join(repoRoot, 'packages/app');

    const selectedTests = ['packages/app/tests/App.test.ts', 'packages/app/tests/Orders.test.ts'];

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
            name: 'app',
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
      expect(result.evidence).toMatchObject({ status: 'complete', unhandledErrorCount: 0 });
      if (!('expected' in result.evidence)) throw new Error('Expected a Vitest specification result');

      const expectedSpecifications = result.evidence.expected;
      const observedSpecifications = result.evidence.observed;
      expect(expectedSpecifications).toMatchObject([
        { file: 'tests/App.test.ts', project: 'app', kind: 'runtime' },
        { file: 'tests/Orders.test.ts', project: 'app', kind: 'runtime' },
      ]);
      expect(observedSpecifications).toHaveLength(2);
      for (const { id, file } of expectedSpecifications) {
        expect(observedSpecifications.find((specification) => specification.id === id)).toMatchObject({
          file,
          project: 'app',
          state: 'passed',
          cases: { passed: 1, failed: 0, skipped: 0, pending: 0 },
        });
      }

      const report: unknown = JSON.parse(await readFile(join(appRoot, 'app-results.json'), 'utf8'));

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

  it.each([
    {
      scenario: 'preserves an observed assertion failure and its nonzero exit',
      declaration: 'test',
      nativeOutcome: 'failed',
      failed: 1,
      skipped: 0,
      exitCode: 1,
      evidenceStatus: 'complete',
    },
    {
      scenario: 'records skipped-only execution as incomplete despite a zero exit',
      declaration: 'test.skip',
      nativeOutcome: 'skipped',
      failed: 0,
      skipped: 1,
      exitCode: 0,
      evidenceStatus: 'incomplete',
    },
  ])(
    '$scenario',
    async ({ declaration, nativeOutcome, failed, skipped, exitCode, evidenceStatus }) => {
      await withTempRepository('forge-vitest-evidence-', async (repo) => {
        await repo.linkNodeModules();
        await repo.write(
          'vitest.config.mjs',
          `export default {
          test: { maxWorkers: 1, reporters: ['json'], outputFile: 'vitest-results.json' }
        };`,
        );

        const testFile = 'tests/Expected.test.ts';
        const testTitle = 'deliberate failing assertion';
        await repo.write(
          testFile,
          `import { test, expect } from 'vitest';
         ${declaration}(${JSON.stringify(testTitle)}, () => expect(1).toBe(2));`,
        );

        const runner = createVitestRunner();
        const result = await runner.run([testFile], repo.root);

        // The fixture's own Vitest reporter corroborates the identity and case outcome.
        const report: unknown = JSON.parse(await readFile(repo.path('vitest-results.json'), 'utf8'));
        expect(report).toMatchObject({
          numTotalTests: 1,
          numPassedTests: 0,
          numFailedTests: failed,
          numPendingTests: skipped,
          testResults: [{ name: repo.path(testFile), assertionResults: [{ title: testTitle, status: nativeOutcome }] }],
        });

        expect(result.exitCode).toBe(exitCode);
        expect(result.evidence).toMatchObject({ status: evidenceStatus, unhandledErrorCount: 0 });
        if (!('expected' in result.evidence)) throw new Error('Expected a Vitest specification result');

        const [expected] = result.evidence.expected;
        expect(result.evidence.expected).toHaveLength(1);
        expect(expected).toMatchObject({ file: testFile, kind: 'runtime' });
        expect(result.evidence.observed).toMatchObject([
          { id: expected?.id, file: testFile, cases: { passed: 0, failed, skipped, pending: 0 } },
        ]);
        if (failed) {
          expect(result.evidence.observed[0]?.state).toBe('failed');
        }
      });
    },
    30_000,
  );

  it('preserves Vitest coverage threshold failures', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-vitest-coverage-'));
    const appRoot = join(repoRoot, 'packages/app');

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
            include: ['tests/**/*.test.ts'],
            maxWorkers: 1,
            coverage: {
              enabled: true,
              provider: 'v8',
              include: ['src/branch.ts'],
              reporter: ['text'],
              thresholds: {
                branches: 100
              }
            }
          }
        };`,
      );

      await write(
        'packages/app/src/branch.ts',
        `export function branch(flag: boolean): string {
          if (flag) return 'yes';
          return 'no';
        }`,
      );

      await write(
        'packages/app/tests/Branch.test.ts',
        `import { test, expect } from 'vitest';
         import { branch } from '../src/branch.ts';

         test('selected branch passes', () => {
          expect(branch(true)).toBe('yes');
         });`,
      );

      // Establish upstream behavior before testing Forge.
      const direct = spawnSync(
        process.execPath,
        [resolve('node_modules/vitest/vitest.mjs'), 'run', 'tests/Branch.test.ts'],
        {
          cwd: appRoot,
          encoding: 'utf8',
          timeout: 20_000,
        },
      );

      expect(direct.error).toBeUndefined();
      expect(direct.status, `${direct.stdout}\n${direct.stderr}`).toBe(1);
      expect(`${direct.stdout}\n${direct.stderr}`).toMatch(/coverage for branches/i);

      // Forge must preserve the upstream coverage failure.
      const runner = createVitestRunner('packages/app');

      const result = await runner.run(['packages/app/tests/Branch.test.ts'], repoRoot);

      expect(result.exitCode).toBe(1);
    } finally {
      await rm(repoRoot, { recursive: true });
    }
  }, 30_000);

  it('preserves Vitest typecheck failures', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-vitest-typechecking-'));
    const appRoot = join(repoRoot, 'packages/app');

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
            include: ['tests/**/*.test.ts'],
            maxWorkers: 1,
            typecheck: {
              enabled: true,
              include: ['tests/**/*.test.ts']
            }
          }
        };`,
      );

      await write(
        'packages/app/tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            noEmit: true,
            skipLibCheck: true,
          },
          include: ['tests/**/*.test.ts'],
        }),
      );

      await write(
        'packages/app/tests/Types.test.ts',
        `import { test, expect } from 'vitest';

         const value: string = 123;

         test('runtime passes', () => {
          expect(value).toBe(123);
         });`,
      );

      // Establish upstream behavior before testing Forge.
      const direct = spawnSync(
        process.execPath,
        [resolve('node_modules/vitest/vitest.mjs'), 'run', 'tests/Types.test.ts'],
        {
          cwd: appRoot,
          encoding: 'utf8',
          timeout: 20_000,
        },
      );

      expect(direct.error).toBeUndefined();
      expect(direct.status, `${direct.stdout}\n${direct.stderr}`).toBe(1);
      expect(`${direct.stdout}\n${direct.stderr}`).toMatch(/TS2322|not assignable to type/i);

      // Forge must preserve the upstream typecheck failure.
      const runner = createVitestRunner('packages/app');

      const result = await runner.run(['packages/app/tests/Types.test.ts'], repoRoot);

      expect(result.exitCode).toBe(1);
      expect(result.evidence).toMatchObject({ status: 'complete' });
      if (!('expected' in result.evidence)) throw new Error('Expected a Vitest specification result');

      const { expected, observed } = result.evidence;
      expect(expected).toHaveLength(2);
      expect(observed).toHaveLength(2);
      expect(new Set(expected.map(({ id }) => id)).size).toBe(2);

      const outcomes = expected.map(({ id, file, kind }) => ({
        file,
        kind,
        state: observed.find((specification) => specification.id === id)?.state,
      }));
      expect(outcomes).toEqual(
        expect.arrayContaining([
          { file: 'tests/Types.test.ts', kind: 'runtime', state: 'passed' },
          { file: 'tests/Types.test.ts', kind: 'typecheck', state: 'failed' },
        ]),
      );
    } finally {
      await rm(repoRoot, { recursive: true });
    }
  }, 30_000);

  it('includes untested source files in coverage thresholds', async () => {
    await withTempRepository('forge-vitest-uncovered', async (repo) => {
      await repo.linkNodeModules();

      const appRoot = repo.path('packages/app');

      await repo.write(
        'packages/app/vitest.config.mjs',
        `export default {
          test: {
            include: ['tests/**/*.test.ts'],
            maxWorkers: 1,
            coverage: {
              enabled: true,
              provider: 'v8',
              include: ['src/**/*.ts'],
              reporter: ['text'],
              thresholds: {
                lines: 100
              }
            }
          }
        };`,
      );

      await repo.write('packages/app/src/covered.ts', `export const covered = () => 'covered';`);

      await repo.write('packages/app/src/uncovered.ts', `export const covered = () => 'uncovered';`);

      await repo.write(
        'packages/app/tests/Covered.test.ts',
        `import { test, expect } from 'vitest';
         import { covered } from '../src/covered.ts';
         
         test('covered function passes', () => {
          expect(covered()).toBe('covered');
         });`,
      );

      // Direct Vitest must count the untested source file.
      const direct = spawnSync(
        process.execPath,
        [resolve('node_modules/vitest/vitest.mjs'), 'run', 'tests/Covered.test.ts'],
        {
          cwd: appRoot,
          encoding: 'utf8',
          timeout: 20_000,
        },
      );

      const directOutput = stripVTControlCharacters(`${direct.stdout}\n${direct.stderr}`);

      expect(direct.error).toBeUndefined();
      expect(direct.status, directOutput).toBe(1);
      expect(directOutput).toContain('uncovered.ts');
      expect(directOutput).toMatch(/coverage for lines/i);
      expect(directOutput).toMatch(/Tests\s+1 passed/);

      // Forge must report the same coverage failure.
      const runner = createVitestRunner('packages/app');

      const result = await runner.run(['packages/app/tests/Covered.test.ts'], repo.root);

      expect(result.exitCode).toBe(1);
    });
  }, 30_000);

  //   const repoRoot = await mkdtemp(join(tmpdir(), 'forge-vitest-uncovered-'));
  //   const appRoot = join(repoRoot, 'packages/app');

  //   async function write(path: string, content: string): Promise<void> {
  //     const file = join(repoRoot, path);
  //     await mkdir(join(file, '..'), { recursive: true });
  //     await writeFile(file, content);
  //   }

  //   try {
  //     await symlink(resolve('node_modules'), join(repoRoot, 'node_modules'), 'dir');

  //     await write(
  //       'packages/app/vitest.config.mjs',
  //       `export default {
  //         test: {
  //           include: ['tests/**/*.test.ts'],
  //           maxWorkers: 1,
  //           coverage: {
  //             enabled: true,
  //             provider: 'v8',
  //             include: ['src/**/*.ts'],
  //             reporter: ['text'],
  //             thresholds: {
  //               lines: 100
  //             }
  //           }
  //         }
  //       };`,
  //     );

  //     await write(
  //       'packages/app/src/covered.ts',
  //       `export const covered = () => 'covered';`,
  //     );

  //     await write(
  //       'packages/app/src/uncovered.ts',
  //       `export const covered = () => 'uncovered';`,
  //     );

  //     await write(
  //       'packages/app/tests/Covered.test.ts',
  //       `import { test, expect } from 'vitest';
  //        import { covered } from '../src/covered.ts';

  //        test('covered function passes', () => {
  //         expect(covered()).toBe('covered');
  //        });`
  //     );

  //     // Direct Vitest must count the untested source file.
  //     const direct = spawnSync(
  //       process.execPath,
  //       [resolve('node_modules/vitest/vitest.mjs'), 'run', 'tests/Covered.Test.ts'],
  //       {
  //         cwd: appRoot,
  //         encoding: 'utf8',
  //         timeout: 20_000,
  //       },
  //     );

  //     const directOutput = `${direct.stdout}\n${direct.stderr}`;

  //     expect(direct.error).toBeUndefined();
  //     expect(direct.status, directOutput).toBe(1);
  //     expect(directOutput).toContain('uncovered.ts');
  //     expect(directOutput).toMatch(/coverage for lines/i);

  //     // Forge must report the same coverage failure.
  //     const runner = createVitestRunner('packages/app');

  //     const result = await runner.run(
  //       ['packages/app/tests/Covered.test.ts'],
  //       repoRoot,
  //     );

  //     expect(result.exitCode).toBe(1);
  //   } finally {
  //     await rm(repoRoot, { recursive: true, force: true });
  //   }
  // }, 30_000);
});
