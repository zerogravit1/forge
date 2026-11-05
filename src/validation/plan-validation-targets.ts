import type { GitChange } from '../changes/git-changes.js';
import type { SelectionResult } from '../selection/select-tests.js';
import type { ValidationTarget } from './validation-target.js';

export interface TargetPlan {
  target: ValidationTarget;
  selection: SelectionResult;
}

export async function planValidationTargets(
  changes: GitChange[],
  targets: readonly ValidationTarget[],
  repoRoot: string,
) {
  const configChanged = changes.some(
    (change) => change.path === 'forge.config.json' || change.previousPath === 'forge.config.json',
  );

  const unmatchedChanges = changes.filter(
    (change) =>
      change.path !== 'forge.config.json' &&
      change.previousPath !== 'forge.config.json' &&
      !targets.some((target) => target.includesChange(change)),
  );

  const plans: TargetPlan[] = [];

  for (const target of targets) {
    const targetChanges = changes.filter((change) => target.includesChange(change));

    if (!configChanged && targetChanges.length === 0) {
      continue;
    }

    const testFiles = await target.discoverTestFiles(repoRoot);

    const selection: SelectionResult = configChanged
      ? {
          selectedTests: testFiles,
          unmappedChanges: [],
        }
      : await target.planSelection(targetChanges, testFiles, repoRoot);

    plans.push({ target, selection });
  }

  return { plans, unmatchedChanges };
}
