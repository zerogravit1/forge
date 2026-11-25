import type { TargetPlan } from '../validation/plan-validation-targets.js';
import type { CommandResult } from './command-runner.js';
import type { ExecutionResults } from './test-runner.js';
import type { VitestExecutionEvidence, VitestShutdownStatus } from './vitest-evidence.js';

function writeList(label: string, entries: string[]): void {
  const lines = entries.length ? entries : ['None'];
  process.stdout.write(`${label}:\n${lines.map((entry) => `  ${entry}`).join('\n')}\n`);
}

export async function runFullTargetFallback(plan: TargetPlan, repoRoot: string): Promise<void> {
  const { target, discoveredTests, selection } = plan;

  // The target factory checks adapter compatibility. Only Vitest supports fallback in this increment.
  if (target.runner.id !== 'vitest') {
    console.error(`Full-target fallback refused: ${target.id} does not support fallback.`);
    return;
  }

  if (discoveredTests.length === 0) {
    console.error(`Full-target fallback refused: ${target.id} has no discovered test files.`);
    return;
  }

  process.stdout.write(`Full-target fallback: ${target.id}\n`);
  process.stdout.write('Selection incomplete: original test mapping remains incomplete.\n');
  writeList(
    'Unmapped changes',
    selection.unmappedChanges.map((change) => `${change.status}\t${change.path}`),
  );
  writeList('Originally selected test files', selection.selectedTests);
  writeList('Fallback test files', discoveredTests);

  // The shared runner result only requires a normalized exit code. Use the private Vitest
  // observations, shutdown status, and subprocess termination when available.
  const result: ExecutionResults & {
    evidence?: VitestExecutionEvidence;
    shutdown?: VitestShutdownStatus;
    termination?: CommandResult['termination'];
  } = await target.runner.run(discoveredTests, repoRoot);
  const { evidence, shutdown, exitCode, termination } = result;
  const evidenceStatus = evidence?.status ?? 'incomplete';
  const unavailableReason = evidence ? ('reason' in evidence ? evidence.reason : undefined) : 'unavailable';
  process.stdout.write(
    `Vitest execution evidence: ${evidenceStatus}${unavailableReason ? ` (${unavailableReason})` : ''}\n`,
  );

  if (evidence && 'observed' in evidence) {
    const observations = evidence.observed.map(({ id, file, project, state, cases }) => {
      const scope = project ? `${project}, ${id}` : id;
      const counts = `${cases.passed} passed, ${cases.failed} failed, ${cases.skipped} skipped, ${cases.pending} pending`;
      return `${file} [${scope}]: ${state} (${counts})`;
    });
    writeList('Observed Vitest specifications (project-relative)', observations);

    const expectedById = new Map(evidence.expected.map((spec) => [spec.id, spec]));
    const groups = { ...evidence.reconciliation, unverified: evidence.unverifiedSpecifications };
    const diagnostics: string[] = [];
    for (const [reason, ids] of Object.entries(groups)) {
      if (ids.length === 0) continue;

      const names = ids.map((id) => {
        const expected = expectedById.get(id);
        if (!expected) return id;

        const scope = [expected.project, expected.kind, id].filter(Boolean).join(', ');
        return `${expected.file} [${scope}]`;
      });
      diagnostics.push(`${reason}: ${names.join(', ')}`);
    }
    if (diagnostics.length > 0) writeList('Vitest reconciliation', diagnostics);

    process.stdout.write(`Vitest unhandled errors: ${evidence.unhandledErrorCount}\n`);
  }

  process.stdout.write(`Vitest shutdown: ${shutdown ?? 'unverified'}\n`);
  if (termination?.signal) {
    process.stdout.write(`Vitest subprocess signal: ${termination.signal}\n`);
  } else if (typeof termination?.exitCode === 'number') {
    process.stdout.write(`Vitest subprocess exit: ${termination.exitCode}\n`);
  } else {
    process.stdout.write('Vitest subprocess termination: unavailable\n');
  }
  process.stdout.write(`Vitest runner exit: ${exitCode}\n`);
}
