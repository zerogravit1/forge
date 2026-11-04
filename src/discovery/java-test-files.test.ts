import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

  it('discovers the default Maven Surefie naming conventions', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'forge-java-discovery-'));
    const projectPath = 'java-orders';

    const testDirectory = join(repo, projectPath, 'src/test/java/com/forge/orders');

    try {
      await mkdir(testDirectory, { recursive: true });

      // Three additional Surefire naming conventions.
      await writeFile(join(testDirectory, 'TestOrders.java'), '');
      await writeFile(join(testDirectory, 'OrderTests.java'), '');
      await writeFile(join(testDirectory, 'OrderTestCase.java'), '');

      // This is not a test.
      await writeFile(join(testDirectory, 'OrderService.java'), '');

      const testFiles = await discoverJavaTestFiles(repo, projectPath);

      expect(testFiles).toEqual([
        'java-orders/src/test/java/com/forge/orders/OrderTestCase.java',
        'java-orders/src/test/java/com/forge/orders/OrderTests.java',
        'java-orders/src/test/java/com/forge/orders/TestOrders.java',
      ]);
    } finally {
      await rm(repo, { recursive: true, force: true });
    }
  });
});
