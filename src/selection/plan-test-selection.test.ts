import { describe, expect, it, vi } from 'vitest';

import type { LanguageAnalyzer } from '../analyzers/language-analyzer.js';
import { planTestSelection } from './plan-test-selection.js';

describe('planTestSelection', () => {
  it('uses the provided language analyzer to select impacted tests', async () => {
    const discoverDependencies = vi.fn(async () => [
      {
        file: 'src/OrderServiceTest.java',
        dependencies: ['src/OrderService.java'],
      },
      {
        file: 'src/OrderService.java',
        dependencies: [],
      },
    ]);

    const analyzer: LanguageAnalyzer = {
      id: 'java',
      languages: ['java'],
      discoverDependencies,
    };

    const result = await planTestSelection(
      [{ status: 'modified', path: 'src/OrderService.java' }],
      ['src/OrderServiceTest.java'],
      '/repo',
      analyzer,
    );

    expect(result).toEqual({
      selectedTests: ['src/OrderServiceTest.java'],
      unmappedChanges: [],
    });

    expect(discoverDependencies).toHaveBeenCalledWith(['src/OrderServiceTest.java'], '/repo');
  });
});
