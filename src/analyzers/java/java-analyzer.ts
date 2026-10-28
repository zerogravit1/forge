import type { LanguageAnalyzer } from '../language-analyzer.js';
import { discoverJavaRepositoryModules } from './java-dependencies.js';

export function createJavaAnalyzer(sourceRoots: readonly string[]): LanguageAnalyzer {
  return {
    id: 'java',
    languages: ['java'],

    discoverDependencies: (testFiles, repoRoot) => discoverJavaRepositoryModules(testFiles, repoRoot, sourceRoots),
  };
}
