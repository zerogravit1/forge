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
});
