import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import type { ForgeConfig } from '../config/forge-config.js';
import { resolveTargetConfigs } from '../config/resolve-target-configs.js';
import { createValidationTargets } from '../validation/create-validation-targets.js';
import { createVitestRunner } from '../execution/vitest-runner.js';

import { withTempRepository } from '../helpers/temp-repo.js';
import { discoverVitestTestFiles } from '../discovery/vitest-test-files.js';

const execFileAsync = promisify(execFile);

describe('TypeScript target isolation regression', () => {
  it('#17 discovers and executes the configured package without substituting root or sibling tests', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-typescript-target-regression-'));
    const appRoot = join(repoRoot, 'packages/app');
    const appTest = 'packages/app/tests/App.test.ts';
    const unexpectedTest = 'packages/app/src/Unexpected.test.ts';

    async function write(path: string, source: string): Promise<void> {
      const file = join(repoRoot, path);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, source);
    }

    try {
      await symlink(resolve('node_modules'), join(repoRoot, 'node_modules'), 'dir');
      await write(
        'vitest.config.mjs',
        `export default { test: { include: ['root-tests/**/*.test.ts'], maxWorkers: 1,
          reporters: ['json'], outputFile: 'root-results.json' } };`,
      );
      await write(
        'packages/app/vitest.config.mjs',
        `export default { test: { include: ['tests/**/*.test.ts', 'src/**/*.test.ts'], maxWorkers: 1,
          reporters: ['json'], outputFile: 'app-results.json' } };`,
      );
      await write(
        'root-tests/Unrelated.test.ts',
        `import { test, expect } from 'vitest'; test('root test', () => expect(true).toBe(true));`,
      );
      await write(appTest, `import { test, expect } from 'vitest'; test('app test', () => expect(true).toBe(true));`);
      await write(
        'packages/sibling/tests/Other.test.ts',
        `import { test, expect } from 'vitest'; test('sibling test', () => expect(true).toBe(true));`,
      );

      await write(
        unexpectedTest,
        `import { test, expect } from 'vitest'; test('unconfigured test must not run', () => expect(true).toBe(false));`,
      );

      // Prove the package configuration and its test work before exercising Forge.
      await execFileAsync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', 'tests/App.test.ts'], {
        cwd: appRoot,
      });
      const controlReport: unknown = JSON.parse(await readFile(join(appRoot, 'app-results.json'), 'utf8'));
      expect(controlReport).toMatchObject({ numTotalTests: 1, numPassedTests: 1, numFailedTests: 0 });
      await rm(join(appRoot, 'app-results.json'));

      const config: ForgeConfig = {
        version: '1.0.0',
        roots: { apps: { app: { path: 'packages/app', sources: ['src'], tests: ['tests'] } } },
        adapters: { ts: { type: 'typescript' } },
        runners: { vitest: { type: 'vitest' } },
        targets: { apps: { tests: { root: 'apps.app', adapter: ['ts'], runner: ['vitest'] } } },
      };
      await write('forge.config.json', JSON.stringify(config));
      const [target] = createValidationTargets(config, resolveTargetConfigs(config));
      const discovered = await target.discoverTestFiles(repoRoot);

      expect.soft(discovered).toEqual([appTest]);
      expect.soft(discovered).not.toContain(unexpectedTest);
      expect.soft(discovered).not.toContain('root-tests/Unrelated.test.ts');
      expect.soft(discovered).not.toContain('packages/sibling/tests/Other.test.ts');

      const result = await target.runner.run(discovered, repoRoot);
      expect.soft(result.exitCode).toBe(0);
      const appFiles = await readdir(appRoot);
      expect.soft(appFiles, 'the configured package must actually execute').toContain('app-results.json');
      expect
        .soft(await readdir(repoRoot), 'root tests must not substitute for the package')
        .not.toContain('root-results.json');

      if (appFiles.includes('app-results.json')) {
        const report: unknown = JSON.parse(await readFile(join(appRoot, 'app-results.json'), 'utf8'));
        expect(report).toMatchObject({
          numTotalTests: 1,
          numPassedTests: 1,
          numFailedTests: 0,
          testResults: [
            expect.objectContaining({
              name: expect.stringMatching(/[/\\]tests[/\\]App\.test\.ts$/),
            }),
          ],
        });
      }

      // added code for regression validation

      // Now make the configured package test fail.
      await write(
        appTest,
        `import { test, expect } from 'vitest';
         test('app test', () => expect(true).toBe(false));`,
      );

      // Remove previous reports so we can verify fresh execution
      await rm(join(appRoot, 'app-results.json'), { force: true });
      await rm(join(repoRoot, 'root-results.json'), { force: true });

      // Exercise Forge's actual CLI orchestration with a controlled change.
      const cliUrl = pathToFileURL(resolve('src/cli.ts')).href;

      const script = `
        import { main } from ${JSON.stringify(cliUrl)};

        const exitCode = await main(
          ['run'],
          async () => [{ status: 'modified', path: 'forge.config.json' }]
        );
        
        process.exitCode = exitCode;
      `;

      const forgeRun = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 20_000,
      });

      expect(forgeRun.error).toBeUndefined();
      expect.soft(forgeRun.status, `Forge output:\n${forgeRun.stdout}\n${forgeRun.stderr}`).toBe(1);

      // Confirm that the actual failing package test executed.
      const filesAfterFailure = await readdir(appRoot);

      expect.soft(filesAfterFailure).toContain('app-results.json');

      if (filesAfterFailure.includes('app-results.json')) {
        const report: unknown = JSON.parse(await readFile(join(appRoot, 'app-results.json'), 'utf8'));

        expect(report).toMatchObject({
          numTotalTests: 1,
          numPassedTests: 0,
          numFailedTests: 1,
          testResults: [
            expect.objectContaining({
              name: expect.stringMatching(/[/\\]tests[/\\]App\.test\.ts$/),
            }),
          ],
        });
      }

      expect(await readdir(repoRoot)).not.toContain('root-results.json');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it('#17 named Vitest projects must execute failing package tests', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-named-vitest-regression-'));
    const appRoot = join(repoRoot, 'packages/app');
    const appTest = 'packages/app/tests/App.test.ts';

    async function write(path: string, source: string): Promise<void> {
      const file = join(repoRoot, path);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, source);
    }

    try {
      await symlink(resolve('node_modules'), join(repoRoot, 'node_modules'), 'dir');

      // a named Vitest project with deliberately failing test.
      await write(
        'packages/app/vitest.config.mjs',
        `export default {
          test: {
            name: 'app',
            include: ['tests/**/*.test.ts'],
            maxWorkers: 1,
            reporters: ['json'],
            outputFile: 'app-results.json'
          }
        };`,
      );

      await write(
        appTest,
        `import { test, expect } from 'vitest';
         test('named app failure', () => expect(true).toBe(false));`,
      );

      const config: ForgeConfig = {
        version: '1.0.0',
        roots: {
          apps: {
            app: {
              path: 'packages/app',
              sources: ['src'],
              tests: ['tests'],
            },
          },
        },
        adapters: { ts: { type: 'typescript' } },
        runners: { vitest: { type: 'vitest' } },
        targets: {
          apps: {
            tests: {
              root: 'apps.app',
              adapter: ['ts'],
              runner: ['vitest'],
            },
          },
        },
      };

      await write('forge.config.json', JSON.stringify(config));

      const [target] = createValidationTargets(config, resolveTargetConfigs(config));

      // Discovery must return the actual repository-relative path.
      const discovered = await target.discoverTestFiles(repoRoot);

      expect.soft(discovered).toEqual([appTest]);

      // Exercise the real Forge CLI, not just the runner.
      const cliUrl = pathToFileURL(resolve('src/cli.ts')).href;

      const script = `
        import { main } from ${JSON.stringify(cliUrl)};

        const changes = [
          {
            status: 'modified',
            path: 'forge.config.json',
          },
        ];

        const exitCode = await main(
          ['run'],
          async () => changes
        );

        process.exitCode = exitCode;
      `;

      const forgeRun = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 20_000,
      });

      expect(forgeRun.error).toBeUndefined();

      expect.soft(forgeRun.status, `Forge output:\n${forgeRun.stdout}\n${forgeRun.stderr}`).toBe(1);

      // Confirm that the named project's failing test actually executed.
      const appFiles = await readdir(appRoot);

      expect.soft(appFiles).toContain('app-results.json');

      if (appFiles.includes('app-results.json')) {
        const report: unknown = JSON.parse(await readFile(join(appRoot, 'app-results.json'), 'utf8'));

        expect(report).toMatchObject({
          numTotalTests: 1,
          numPassedTests: 0,
          numFailedTests: 1,
          testResults: [
            expect.objectContaining({
              name: expect.stringMatching(/[/\\]tests[/\\]App\.test\.ts$/),
            }),
          ],
        });
      }
    } finally {
      await rm(repoRoot, { recursive: true });
    }
  }, 30_000);

  it('#17 executes only the selected file when Vitest paths collide', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-vitest-path-collision-'));
    const appRoot = join(repoRoot, 'packages/app');

    const selectedTest = 'packages/app/tests/App.test.ts';
    const excludedTest = 'packages/app/src/tests/App.test.ts';

    async function write(path: string, source: string): Promise<void> {
      const file = join(repoRoot, path);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, source);
    }

    try {
      await symlink(resolve('node_modules'), join(repoRoot, 'node_modules'), 'dir');

      // Vitest is allowed to discover both directories.
      await write(
        'packages/app/vitest.config.mjs',
        `export default {
          test: {
            include: [
              'tests/**/*.test.ts',
              'src/tests/**/*.test.ts',
              'src/tests/**/*.test.tsx'
            ],
            maxWorkers: 1,
            reporters: ['json'],
            outputFile: 'app-results.json'
          }
         };`,
      );

      // The selected test passes.
      await write(
        selectedTest,
        `import { test, expect } from 'vitest';
         test('selected app test', () => expect(true).toBe(true));`,
      );

      // The excluded test fails if accuidentally executed.
      await write(
        excludedTest,
        `import { test, expect } from 'vitest';
         test('excluded app test', () => expect(true).toBe(false));`,
      );

      await write(
        'packages/app/src/tests/App.test.tsx',
        `import { test, expect } from 'vitest';
         test('excluded tsx app test', () => expect(true).toBe(false));
        `,
      );

      const config: ForgeConfig = {
        version: '1.0.0',
        roots: {
          apps: {
            app: {
              path: 'packages/app',
              sources: ['src'],
              tests: ['tests'],
            },
          },
        },
        adapters: { ts: { type: 'typescript' } },
        runners: { vitest: { type: 'vitest' } },
        targets: {
          apps: {
            tests: {
              root: 'apps.app',
              adapter: ['ts'],
              runner: ['vitest'],
            },
          },
        },
      };

      const [target] = createValidationTargets(config, resolveTargetConfigs(config));

      // Discovery should only include the configured test root.
      const discovered = await target.discoverTestFiles(repoRoot);

      expect(discovered).toEqual([selectedTest]);
      expect(discovered).not.toContain(excludedTest);

      // Execute the selected files using the real vitest runner.
      const result = await target.runner.run(discovered, repoRoot);

      expect.soft(result.exitCode).toBe(0);

      // Inspect the actual execution report, not just the exit code.
      const report: unknown = JSON.parse(await readFile(join(appRoot, 'app-results.json'), 'utf8'));

      expect(report).toMatchObject({
        numTotalTestSuites: 1,
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        testResults: [
          expect.objectContaining({
            name: expect.stringMatching(/[/\\]packages[/\\]app[/\\]tests[/\\]App\.test\.ts$/),
          }),
        ],
      });
    } finally {
      await rm(repoRoot, { recursive: true });
    }
  }, 30_000);

  it('#17 discovers tests through a symlinked project root', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-symlinked-root-'));

    const appRoot = join(repoRoot, 'packages/app');
    const realTest = join(repoRoot, 'real/app/tests/App.test.ts');
    const configuredTest = 'packages/app/tests/App.test.ts';

    async function write(path: string, content: string): Promise<void> {
      const file = join(repoRoot, path);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, content);
    }

    try {
      // Allow the temporary project to use FOrge's installed Vitest.
      await symlink(resolve('node_modules'), join(repoRoot, 'node_modules'), 'dir');

      // Create the actual project first.
      await write(
        'real/app/vitest.config.mjs',
        `export default {
          test: {
            include: ['tests/**/*.test.ts'],
            maxWorkers: 1,
            reporters: ['json'],
            outputFile: 'app-results.json'
          }
        };`,
      );

      await write(
        'real/app/tests/App.test.ts',
        `import { test, expect } from 'vitest';
         test('app failure', () => expect(true).toBe(false));`,
      );

      // Expose the real project through the configured package path.
      await mkdir(join(repoRoot, 'packages'), { recursive: true });
      await symlink('../real/app', appRoot, 'dir');

      // Establish that upstream Vitest discovers the test.
      const direct = spawnSync(
        process.execPath,
        [resolve('node_modules/vitest/vitest.mjs'), 'list', '--filesOnly', '--json'],
        {
          cwd: appRoot,
          encoding: 'utf8',
          timeout: 20_000,
        },
      );

      expect(direct.error).toBeUndefined();
      expect(direct.status, `${direct.stdout}\n${direct.stderr}`).toBe(0);
      expect(direct.stdout).toContain(realTest);

      // Forge is configured to access the project through the symlink.
      const config: ForgeConfig = {
        version: '1.0.0',
        roots: {
          apps: {
            app: {
              path: 'packages/app',
              sources: ['src'],
              tests: ['tests'],
            },
          },
        },
        adapters: { ts: { type: 'typescript' } },
        runners: { vitest: { type: 'vitest' } },
        targets: {
          apps: {
            tests: {
              root: 'apps.app',
              adapter: ['ts'],
              runner: ['vitest'],
            },
          },
        },
      };

      const [target] = createValidationTargets(config, resolveTargetConfigs(config));

      const discovered = await target.discoverTestFiles(repoRoot);

      // Forge should preserve the configured repository-relative identity.
      expect(discovered).toEqual([configuredTest]);

      const result = await target.runner.run(discovered, repoRoot);

      expect(result.exitCode).toBe(1);

      const report: unknown = JSON.parse(await readFile(join(repoRoot, 'real/app/app-results.json'), 'utf8'));

      expect(report).toMatchObject({
        numTotalTestSuites: 1,
        numTotalTests: 1,
        numPassedTests: 0,
        numFailedTests: 1,
        testResults: [
          expect.objectContaining({
            name: expect.stringMatching(/[/\\]real[/\\]app[/\\]tests[/\\]App\.test\.ts$/),
          }),
        ],
      });
    } finally {
      await rm(repoRoot, { recursive: true });
    }
  }, 30_000);

  it('#17 preserves symlinked test-directory identity', async () => {
    await withTempRepository('forge-symlinked-tests-', async (repo) => {
      await repo.linkNodeModules();

      await repo.write(
        'packages/app/vitest.config.mjs',
        `export default {
          test: {
            include: ['tests/**/*.test.ts'],
            maxWorkers: 1,
            reporters: ['json'],
            outputFile: 'app-results.json'
          }
        };`,
      );

      await repo.write(
        'packages/app/real-tests/Example.test.ts',
        `import { test, expect } from 'vitest';
         test('example', () => expect(true).toBe(false));`,
      );

      await symlink('real-tests', repo.path('packages/app/tests'), 'dir');

      // Prove Vitest discovers the symlink alias.
      const direct = spawnSync(
        process.execPath,
        [resolve('node_modules/vitest/vitest.mjs'), 'list', '--filesOnly', '--json'],
        {
          cwd: repo.path('packages/app'),
          encoding: 'utf8',
          timeout: 20_000,
        },
      );

      expect(direct.error).toBeUndefined();
      expect(direct.status, `${direct.stdout}\n${direct.stderr}`).toBe(0);

      const listed = JSON.parse(direct.stdout) as Array<{ file: string }>;

      expect(listed.map(({ file }) => file)).toContain(repo.path('packages/app/tests/Example.test.ts'));

      // Forge must preserve the identity reported by Vitest.
      const discovered = await discoverVitestTestFiles(repo.root, 'packages/app', ['tests']);

      expect(discovered).toEqual(['packages/app/tests/Example.test.ts']);

      const runner = createVitestRunner('packages/app');
      const result = await runner.run(discovered, repo.root);

      expect(result.exitCode).toBe(1);

      const report: unknown = JSON.parse(await readFile(repo.path('packages/app/app-results.json'), 'utf8'));

      expect(report).toMatchObject({
        numTotalTestSuites: 1,
        numTotalTests: 1,
        numPassedTests: 0,
        numFailedTests: 1,
        testResults: [
          expect.objectContaining({
            status: 'failed',
          }),
        ],
      });
    });
  }, 30_000);
});
