interface ExpectedSpecifications {
  taskId: string;
}

interface ActualSpecifications {
  id: string;
  state(): string;
}

interface ReconciliationResult {
  missing: string[];
  unexpected: string[];
  duplicates: string[];
  incomplete: string[];
}

export function reconcileSpecifications(
  expected: readonly ExpectedSpecifications[],
  actual: readonly ActualSpecifications[],
): ReconciliationResult {
  const expectedIds = new Set(expected.map((spec) => spec.taskId));
  const actualIds = new Set(actual.map((module) => module.id));

  const missing = [...expectedIds].filter((id) => !actualIds.has(id));
  const unexpected = [...actualIds].filter((id) => !expectedIds.has(id));

  const counts = new Map<string, number>();
  const expectedCounts = new Map<string, number>();

  for (const spec of expected) {
    expectedCounts.set(spec.taskId, (expectedCounts.get(spec.taskId) ?? 0) + 1);
  }

  for (const module of actual) {
    counts.set(module.id, (counts.get(module.id) ?? 0) + 1);
  }

  const duplicates = [
    ...new Set([
      ...[...expectedCounts].filter(([, count]) => count > 1).map(([id]) => id),
      ...[...counts].filter(([, count]) => count > 1).map(([id]) => id),
    ]),
  ];

  const incomplete = actual
    .filter((module) => {
      const state = module.state();
      return state === 'pending' || state === 'queued';
    })
    .map((module) => module.id);

  return { missing, unexpected, duplicates, incomplete };
}
