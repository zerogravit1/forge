import { expect, it, describe } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ForgeConfig } from '../config/forge-config.js';
import type { GitChange } from '../changes/git-changes.js';
import { resolveTargetConfigs } from '../config/resolve-target-configs.js';
import { createValidationTargets } from '../validation/create-validation-targets.js';
import { planValidationTargets } from '../validation/plan-validation-targets.js';

describe.skipIf(process.env.FORGE_REGRESSION_BASELINE !== '1')('shared Java source regression', () => {
  it('#16 selects every consumer of a declared shared source, excluding unrelated tests and targets', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-shared-source-regression-'));

    async function write(path: string, source: string): Promise<void> {
      const file = join(repoRoot, path);
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, source);
    }

    try {
      const config: ForgeConfig = {
        version: '1.0.0',
        roots: {
          apps: {
            a: { path: 'liba', sources: ['src/main/java'], tests: ['src/test/java'] },
            b: { path: 'libb', sources: ['../liba/src/main/java'], tests: ['src/test/java'] },
            unrelated: { path: 'unrelated', sources: ['src/main/java'], tests: ['src/test/java'] },
          },
        },
        adapters: { java: { type: 'java' } },
        runners: { maven: { type: 'maven' } },
        targets: {
          apps: {
            a: { root: 'apps.a', adapter: ['java'], runner: ['maven'] },
            b: { root: 'apps.b', adapter: ['java'], runner: ['maven'] },
            unrelated: { root: 'apps.unrelated', adapter: ['java'], runner: ['maven'] },
          },
        },
      };
      const aTest = 'liba/src/test/java/a/ATest.java';
      const bTest = 'libb/src/test/java/b/BTest.java';
      const unrelatedTest = 'liba/src/test/java/a/UnrelatedTest.java';
      await write('liba/src/main/java/example/Shared.java', 'package example; public class Shared {}');
      await write(aTest, 'package a;\nimport example.Shared;\npublic class ATest { Shared value; }');
      await write(bTest, 'package b;\nimport example.Shared;\npublic class BTest { Shared value; }');
      await write(unrelatedTest, 'package a; public class UnrelatedTest {}');
      await write('unrelated/src/test/java/c/OtherTest.java', 'package c; public class OtherTest {}');

      const changes: GitChange[] = [{ status: 'modified', path: 'liba/src/main/java/example/Shared.java' }];
      const targets = createValidationTargets(config, resolveTargetConfigs(config));
      const b = targets.find((target) => target.id === 'apps.b');
      expect(b).toBeDefined();
      if (!b) {
        throw new Error('Fixture must contain target B');
      }

      // Establish that B's configured analyzer can already resolve the shared class.
      expect(await b.planSelection(changes, await b.discoverTestFiles(repoRoot), repoRoot)).toEqual({
        selectedTests: [bTest],
        unmappedChanges: [],
      });

      const result = await planValidationTargets(changes, targets, repoRoot);
      const selectedTargets = result.plans.map((plan) => plan.target.id).sort();
      const selectedTests = result.plans.flatMap((plan) => plan.selection.selectedTests).sort();

      expect.soft(selectedTargets).toEqual(['apps.a', 'apps.b']);
      expect.soft(selectedTargets).not.toContain('apps.unrelated');
      expect.soft(selectedTests).toEqual([aTest, bTest]);
      expect.soft(selectedTests).not.toContain(unrelatedTest);
      expect.soft(result.unmatchedChanges).toEqual([]);
      expect.soft(result.plans.flatMap((plan) => plan.selection.unmappedChanges)).toEqual([]);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
