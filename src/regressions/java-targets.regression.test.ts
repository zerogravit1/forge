import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ForgeConfig } from '../config/forge-config.js';
import { resolveTargetConfigs } from '../config/resolve-target-configs.js';
import { createValidationTargets } from '../validation/create-validation-targets.js';

function createJavaTarget(path: string, tests = ['src/test/java']) {
  const config: ForgeConfig = {
    version: '1.0.0',
    roots: { projects: { app: { path, sources: ['src/main/java'], tests } } },
    adapters: { java: { type: 'java' } },
    runners: { maven: { type: 'maven' } },
    targets: { projects: { tests: { root: 'projects.app', adapter: ['java'], runner: ['maven'] } } },
  };
  const [target] = createValidationTargets(config, resolveTargetConfigs(config));

  if (!target) {
    throw new Error('Expected one configured Java target');
  }

  return target;
}

describe.skipIf(process.env.FORGE_REGRESSION_BASELINE !== '1')('Java target regression baseline', () => {
  it('#11 discovers configured Java test roots and excludes the unconfigured default directory', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-custom-test-root-'));
    const configuredTest = 'app/tests/example/AppTest.java';
    const unconfiguredTest = 'app/src/test/java/example/UnrelatedTest.java';

    try {
      for (const [file, className] of [
        [configuredTest, 'AppTest'],
        [unconfiguredTest, 'UnrelatedTest'],
      ] as const) {
        await mkdir(join(repoRoot, file, '..'), { recursive: true });
        await writeFile(join(repoRoot, file), `package example; public class ${className} {}`);
      }

      const target = createJavaTarget('app', ['tests']);
      const testFiles = await target.discoverTestFiles(repoRoot);

      expect.soft(testFiles).toEqual([configuredTest]);
      expect(testFiles).not.toContain(unconfiguredTest);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('#12 matches Git-relative Java paths when the configured project root is dot', () => {
    const rootTarget = createJavaTarget('.');
    const nestedTarget = createJavaTarget('app');
    const sourcePath = 'src/main/java/example/App.java';
    const testPath = 'src/test/java/example/AppTest.java';

    // A conventional nested root is a control; directory names must not match by substring.
    expect(nestedTarget.includesChange({ status: 'modified', path: `app/${sourcePath}` })).toBe(true);
    expect(nestedTarget.includesChange({ status: 'modified', path: `application/${sourcePath}` })).toBe(false);

    expect.soft(rootTarget.includesChange({ status: 'modified', path: sourcePath })).toBe(true);
    expect(rootTarget.includesChange({ status: 'modified', path: testPath })).toBe(true);
  });
});
