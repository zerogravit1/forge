import type { GitChange } from '../changes/git-changes.js';
import type { TestDependency } from '../models/test-dependency.js';

export interface SelectionResult {
  selectedTests: string[];
  unmappedChanges: GitChange[];
}

export function selectTests(changedFiles: GitChange[], testDependencies: TestDependency[]): SelectionResult {
  const testFiles = testDependencies
    .filter((testDependency) => {
      const knownImpact = changedFiles.some(
        (change) => testDependency.testFile === change.path || testDependency.dependencies.includes(change.path),
      );

      const uncertainImpact = changedFiles.length > 0 && (testDependency.unresolvedImports?.length ?? 0) > 0;

      return knownImpact || uncertainImpact;
    })
    .map((testDependency) => testDependency.testFile);

  const unmappedChanges = changedFiles.filter(
    (change) =>
      !testDependencies.some(
        (testDependency) =>
          testDependency.testFile === change.path || testDependency.dependencies.includes(change.path),
      ),
  );

  return {
    selectedTests: testFiles,
    unmappedChanges,
  };
}
