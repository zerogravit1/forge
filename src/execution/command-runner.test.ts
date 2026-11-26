import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCommand, runCommandWithTermination } from './command-runner.js';

vi.mock('node:child_process', { spy: true });

const largeInput = 'x'.repeat(4 * 1024 * 1024);
const writeFailure = { code: expect.stringMatching(/^(EPIPE|EOF)$/), syscall: 'write' };

function mockChildProcess() {
  const stdin = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
  const child = Object.assign(new EventEmitter(), {
    stdin,
    exitCode: null as number | null,
    signalCode: null,
    unref: vi.fn(),
  });
  vi.mocked(spawn).mockReturnValueOnce(child as unknown as ChildProcess);
  return child;
}

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

  it('rejects immediately on a write error without waiting for subprocess termination', async () => {
    const child = mockChildProcess();
    const stdinError = new Error('write EPIPE');
    const result = runCommand('test-command', [], undefined, 'manifest');

    child.stdin.emit('error', stdinError);
    await expect(result).rejects.toBe(stdinError);
  });
});

describe('runCommandWithTermination', () => {
  it.each([0, 1])('retains an observed numeric exit of %i', async (code) => {
    await expect(runCommandWithTermination(process.execPath, ['-e', `process.exit(${code})`])).resolves.toEqual({
      exitCode: code,
      termination: { exitCode: code, signal: null },
    });
  });

  it('retains a write error and an observed exit of zero without reporting runner success', async () => {
    const args = ['-e', 'process.exit(0)'];

    await expect(runCommandWithTermination(process.execPath, args, undefined, largeInput)).resolves.toMatchObject({
      exitCode: 1,
      termination: { exitCode: 0, signal: null },
      stdinError: writeFailure,
    });
    await expect(runCommand(process.execPath, args, undefined, largeInput)).rejects.toMatchObject(writeFailure);
  });

  it('rejects a spawn failure even when stdin input is provided', async () => {
    const missingExecutable = join(tmpdir(), `forge-missing-executable-${randomUUID()}`);

    await expect(runCommandWithTermination(missingExecutable, [], undefined, largeInput)).rejects.toMatchObject({
      code: 'ENOENT',
      syscall: expect.stringMatching(/^spawn /),
    });
  });

  it('retains a pending stdin error reported after subprocess close', async () => {
    const child = mockChildProcess();
    const stdinError = new Error('write EPIPE');
    const result = runCommandWithTermination('test-command', [], undefined, 'manifest');
    const completed = vi.fn();
    void result.then(completed, completed);

    child.emit('exit', 7, null);
    child.emit('close', 7, null);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();

    child.stdin.emit('error', stdinError);
    child.stdin.emit('close');
    await expect(result).resolves.toEqual({
      exitCode: 1,
      termination: { exitCode: 7, signal: null },
      stdinError,
    });
  });

  it('rejects a process error and cancels pending stdin observations before a later close', async () => {
    vi.useFakeTimers();
    try {
      const child = mockChildProcess();
      const processError = new Error('spawn ENOENT');
      const result = runCommandWithTermination('test-command', [], undefined, 'manifest');

      child.stdin.emit('error', new Error('write EPIPE'));
      child.emit('error', processError);
      child.emit('close', -2, null);
      child.stdin.emit('close');

      await expect(result).rejects.toBe(processError);
      expect(vi.getTimerCount()).toBe(0);
      expect(child.unref).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { phase: 'the child keeps running', observedExit: null, unrefsChild: true },
    { phase: 'the child exits without close yet', observedExit: 7, unrefsChild: false },
  ])('bounds the wait after a stdin error when $phase', async ({ observedExit, unrefsChild }) => {
    vi.useFakeTimers();
    try {
      const child = mockChildProcess();
      const stdinError = new Error('write EPIPE');
      const result = runCommandWithTermination('test-command', [], undefined, 'manifest');
      const completed = vi.fn();
      void result.then(completed, completed);

      child.stdin.emit('error', stdinError);
      child.stdin.emit('close');
      child.exitCode = observedExit;
      if (observedExit !== null) child.emit('exit', observedExit, null);
      await vi.advanceTimersByTimeAsync(2_000);

      const expected = { exitCode: 1, termination: { exitCode: observedExit, signal: null }, stdinError };
      expect(completed).toHaveBeenCalledExactlyOnceWith(expected);
      expect(child.unref).toHaveBeenCalledTimes(unrefsChild ? 1 : 0);
      expect(child.stdin.destroy).toHaveBeenCalledTimes(unrefsChild ? 1 : 0);

      if (observedExit === null) child.emit('exit', 7, null);
      child.emit('close', observedExit ?? 7, null);
      await Promise.resolve();
      expect(completed).toHaveBeenCalledExactlyOnceWith(expected);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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
