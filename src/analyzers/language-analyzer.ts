import type { ModuleDependency } from '../models/module-dependency.js';

export interface LanguageAnalyzer {
  readonly id: string;
  readonly langyages: readonly string[];

  discoverDependencies(testFiles: string[], repoRoot: string): Promise<ModuleDependency[]>;
}
