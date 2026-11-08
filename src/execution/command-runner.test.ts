import { describe, expect, it } from 'vitest';
import { runCommand } from './command-runner.js';

describe('runCommand', () => {
  it('resolves when the command exits successfully', async () => {
    await expect(runCommand(process.execPath, ['-e', 'process.exit(0)'])).resolves.toBe(0);
  });

  it('rejects when the command exits unsuccessfully', async () => {
    await expect(runCommand(process.execPath, ['-e', 'process.exit(1)'])).resolves.toBe(1);
  });

  it('passes an execution manifest through stdin', async () => {
    const manifest = JSON.stringify({
      testFiles: ['tests/App.test.ts'],
    });

    const script = `
      let input = '';

      process.stdin.setEncoding('utf8');

      process.stdin.on('data', (chunk) => {
        input += chunk;
      });

      process.stdin.on('end', () => {
        const manifest = JSON.parse(input);

        process.exit(
          manifest.testFiles[0] === 'tests/App.test.ts' ? 0 : 1
        );
      });
    `;

    const exitCode = await runCommand(
      process.execPath,
      ['-e', script],
      undefined,
      manifest,
    );

    expect(exitCode).toBe(0)
  });
});
