import { describe, expect, it, vi } from 'vitest';

import { runCommand } from './command-runner.js';
import { createMavenRunner } from './maven-runner.js';

describe('createMavenRunner', () => {
  it('executes the selected JUnit test through Maven', async () => {
    const execute = vi.fn<typeof runCommand>().mockResolvedValue(0);

    const runner = createMavenRunner(
      'examples/java-orders',
      execute,
    );

    const result = await runner.run(
      [
        'examples/java-orders/src/test/java/com/forge/orders/OrderServiceTest.java',
      ],
      process.cwd(),
    );

    expect(execute).toHaveBeenCalledExactlyOnceWith(
      'mvn',
      [
        '-f',
        'examples/java-orders/pom.xml',
        '-Dtest=OrderServiceTest',
        'test',
      ],
      process.cwd(),
    );

    expect(result).toEqual({ exitCode: 0 });
  });
});