import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import type { ForgeConfig } from '../config/forge-config.js';
import { resolveTargetConfigs } from '../config/resolve-target-configs.js';
import { createValidationTargets } from '../validation/create-validation-targets.js';

const execFileAsync = promisify(execFile);

describe.skipIf(process.env.FORGE_REGRESSION_BASELINE !== '1')('TypeScript target isolation regression', () => {
  it('#17 discovers and executes the configured package without substituting root or sibling tests', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-typescript-target-regression-'));
    const appRoot = join(repoRoot, 'packages/app');
    const appTest = 'packages/app/tests/App.test.ts';

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
        `export default { test: { include: ['tests/**/*.test.ts'], maxWorkers: 1,
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

      // Prove the package configuration and its test work before exercising Forge.
      await execFileAsync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run'], { cwd: appRoot });
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
      const [target] = createValidationTargets(config, resolveTargetConfigs(config));
      const discovered = await target.discoverTestFiles(repoRoot);

      expect.soft(discovered).toEqual([appTest]);
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
        expect(report).toMatchObject({ numTotalTests: 1, numPassedTests: 1, numFailedTests: 0 });
      }
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
