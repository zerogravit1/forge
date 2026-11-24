# Forge validation evidence contract — proposed v0.1

**Status:** Design draft, tracked by [Forge #26](https://github.com/zerogravit1/forge/issues/26). **No evidence-producing CLI or JSON Schema is implemented by this document.** Existing `plan` and `run` behavior must not be described as emitting this report.

## Product goal

A developer or CI system should be able to inspect one portable JSON artifact to determine:
1. What changed and which project/target configuration was evaluated.
2. Which tests were discovered, selected, excluded, or left uncertain—and why.
3. Which intended tests actually executed, their outcomes, and any missing execution proof.
4. Whether the observed validation justifies a complete passing conclusion.
5. What time was spent planning and running, with independently measured full-suite comparisons when available.

The contract must not depend on Launchpad, Docker, Kubernetes, a database, a broker, or Shipweard. Those products and environments may **consume** the artifact later.

## Proposed top-level structure

- `schemaVersion`: SemVer string; begin with `0.1.0`. Readers reject unsupported major versions.
- `kind`: `plan` or `run`, identifying the requested operation.
- `producer`: Forge package version and source revision where available.
- `input`: repository revision/dirty state, comparison references and resolved SHAs, configuration path/digest, normalized changed-file records.
- `analysis`: explicit completeness status; per-target discovery results; per-discovered-test selection decisions and their evidence; unresolved edges and unmatched changes.
- `execution`: explicit state (`not-run`, `completed`, `incomplete`) and per-target requested versus **observed** test identities, runner outcome and process exit code. A plan report must use `not-run`.
- `summary`: independent selection and validation statuses; measured timings. Validation is `passed`, `failed`, `incomplete`, or `not-run`.
- `metadata` (optional): generation timestamp and non-decisional display information. Do not include volatile values in a canonical comparison hash without documenting them.

### Example shape — illustrative, NOT a real Forge output

```json
{
  "schemaVersion": "0.1.0",
  "kind": "plan",
  "producer": { "name": "forge", "version": "0.1.0", "revision": "example-build" },
  "input": {
    "repository": { "head": "example-head", "clean": true },
    "comparison": { "from": "example-base", "to": "example-head" },
    "configuration": { "path": "forge.config.json", "sha256": "example-config-digest" },
    "changes": [{ "status": "modified", "path": "src/value.ts" }]
  },
  "analysis": {
    "status": "complete",
    "unmatchedChanges": [],
    "targets": [{
      "id": "example.vitest",
      "runner": "vitest",
      "discoveredTests": ["src/static.test.ts", "src/dynamic.test.ts", "src/unrelated.test.ts"],
      "decisions": [
        { "test": "src/static.test.ts", "decision": "selected", "reasons": [{ "kind": "dependency-path", "path": ["src/static.test.ts", "src/value.ts"] }] },
        { "test": "src/dynamic.test.ts", "decision": "selected", "reasons": [{ "kind": "dependency-path", "path": ["src/dynamic.test.ts", "src/value.ts"] }] },
        { "test": "src/unrelated.test.ts", "decision": "excluded", "reasons": [{ "kind": "known-no-impact", "path": ["src/unrelated.test.ts", "src/other.ts"] }] }
      ],
      "unresolved": []
    }]
  },
  "execution": { "status": "not-run", "targets": [] },
  "summary": {
    "selection": "complete",
    "validation": "not-run",
    "timingsMs": { "planning": null, "execution": null, "fullSuiteBaseline": null }
  }
}
```

All identifiers, revisions, paths, and reasons above describe a fabricated fixture. The numeric timings are deliberately absent. A real producer must not synthesize proof absent from its analyzer or runner.

## Required decision semantics

Each discovered test has one decision:

- `selected`: must include the direct change, known dependency path, configuration change, or conservative uncertainty/fallback that caused selection.
- `excluded`: may be asserted only when the available analysis supports no impact **within the declared analysis scope**. A graph edge that was not examined cannot justify exclusion.
- `uncertain`: impact is unresolved, with an explicit reason; must never be silently treated as an unaffected test.

Unmatched source changes, unknown or unsupported dependency patterns, missing target discovery, unknown configuration, and unavailable runner observations are surfaced explicitly. When conservative selection runs uncertain tests, record both that they were **selected** and the uncertainty motivating the fallback; do not transform uncertainty into a known dependency path.

A complete selection requires defensible decisions for all in-scope discovered tests and explicit accounting for every changed file. It is not proof of coverage outside the declared scope.

## Execution integrity

- Do not infer executed test identities solely from the list passed to a runner.
- A process exit code of zero, without trustworthy proof that the intended tests actually executed, cannot establish `validation: passed`.
- A failed assertion or failed execution must not become a successful validation through filtering or aggregating exit statuses.
- If no changes require tests, report that reason explicitly; distinguish it from failed discovery or missing tests.
- If an intended test is absent from the observed runner report, mark validation `incomplete` even if the process returned zero.
- A `plan` report is never a completed validation; its validation status is `not-run`.
- `incomplete` is not equivalent to `passed`. CLI exit behavior must reflect policy explicitly when emission is implemented.

## Reproducibility and portability

Normalize paths to repository-relative POSIX separators. Persist exact comparison revisions and the current HEAD when available; declare a dirty worktree or uncommitted inputs rather than implying the output is fully reproducible from a commit. Configuration provenance should include a digest of the effective configuration and relevant versions, not merely a filename.

For stable comparisons, sort changed files, targets, test identities, dependency paths, and reasons deterministically. Keep timestamps and machine-specific display metadata out of the canonical content hash, or specify a separate noncanonical envelope.

Timing fields must be measured, labeled by operation, and nullable when unavailable. A percentage or speedup against a full-suite baseline is publishable only when both measurements come from documented comparable conditions.

## Independent proof fixtures

1. Direct source change selects its direct consumer.
2. Transitive dependency change selects all affected tests.
3. Literal dynamic import selects its failing consumer (Forge #13); unrelated tests remain excluded.
4. TypeScript alias import uses real project configuration (Forge #14).
5. Unresolved or nonliteral import produces uncertainty and prevents unjustified success.
6. Nested project target executes the intended test (Forge #17).
7. Runner control verifies actual test identities/counts, nonzero failure propagation, and a clean report from that invocation.
8. A zero-observed-tests or missing-report control does not report complete success.
9. Identical fixture and versioned inputs yield structurally equivalent canonical evidence.
10. Planning and full-suite baselines record observed durations without inventing missing metrics.

The expected test mapping must come from each fixture's independently declared dependency relationships, **not** from the Forge-produced plan.

## Current interface gaps to resolve before implementation

At the time of this design, `SelectionResult` returns only `selectedTests` and `unmappedChanges`; it does not preserve complete exclusion reasons or dependency paths. `TestRunner` returns an `exitCode` only; it does not return observed test identities or machine-readable results. A trustworthy implementation requires provenance-preserving selection structures and runner evidence collection. These are **proposed changes**, not features claimed today.

## Minimum implementation order

1. Review and approve field names, decision semantics, privacy considerations, and schema versioning.
2. Define a machine-validated JSON Schema and fixtures; use schema tests to reject incomplete or misleading reports.
3. Preserve dependency reason/provenance during analysis.
4. Collect independent runner observations (e.g., fresh Vitest JSON) and reconcile intended vs observed tests.
5. Emit a deterministic plan artifact, then a run artifact with explicit incomplete/failure semantics.
6. Reproduce results in an independent example and CI, then publish measurements and limitations.

See [#26](https://github.com/zerogravit1/forge/issues/26). Keep the Java defects [#11](https://github.com/zerogravit1/forge/issues/11), [#12](https://github.com/zerogravit1/forge/issues/12), [#15](https://github.com/zerogravit1/forge/issues/15), and [#16](https://github.com/zerogravit1/forge/issues/16) visible rather than implying this TypeScript-focused milestone resolves them.
