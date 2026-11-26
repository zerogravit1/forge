import { describe, expect, it } from 'vitest';

import { validateForgeConfig } from './load-forge-config.js';

describe('validateForgeConfig', () => {
  it('accepts a valid configuration', () => {
    const config = {
      version: '1.0.0',
      roots: {},
      adapters: {},
      runners: {},
      targets: {},
    };

    expect(validateForgeConfig(config)).toEqual(config);
  });

  it('rejects null configuration', () => {
    expect(() => validateForgeConfig(null)).toThrow('Invalid Forge configuration');
  });

  it('rejects configuration without a version', () => {
    expect(() => validateForgeConfig({})).toThrow('Invalid Forge configuration');
  });

  it('rejects unsupported configuration versions', () => {
    expect(() =>
      validateForgeConfig({
        version: '2.0.0',
        roots: {},
        adapters: {},
        runners: {},
        targets: {},
      }),
    ).toThrow('Unsupported Forge configuration version');
  });

  it('rejects invalid root definitions', () => {
    const config = {
      version: '1.0.0',
      roots: {
        internal: {
          forge: {
            path: 123,
            sources: ['src'],
            tests: ['src'],
          },
        },
      },
      adapters: {},
      runners: {},
      targets: {},
    };

    expect(() => validateForgeConfig(config)).toThrow('Invalid Forge configuration');
  });

  const configurationWithExecution = (execution: unknown) => ({
    version: '1.0.0',
    roots: {},
    adapters: {},
    runners: {},
    targets: {
      internal: {
        'forge-tests': {
          root: 'internal.forge',
          adapter: ['typescript'],
          runner: ['vitest'],
          execution,
        },
      },
    },
  });

  it.each([{}, { onUnmappedChanges: 'strict' }, { onUnmappedChanges: 'full-target' }])(
    'accepts target execution setting %j',
    (execution) => {
      const config = configurationWithExecution(execution);
      expect(validateForgeConfig(config)).toEqual(config);
    },
  );

  it.each([
    [null],
    [[]],
    ['full-target'],
    [{ onUnmappedChanges: 'whole-repository' }],
    [{ onUnmappedChanges: false }],
    [{ onUnmappedChanges: null }],
    [{ onUnmappedChange: 'full-target' }],
  ])('rejects invalid target execution setting %j', (execution) => {
    expect(() => validateForgeConfig(configurationWithExecution(execution))).toThrow(
      'Invalid Forge configuration: targets.internal.forge-tests.execution',
    );
  });
});
