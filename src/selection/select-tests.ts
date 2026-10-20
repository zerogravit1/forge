import type { GitChange } from '../changes/git-changes.js';

export interface TestDependency {
  testFile: string;
  dependencies: string[];
}

export interface SelectionResult {
  selectedTests: string[];
  unmappedChanges: GitChange[];
}

export function selectTests(changedFiles: GitChange[], testDependencies: TestDependency[]): SelectionResult {
  const testFiles = testDependencies
    .filter((testDependency) =>
      changedFiles.some(
        (change) => testDependency.testFile === change.path || testDependency.dependencies.includes(change.path),
      ),
    )
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
