# Forge validation evidence contract — proposed v0.1

**Status:** Design draft, tracked by [Forge #26](https://github.com/zerogravit1/forge/issues/26). The proposed JSON Schema and portable CLI artifact are pending. Field names, statuses, and versions below illustrate a design for review.

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
- `execution`: explicit state (`not-run`, `completed`, `incomplete`) and per-target requested versus **observed** test identities. Retain test outcomes, observation completeness, shutdown evidence, and process exit status as separate facts. When fallback is authorized and used, record its policy, scope, and observed outcome. A plan report must use `not-run`.
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
    "status": "incomplete",
    "unmatchedChanges": [],
    "targets": [
      {
        "id": "example.vitest",
        "runner": "vitest",
        "discoveredTests": ["src/static.test.ts", "src/dynamic.test.ts", "src/subprocess.test.ts"],
        "decisions": [
          {
            "test": "src/static.test.ts",
            "decision": "selected",
            "reasons": [{ "kind": "dependency-path", "path": ["src/static.test.ts", "src/value.ts"] }]
          },
          {
            "test": "src/dynamic.test.ts",
            "decision": "selected",
            "reasons": [{ "kind": "dependency-path", "path": ["src/dynamic.test.ts", "src/value.ts"] }]
          },
          {
            "test": "src/subprocess.test.ts",
            "decision": "uncertain",
            "reasons": [{ "kind": "unsupported-subprocess-reference" }]
          }
        ],
        "unresolved": [{ "file": "src/subprocess.test.ts", "kind": "unsupported-subprocess-reference" }]
      }
    ]
  },
  "execution": { "status": "not-run", "targets": [] },
  "summary": {
    "selection": "incomplete",
    "validation": "not-run",
    "timingsMs": { "planning": null, "execution": null, "fullSuiteBaseline": null }
  }
}
```

This fabricated fixture maps the changed file to two tests. The subprocess relationship remains uncertain, so selection is incomplete even though no change is unmatched. Timings are unavailable for this example.

## Required decision semantics

Each discovered test has one decision:

- `selected`: must include the direct change, known dependency path, configuration change, or conservative uncertainty/fallback that caused selection.
- `excluded`: requires evidence for no impact **within the declared analysis scope**. A path to an unchanged file only establishes that dependency. Exclusion also requires evidence that the scoped analysis covers the relationships that could lead to the changed inputs.
- `uncertain`: impact is unresolved, with an explicit reason; must never be silently treated as an unaffected test.

Unmatched source changes, unknown or unsupported dependency patterns, missing target discovery, unknown configuration, and unavailable runner observations are surfaced explicitly. Record uncertainty at the affected test or target even when another known relationship maps the changed file. When conservative selection includes uncertain tests, record both the inclusion and its uncertainty reason.

A complete selection requires defensible decisions for all in-scope discovered tests and explicit accounting for every changed file. It is not proof of coverage outside the declared scope.

## Execution integrity

- Require a defensible validation scope, reconciled observations of intended tests, and evidence that required execution and lifecycle phases succeeded before reporting `validation: passed`. A zero process exit supplies only one part of that evidence.
- Missing or contradictory test results and unverified required shutdown keep the evidence incomplete. The shutdown marker establishes that Vitest's close sequence returned. The runner version and configuration can affect how teardown errors are reported.
- Report a known test, runner, or required lifecycle failure as failed while preserving any incomplete selection or observations. Keep the reason for an intentional no-test run distinct from failed discovery or missing tests. A `plan` reports execution and validation as `not-run`.
- Strict execution currently refuses an incomplete selection. An explicitly approved fallback would need a defensible scope and independent execution evidence. Preserve the original incomplete selection even if fallback execution passes. The public representation and exit behavior remain decisions for that policy work.

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
11. Use a worker-only change with direct and transitive subprocess launch fixtures and an unrelated-change control. Prove inclusion or report bounded uncertainty. Independently verify any claimed exclusion.
12. Interrupted teardown can preserve passing test observations and exit zero while shutdown is unverified. For any approved fallback, test an established target scope, unknown scope, and known failure with incomplete selection.

The expected test mapping must come from each fixture's independently declared dependency relationships, **not** from the Forge-produced plan.

## Established baseline and remaining interface gaps

[PR #28](https://github.com/zerogravit1/forge/pull/28) completed the private Vitest execution-evidence increment. Independent review approved head [`0287f05`](https://github.com/zerogravit1/forge/commit/0287f0574deb6a889d3388d876e3fc98b53922ed), and it was merged into `develop` as [`9702b82`](https://github.com/zerogravit1/forge/commit/9702b8235e6d0d9d599561edb6f2980e04e725d8). The concrete runner returns invocation-bound requested and observed specifications, case counts, reconciliation, shutdown status, and subprocess exit status. The parent checks project identity against the worker's Vitest discovery inventory. `SelectionResult` still exposes `selectedTests` and `unmappedChanges`, and the shared `TestRunner` interface still exposes only `exitCode`. Selection provenance and carrying observations through the shared runner and CLI boundaries remain open.

An independent control on the locked Vitest 5.0.5 version showed one passing case and exit zero after interrupted teardown, with shutdown unverified. A separate control reached the shutdown marker despite a teardown error. Vitest 4.1.12 and Vitest 5.0.5 with `dangerouslyIgnoreUnhandledErrors` enabled could log that error and exit zero. Any public success decision needs evidence for required lifecycle outcomes beyond a completed shutdown marker and exit zero.

A worker-only plan on the pre-PR base [`cc4bf53`](https://github.com/zerogravit1/forge/commit/cc4bf535948922141f67a9428e32b9a6e708c416) and on `0287f05` discovered 29 test files, selected none, and reported `src/execution/vitest-worker.ts` as unmapped. The analyzer follows import and re-export edges. Both direct tests and the production runner use URL-derived paths to launch the worker as a subprocess, outside that analysis. The full PR #28 plan selected nine test files through other changes and still reported the worker unmapped. The corresponding `run` refused execution under the existing strict behavior. A launch edge would also make the worker's own computed imports reachable, so the subprocess controls need to test over-selection on unrelated changes as well.

## Proposed implementation order

1. **Completed:** Preserve private, invocation-bound Vitest observations and reconciliation in PR #28.
2. Refine fallback execution before increment 2. Keep strict as the default. Evaluate an opt-in full-target policy only when the affected validation target and its boundaries are established. Unknown scope retains strict refusal. Agree on evidence and verification requirements before approving any implementation or exit policy.
3. Preserve dependency provenance and uncertainty during TypeScript selection. Track subprocess dependency discovery as separate work. Use direct launch, transitive launch, and unrelated-change controls to test its boundaries.
4. Revisit the portable draft after selection and fallback facts are established. Review semantics, field names, privacy, compatibility, and schema versioning before approving the schema and its fixtures.
5. Emit a deterministic plan artifact, then a verified run artifact that retains selected and observed scope, failure, and incompleteness.
6. Reproduce results independently and in CI before publishing comparable measurements and limitations.

See [#26](https://github.com/zerogravit1/forge/issues/26). Keep the Java defects [#11](https://github.com/zerogravit1/forge/issues/11), [#12](https://github.com/zerogravit1/forge/issues/12), [#15](https://github.com/zerogravit1/forge/issues/15), and [#16](https://github.com/zerogravit1/forge/issues/16) visible rather than implying this TypeScript-focused milestone resolves them.
