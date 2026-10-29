export interface ExecutionResults {
  exitCode: number;
}

export interface TestRunner {
  readonly id: string;

  run(
    testFiles: string[],
    repoRoot: string,
  ): Promise<ExecutionResults>;
}