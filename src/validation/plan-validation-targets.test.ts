import { describe, expect, it, vi } from 'vitest';

import type { GitChange } from '../changes/git-changes.js';
import type { ValidationTarget } from './validation-target.js';
import { planValidationTargets } from './plan-validation-targets.js';

function createTarget(id: string, pathPrefix: string, testFile: string): ValidationTarget {
  return {
    id,

    includesChange: (change) => change.path.startsWith(pathPrefix),

    discoverTestFiles: vi.fn(async () => [testFile]),

    planSelection: vi.fn(async () => ({
      selectedTests: [],
      unmappedChanges: [],
    })),

    runner: {
      id: 'test-runner',
      run: vi.fn(async () => ({ exitCode: 0 })),
    },
  };
}

function createTargets() {
  const vitestTarget = createTarget('typescript', 'src/', 'src/cli.test.ts');

  const javaTarget = createTarget(
    'java',
    'examples/java-orders/',
    'examples/java-orders/src/test/java/com/forge/orders/OrderServiceTest.java',
  );

  return { vitestTarget, javaTarget };
}

describe('planValidationTargets', () => {
  it('selects all tests when Forge configuration changes', async () => {
    const { vitestTarget, javaTarget } = createTargets();

    const changes: GitChange[] = [{ status: 'modified', path: 'forge.config.json' }];

    const result = await planValidationTargets(changes, [vitestTarget, javaTarget], process.cwd());

    expect(result.unmatchedChanges).toEqual([]);
    expect(result.plans).toHaveLength(2);

    expect(result.plans[0]?.selection.selectedTests).toEqual(['src/cli.test.ts']);

    expect(result.plans[1]?.selection.selectedTests).toEqual([
      'examples/java-orders/src/test/java/com/forge/orders/OrderServiceTest.java',
    ]);

    expect(vitestTarget.planSelection).not.toHaveBeenCalled();
    expect(javaTarget.planSelection).not.toHaveBeenCalled();
  });

  it('preserves unrelated unmatched changes during full validation', async () => {
    const { vitestTarget, javaTarget } = createTargets();

    const changes: GitChange[] = [
      { status: 'modified', path: 'forge.config.json' },
      { status: 'added', path: 'unknown/file.txt' },
    ];

    const result = await planValidationTargets(changes, [vitestTarget, javaTarget], process.cwd());

    expect(result.unmatchedChanges).toEqual([{ status: 'added', path: 'unknown/file.txt' }]);

    expect(result.plans).toHaveLength(2);

    expect(result.plans[0]?.selection.selectedTests).toEqual(['src/cli.test.ts']);

    expect(result.plans[1]?.selection.selectedTests).toEqual([
      'examples/java-orders/src/test/java/com/forge/orders/OrderServiceTest.java',
    ]);

    expect(vitestTarget.planSelection).not.toHaveBeenCalled();
    expect(javaTarget.planSelection).not.toHaveBeenCalled();
  });
});
