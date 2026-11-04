import type { GitChange } from '../changes/git-changes.js';
import type { SelectionResult } from '../selection/select-tests.js';
import type { TestRunner } from '../execution/test-runner.js';

export interface ValidationTarget {
  readonly id: string;

  includesChange(change: GitChange): boolean;

  discoverTestFiles(repoRoot: string): Promise<string[]>;

  planSelection(changes: GitChange[], testFiles: string[], repoRoot: string): Promise<SelectionResult>;

  readonly runner: TestRunner;
}
