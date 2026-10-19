import type { GitChange } from '../changes/git-changes.js';

export interface TestDependency {
  testFile: string;
  dependencies: string[];
}

export function selectTests(
  changedFiles: GitChange[],
  testDependencies: TestDependency[],
): string[] {
  const testFiles = testDependencies
    .filter((testDependency) =>
      changedFiles.some((change) =>
        testDependency.dependencies.includes(change.path),
      ),
    )
    .map((testDependency) => testDependency.testFile);

  return testFiles;
}