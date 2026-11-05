import { describe, expect, it } from 'vitest';

import { loadForgeConfig } from '../config/load-forge-config.js';
import { resolveTargetConfigs } from '../config/resolve-target-configs.js';
import { createValidationTargets } from './create-validation-targets.js';

describe('createValidationTargets', () => {
  it('creates a Java validation target from configuration', async () => {
    const repoRoot = process.cwd();

    const config = await loadForgeConfig(repoRoot);
    const resolved = resolveTargetConfigs(config);

    const targets = createValidationTargets(config, resolved);

    const javaTarget = targets.find((target) => target.id === 'examples.java-orders-tests');

    expect(javaTarget).toBeDefined();
    expect(javaTarget?.runner.id).toBe('maven');

    expect(
      javaTarget?.includesChange({
        status: 'modified',
        path: 'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
      }),
    ).toBe(true);
  });

  it('creates a TypeScript validation target from configuration', async () => {
    const config = await loadForgeConfig(process.cwd());
    const resolved = resolveTargetConfigs(config);

    const targets = createValidationTargets(config, resolved);

    const tsTarget = targets.find((target) => target.id === 'internal.forge-tests');

    expect(tsTarget).toBeDefined();
    expect(tsTarget?.runner.id).toBe('vitest');

    expect(
      tsTarget?.includesChange({
        status: 'modified',
        path: 'src/config/forge-config.ts',
      }),
    ).toBe(true);

    expect(
      tsTarget?.includesChange({
        status: 'modified',
        path: 'examples/java-orders/pom.xml',
      }),
    ).toBe(false);
  });
});
