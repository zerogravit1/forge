import { describe, expect, it } from 'vitest';

import { loadForgeConfig } from './load-forge-config.js';
import { resolveTargetConfigs } from './resolve-target-configs.js';
import type { ForgeConfig } from './forge-config.js';

describe('resolveTargetConfigs', () => {
  it('resolves namespaced valdiation targets', async () => {
    const config = await loadForgeConfig(process.cwd());

    const targets = resolveTargetConfigs(config);

    expect(targets).toEqual([
      expect.objectContaining({
        id: 'internal.forge-tests',
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

  it('rejects a target referencing an unknown root', () => {
    const config: ForgeConfig = {
      version: '1.0.0',
      roots: {},
      adapters: {},
      runners: {},
      targets: {
        examples: {
          'unknown-tests': {
            root: 'examples.unknown',
            adapter: [],
            runner: [],
          },
        },
      },
    };

    expect(() => resolveTargetConfigs(config)).toThrow('Unknown root: examples.unknown');
  });

  it('rejects a target referencing an unknown adapter', () => {
    const config: ForgeConfig = {
      version: '1.0.0',
      roots: {
        examples: {
          'java-orders': {
            path: 'examples/java-orders',
            sources: ['src/main/java'],
            tests: ['src/test/java'],
          },
        },
      },
      adapters: {},
      runners: {},
      targets: {
        examples: {
          'java-orders-tests': {
            root: 'examples.java-orders',
            adapter: ['java'],
            runner: [],
          },
        },
      },
    };

    expect(() => resolveTargetConfigs(config)).toThrow('Unknown adapter: java');
  });

  it('rejects a target referencing an unknown runner', () => {
    const config: ForgeConfig = {
      version: '1.0.0',
      roots: {
        examples: {
          'java-orders': {
            path: 'examples/java-orders',
            sources: ['src/main/java'],
            tests: ['src/test/java'],
          },
        },
      },
      adapters: {
        java: { type: 'java' },
      },
      runners: {},
      targets: {
        examples: {
          'java-orders-tests': {
            root: 'examples.java-orders',
            adapter: ['java'],
            runner: ['maven'],
          },
        },
      },
    };

    expect(() => resolveTargetConfigs(config)).toThrow('Unknown runner: maven');
  });

  it('rejects malformed root references', async () => {
    const config = await loadForgeConfig(process.cwd());

    const target = config.targets.examples?.['java-orders-tests'];
    if (!target) {
      throw new Error('Missing Java target fixture');
    }

    target.root = 'examples.java-orders.extra';

    expect(() => resolveTargetConfigs(config)).toThrow('Unknown root: examples.java-orders.extra');
  });
});
