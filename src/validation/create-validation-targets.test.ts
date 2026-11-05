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

    const javaTarget = targets.find(
      (target) => target.id === 'examples.java-orders-tests',
    );

    expect(javaTarget).toBeDefined();
    expect(javaTarget?.runner.id).toBe('maven');

    expect(
      javaTarget?.includesChange({
        status: 'modified',
        path: 'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
      }),
    ).toBe(true);
  });
});