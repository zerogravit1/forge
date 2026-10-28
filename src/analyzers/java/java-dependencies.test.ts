import { describe, expect, it } from 'vitest';

import { discoverJavaModuleDependencies } from './java-dependencies.js';

describe('discoverJavaModuleDependencies', () => {
  it('resolves an imported Java class to its source file', async () => {
    const sourceRoots = [
      'examples/java-orders/src/main/java',
      'examples/java-orders/src/test/java'
    ];

    const result = await discoverJavaModuleDependencies(
      'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
      process.cwd(),
      sourceRoots
    );

    expect(result.dependencies).toContain(
      'examples/java-orders/src/main/java/com/forge/rules/OrderRules.java'
    );
  });
});
