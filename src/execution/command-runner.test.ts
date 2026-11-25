import { describe, expect, it } from 'vitest';
import { runCommand, runCommandWithTermination } from './command-runner.js';

describe('runCommand', () => {
  it('resolves when the command exits successfully', async () => {
    await expect(runCommand(process.execPath, ['-e', 'process.exit(0)'])).resolves.toBe(0);
  });

  it('resolves with a nonzero exit code when the command fails', async () => {
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

    const exitCode = await runCommand(process.execPath, ['-e', script], undefined, manifest);

    expect(exitCode).toBe(0);
  });
});

describe('runCommandWithTermination', () => {
  it.each([0, 1])('retains an observed numeric exit of %i', async (code) => {
    await expect(runCommandWithTermination(process.execPath, ['-e', `process.exit(${code})`])).resolves.toEqual({
      exitCode: code,
      termination: { exitCode: code, signal: null },
    });
  });

  it.skipIf(process.platform === 'win32')(
    'retains signal termination while normalizing the runner result',
    async () => {
      const args = ['-e', "process.kill(process.pid, 'SIGKILL')"];
      await expect(runCommandWithTermination(process.execPath, args)).resolves.toEqual({
        exitCode: 1,
        termination: { exitCode: null, signal: 'SIGKILL' },
      });
      await expect(runCommand(process.execPath, args)).resolves.toBe(1);
    },
  );
});
