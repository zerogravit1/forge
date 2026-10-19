import { describe, expect, it } from 'vitest';
import { runCommand } from './command-runner.js';

describe('runCommand', () => {
  it('resolves when the command exits successfully', async () => {
    await expect(runCommand(process.execPath, ['-e', 'process.exit(0)'])).resolves.toBe(0);
  });

  it('rejects when the command exits unsuccessfully', async () => {
    await expect(runCommand(process.execPath, ['-e', 'process.exit(1)'])).resolves.toBe(1);
  });
});
