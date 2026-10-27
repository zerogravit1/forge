import type { GitChange } from '../changes/git-changes.js';
import { resolveTestDependencies } from '../graph/resolve-test-dependencies.js';
import { selectTests, type SelectionResult } from './select-tests.js';

import { typescriptAnalyzer } from '../analyzers/typescript/typescript-analyzer.js';
import type { LanguageAnalyzer } from '../analyzers/language-analyzer.js';

export async function planTestSelection(
  changes: GitChange[],
  testFiles: string[],
  repoRoot: string,
  analyzer: LanguageAnalyzer = typescriptAnalyzer,
): Promise<SelectionResult> {
  const modules = await analyzer.discoverDependencies(testFiles, repoRoot);
  const dependencies = resolveTestDependencies(testFiles, modules);

  return selectTests(changes, dependencies);
}
