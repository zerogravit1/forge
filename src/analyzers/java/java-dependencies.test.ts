import { describe, expect, it } from 'vitest';

import {
  discoverJavaModuleDependencies,
  discoverJavaPackage,
  discoverJavaRepositoryModules,
} from './java-dependencies.js';
import { resolveTestDependencies } from '../../graph/resolve-test-dependencies.js';

const sourceRoots = ['examples/java-orders/src/main/java', 'examples/java-orders/src/test/java'];

describe('discoverJavaModuleDependencies', () => {
  it('resolves an imported Java class to its source file', async () => {
    const result = await discoverJavaModuleDependencies(
      'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
      process.cwd(),
      sourceRoots,
    );

    expect(result.dependencies).toContain('examples/java-orders/src/main/java/com/forge/rules/OrderRules.java');
  });

  it('resolves a class referenced within the same package', async () => {
    const result = await discoverJavaModuleDependencies(
      'examples/java-orders/src/test/java/com/forge/orders/OrderServiceTest.java',
      process.cwd(),
      sourceRoots,
    );

    expect(result.dependencies).toContain('examples/java-orders/src/main/java/com/forge/orders/OrderService.java');
  });
});

describe('discoverJavaPackage', () => {
  it('extracts a declared Java package', () => {
    const source = `
      package com.forge.orders;

      public class OrderService {}
    `;

    expect(discoverJavaPackage(source)).toBe('com.forge.orders');
  });

  it('returns undefined when no package is declared', () => {
    const source = 'public class Example {}';

    expect(discoverJavaPackage(source)).toBeUndefined();
  });
});

describe('discoverJavaRepositoryModules', () => {
  it('discovers transitive Java dependencies', async () => {
    const testFile = 'examples/java-orders/src/test/java/com/forge/OrderServiceTest.java';

    const modules = await discoverJavaRepositoryModules([testFile], process.cwd(), sourceRoots);

    const dependencies = resolveTestDependencies([testFile], modules);

    expect(dependencies[0]?.dependencies).toEqual(
      expect.arrayContaining([
        'examples/java-orders/src/main/java/com/forge/orders/OrderService.java',
        'examples/java-orders/src/main/java/com/forge/rules/OrderRules.java',
      ]),
    );
  });
});
