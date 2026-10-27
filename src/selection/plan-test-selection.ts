import type { GitChange } from '../changes/git-changes.js';
import { discoverRepositoryModules } from '../analyzers/typescript/typescript-dependencies.js';
import { resolveTestDependencies } from '../graph/resolve-test-dependencies.js';
import { selectTests, type SelectionResult } from './select-tests.js';

export async function planTestSelection(
  changes: GitChange[],
  testFiles: string[],
  repoRoot: string,
): Promise<SelectionResult> {
  const modules = await discoverRepositoryModules(testFiles, repoRoot);
  const dependencies = resolveTestDependencies(testFiles, modules);

  return selectTests(changes, dependencies);
}
