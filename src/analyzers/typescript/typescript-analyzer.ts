import type { LanguageAnalyzer } from '../language-analyzer.js';
import { discoverRepositoryModules } from './typescript-dependencies.js';

export const typescriptAnalyzer: LanguageAnalyzer = {
  id: 'typescript',
  languages: ['typescript'],
  discoverDependencies: discoverRepositoryModules,
};
