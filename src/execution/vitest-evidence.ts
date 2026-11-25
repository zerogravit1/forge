import { readFile } from 'node:fs/promises';
import { reconcileSpecifications } from './vitest-results.js';

export interface VitestEvidenceDestination {
  resultFile: string;
  invocationId: string;
}

interface SpecificationIdentity {
  id: string;
  file: string;
  project: string;
}

const caseStates = ['passed', 'failed', 'skipped', 'pending'] as const;
const moduleStates = [...caseStates, 'queued'] as const;

export interface VitestObservation {
  invocationId: string;
  expected: (SpecificationIdentity & { kind: 'runtime' | 'typecheck' })[];
  observed: (SpecificationIdentity & {
    state: (typeof moduleStates)[number];
    cases: Record<(typeof caseStates)[number], number>;
  })[];
  unhandledErrorCount: number;
}

export type VitestExecutionEvidence =
  | {
      status: 'incomplete';
      reason: 'missing-result' | 'invalid-result' | 'wrong-invocation' | 'wrong-scope';
    }
  | (Omit<VitestObservation, 'invocationId'> & {
      status: 'complete' | 'incomplete';
      reconciliation: ReturnType<typeof reconcileSpecifications>;
      unverifiedSpecifications: string[];
    });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdentity(value: unknown): value is SpecificationIdentity & Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.file === 'string' &&
    typeof value.project === 'string'
  );
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isExpected(value: unknown): value is VitestObservation['expected'][number] {
  return isIdentity(value) && (value.kind === 'runtime' || value.kind === 'typecheck');
}

function isObserved(value: unknown): value is VitestObservation['observed'][number] {
  if (!isIdentity(value) || !moduleStates.some((state) => state === value.state)) {
    return false;
  }

  const cases = value.cases;
  return isRecord(cases) && caseStates.every((state) => isCount(cases[state]));
}

function isObservation(value: unknown): value is VitestObservation {
  return (
    isRecord(value) &&
    typeof value.invocationId === 'string' &&
    Array.isArray(value.expected) &&
    value.expected.every(isExpected) &&
    Array.isArray(value.observed) &&
    value.observed.every(isObserved) &&
    isCount(value.unhandledErrorCount)
  );
}

export async function readVitestEvidence(
  destination: VitestEvidenceDestination,
  testFiles: readonly string[],
): Promise<VitestExecutionEvidence> {
  let report: unknown;
  try {
    report = JSON.parse(await readFile(destination.resultFile, 'utf8'));
  } catch (error: unknown) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    return { status: 'incomplete', reason: missing ? 'missing-result' : 'invalid-result' };
  }

  if (!isObservation(report)) {
    return { status: 'incomplete', reason: 'invalid-result' };
  }

  if (report.invocationId !== destination.invocationId) {
    return { status: 'incomplete', reason: 'wrong-invocation' };
  }

  const { expected, observed, unhandledErrorCount } = report;
  const selectedFiles = new Set(testFiles);
  const expectedFiles = new Set(expected.map((spec) => spec.file));
  const expectedById = new Map(expected.map((spec) => [spec.id, spec]));

  if (expectedFiles.size !== selectedFiles.size || [...expectedFiles].some((file) => !selectedFiles.has(file))) {
    return { status: 'incomplete', reason: 'wrong-scope' };
  }

  for (const module of observed) {
    const spec = expectedById.get(module.id);
    if (!selectedFiles.has(module.file) || (spec && (module.file !== spec.file || module.project !== spec.project))) {
      return { status: 'incomplete', reason: 'wrong-scope' };
    }
  }

  const reconciliation = reconcileSpecifications(
    expected.map((spec) => ({ taskId: spec.id })),
    observed.map((module) => ({ id: module.id, state: () => module.state })),
  );

  const unverifiedSpecifications = observed
    .filter((module) => {
      const isRuntime = expectedById.get(module.id)?.kind === 'runtime';
      // A runtime module can look passed even when every case was skipped.
      const noRuntimeCasesFinished = isRuntime && module.cases.passed === 0 && module.cases.failed === 0;
      return module.state === 'skipped' || module.cases.pending > 0 || noRuntimeCasesFinished;
    })
    .map((module) => module.id);

  const hasMismatch = Object.values(reconciliation).some((ids) => ids.length > 0);

  return {
    status: hasMismatch || unverifiedSpecifications.length > 0 ? 'incomplete' : 'complete',
    expected,
    observed,
    unhandledErrorCount,
    reconciliation,
    unverifiedSpecifications,
  };
}
