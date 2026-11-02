import { describe, expect, it } from 'vitest';
import { discoverJavaTestFiles } from './java-test-files.js';

describe('discoverJavaTestFiles', () => {
  it('discover Java test files in a Maven project', async () => {
    const testFiles = await discoverJavaTestFiles(process.cwd(), 'examples/java-orders');

    expect(testFiles).toEqual([
      'examples/java-orders/src/test/java/com/forge/inventory/InventoryServiceTest.java',
      'examples/java-orders/src/test/java/com/forge/orders/OrderServiceTest.java',
    ]);
  });
});
