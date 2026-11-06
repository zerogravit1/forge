import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createJavaAnalyzer } from '../analyzers/java/java-analyzer.js';
import { planTestSelection } from '../selection/plan-test-selection.js';

describe.skipIf(process.env.FORGE_REGRESSION_BASELINE !== '1')('Java dependency regression baseline', () => {
  it('#15 selects static-import consumers while excluding unrelated tests', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'forge-static-import-'));
    const normalTest = 'src/test/java/example/NormalTest.java';
    const staticTest = 'src/test/java/example/StaticImportTest.java';
    const unrelatedTest = 'src/test/java/example/UnrelatedTest.java';

    try {
      await mkdir(join(repoRoot, 'src/main/java/example'), { recursive: true });
      await mkdir(join(repoRoot, 'src/test/java/example'), { recursive: true });
      await writeFile(
        join(repoRoot, 'src/main/java/example/Rules.java'),
        'package example; public class Rules { public static int value() { return 1; } }',
      );
      await writeFile(
        join(repoRoot, normalTest),
        `package example;
import example.Rules;
public class NormalTest { int actualValue() { return Rules.value(); } }`,
      );
      await writeFile(
        join(repoRoot, staticTest),
        `package example;
import static example.Rules.value;
public class StaticImportTest { int actualValue() { return value(); } }`,
      );
      await writeFile(join(repoRoot, unrelatedTest), 'package example; public class UnrelatedTest {}');

      const result = await planTestSelection(
        [{ status: 'modified', path: 'src/main/java/example/Rules.java' }],
        [normalTest, staticTest, unrelatedTest],
        repoRoot,
        createJavaAnalyzer(['src/main/java', 'src/test/java']),
      );

      // Both tests reference Rules; merely sharing its package is not a dependency.
      expect.soft(result.selectedTests).toEqual([normalTest, staticTest]);
      expect.soft(result.selectedTests).not.toContain(unrelatedTest);
      expect(result.unmappedChanges).toEqual([]);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
