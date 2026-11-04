import { describe, expect, it } from 'vitest';

import { loadForgeConfig } from './load-forge-config.js';
import { resolveTargetConfigs } from './resolve-target-configs.js';

describe('resolveTargetConfigs', () => {
  it('resolves namespaced valdiation targets', async () => {
    const config = await loadForgeConfig(process.cwd());

    const targets = resolveTargetConfigs(config);

    expect(targets).toEqual([
      expect.objectContaining({
        id: 'internal.forget-tests',
        projectRoot: '.',
        sourceRoots: ['src'],
        testRoots: ['src'],
        adapters: ['typescript'],
        runners: ['vitest'],
      }),
      expect.objectContaining({
        id: 'examples.java-orders-tests',
        projectRoot: 'examples/java-orders',
        sourceRoots: ['src/main/java'],
        testRoots: ['src/test/java'],
        adapters: ['java'],
        runners: ['maven'],
      }),
    ]);
  });
});
