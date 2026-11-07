# Forge — Implementation Status & Next Steps

**Updated:** November 7, 2026  
**Repository:** [zerogravit1/forge](https://github.com/zerogravit1/forge)  
**Working branch:** `fix/typescript-target-isolation`  
**Target branch:** `develop`  
**Pull request:** [#19](https://github.com/zerogravit1/forge/pull/19)  
**Latest verified commit:** `8f701b0`

## 1. Project objective

Forge is an evidence-driven test selection and orchestration platform.

Its purpose is to connect source-code changes with the tests required to validate those changes, while making validation decisions explainable.

The current MVP focuses on:

- Detecting changed files through Git.
- Discovering available tests using configured project runners.
- Mapping changes to potentially affected tests.
- Planning and executing selected tests.
- Identifying changes without known validation coverage.
- Preserving correct validation boundaries across projects.

**Core principle:** A successful validation result must mean that the intended tests actually executed successfully. Unrelated passing tests must not substitute for required validation.

## 2. Current implementation

Forge currently supports TypeScript/Vitest and Java/Maven validation targets.

The CLI provides `plan` and `run` commands. Target configuration identifies project roots, source directories, test directories, adapters, and runners.

Current work is concentrated on ensuring that TypeScript targets execute tests in the correct project and respect configured boundaries.

### Regression baseline

Seven confirmed defects were established against baseline commit `6aaef70`.

| Issue | Description                                               | Status                   |
| ----- | --------------------------------------------------------- | ------------------------ |
| #11   | Java discovery ignores configured test directories        | Open                     |
| #12   | Repository-root Java targets fail path matching           | Open                     |
| #13   | Dynamic TypeScript imports omit affected tests            | Open                     |
| #14   | TypeScript path aliases are not correctly analyzed        | Open                     |
| #15   | Java static imports omit affected tests                   | Open                     |
| #16   | Shared Java sources fail to trigger every affected target | Open                     |
| #17   | Nested TypeScript targets execute unrelated root tests    | Implementation in PR #19 |

Regressions #11–#16 remain quarantined. The #17 regression has been promoted into normal test execution.

## 3. PR #19 — TypeScript target isolation

**Status: In progress — one outstanding review finding.**

### Original issue #17

A TypeScript validation target configured for `packages/app` could execute repository-root tests instead of the package's tests.

This was particularly dangerous because passing root tests could cause Forge to report successful validation even when the configured package contained failing tests.

### Implemented corrections

- Vitest discovery runs from the configured project directory.
- The project's own Vitest configuration is used.
- Discovery results are filtered against configured `testRoots`.
- Selected test paths are converted from repository-relative to project-relative paths.
- The Vitest runner rejects test paths outside its configured project.
- Package-level test failures propagate a nonzero exit status through Forge.
- Regression coverage verifies real execution, test identity, report counts, and failure propagation.

### Codex review — finding P1

**Named Vitest projects could silently omit required tests.**

Vitest's human-readable listing included project prefixes:

```text
[app] tests/App.test.ts
```

Forge treated this entire string as a filesystem path and filtered it out.

The resulting behavior was:

```text
Discovery: []
Forge: No tests selected.
Exit status: 0
```

A failing test existed but was never executed.

**Correction implemented:**

Discovery now uses:

```bash
npx --no-install vitest list --filesOnly --json
```

The structured response contains:

```json
[
  {
    "file": "/absolute/path/packages/app/tests/App.test.ts",
    "projectName": "app"
  }
]
```

Forge parses the `file` property, validates the result, applies project and test-root boundaries, and converts selected paths to repository-relative paths.

Malformed JSON or invalid entries generate errors rather than silently returning an empty test list.

A new regression proves that a named project containing a failing test is discovered, executed, and produces a nonzero Forge exit status.

**P1 status: Fixed and covered by regression tests.**

## 4. Outstanding finding — P2: Path-filter collisions

**Priority: P2 — next implementation task.**

Codex identified that Vitest interprets positional filename arguments as substring filters rather than exact file identifiers.

The current runner converts repository-relative paths into project-relative arguments.

Example:

```text
Selected:
packages/app/tests/App.test.ts

Passed to Vitest:
tests/App.test.ts
```

Vitest may also execute another file containing that same substring:

```text
packages/app/src/tests/App.test.ts
```

Consequently, Forge can correctly discover one test but execute additional tests outside the configured `testRoots`.

This violates the execution isolation required by issue #17.

### Next step A — Reproduce P2

Add a separate regression in:

```text
src/regressions/typescript-target.regression.test.ts
```

Create a temporary project containing:

```text
packages/app/
├── vitest.config.mjs
├── tests/
│   └── App.test.ts          # Intended, passing
└── src/
    └── tests/
        └── App.test.ts      # Excluded, deliberately failing
```

Configure Forge with:

```typescript
{
  path: 'packages/app',
  sources: ['src'],
  tests: ['tests'],
}
```

Configure Vitest to recognize tests in both locations.

Verify that Forge discovery returns only:

```text
packages/app/tests/App.test.ts
```

Then execute the selected test through Forge's runner.

**Expected behavior:**

- One test executes.
- The configured test passes.
- The excluded test does not execute.
- Forge exits `0`.
- The JSON report identifies only the configured test.

**Current suspected behavior:**

- Both tests execute because their paths collide under substring matching.
- The excluded failing test causes Forge to exit `1`.
- The report contains two test files rather than one.

Inspect actual report identities and counts, not only exit codes.

### Next step B — Correct execution

Investigate a Vitest-supported mechanism for enforcing an exact set of selected test files.

Requirements:

- Preserve each project's Vitest configuration.
- Execute exactly the selected files.
- Prevent substring collisions.
- Preserve meaningful exit codes.
- Support named Vitest projects.
- Avoid introducing a separate test-discovery model that conflicts with Vitest.

Do not assume positional paths are exact filters.

Choose an implementation only after the regression demonstrates the failure.

### Next step C — Verify the correction

Run the P2 regression independently, then both existing #17 regressions.

Confirm that all three scenarios pass:

1. Original nested-project isolation.
2. Named Vitest project discovery and failure propagation.
3. Exact-file execution despite colliding paths.

## 5. Current validation evidence

The latest reported local test results, following the P1 correction:

| Verification              | Result                |
| ------------------------- | --------------------- |
| TypeScript typecheck      | Passed                |
| ESLint                    | Passed                |
| Unit and regression tests | 101 passed, 7 skipped |
| Original #17 regression   | Passed                |
| Named-project regression  | Passed                |
| GitHub Actions            | CI run #29 succeeded  |
| P2 collision regression   | Not yet implemented   |

GitHub Actions successfully completed on commit `8f701b0`.

The six outstanding regression cases (#11–#16) and optional Maven integration test account for the seven normal-suite skips.

### Useful commands

```bash
# Use the configured Node version
nvm use

# Install locked dependencies
npm ci

# Run both current #17 regressions
npm test -- src/regressions/typescript-target.regression.test.ts

# Run Vitest runner unit tests
npm test -- src/execution/vitest-runner.test.ts

# Run the complete validation pipeline
npm run check

# Opt in to the six outstanding defect regressions
FORGE_REGRESSION_BASELINE=1 npm test -- src/regressions
```

The opt-in regression suite is expected to fail until the remaining defects are corrected.

## 6. Before merging PR #19

- [x] Reproduce the original #17 failure.
- [x] Correct project-root discovery and execution.
- [x] Enforce configured test roots during discovery.
- [x] Verify runner path translation and project boundaries.
- [x] Reproduce Codex P1 for named Vitest projects.
- [x] Correct P1 with structured discovery output.
- [x] Add permanent named-project regression coverage.
- [x] Validate P1 changes in GitHub Actions.
- [ ] Add failing regression for P2 path collisions.
- [ ] Implement exact-file execution.
- [ ] Verify the P2 regression passes.
- [ ] Run `npm run check`.
- [ ] Remove the leftover commented diagnostic `// console.error(error);` in `src/cli.ts`.
- [ ] Push final changes to PR #19.
- [ ] Request a follow-up Codex review.
- [ ] Resolve review findings and confirm green CI.
- [ ] Merge into `develop` and verify issue #17 closes.

## 7. After PR #19

Return to the remaining regression queue, #11–#16.

Treat each defect independently:

1. Preserve its reproducible failing regression.
2. Implement the smallest correction that satisfies its acceptance criteria.
3. Promote the regression into normal CI.
4. Run the complete validation pipeline.
5. Review and merge the corresponding PR.

Do not combine unrelated defect fixes merely because they affect the same subsystem.

### Architectural work to track separately

The P1 investigation also demonstrated that an empty discovered-test set can lead Forge to report successful validation.

Long term, Forge should distinguish:

- No tests are impacted by a change.
- No tests are configured for a target.
- Discovery failed or returned an incomplete result.
- Test impact cannot be determined confidently.

This distinction belongs to Forge's explainable validation and evidence model. It should be considered separately from PR #19, rather than expanding the current fix.

## 8. Working principles

Continue following the established workflow:

**Confirmed defect → failing regression → minimal implementation → passing regression → full validation → independent review → merge.**

Additional constraints:

- Avoid changing regression expectations simply to match implementation behavior.
- Keep production fixes and evidence review separate.
- Prefer real subprocess execution when validating orchestration behavior.
- Verify test identities and counts, not just process exit codes.
- Do not silently replace missing validation with unrelated passing tests.
- Keep MVP implementation focused; record broader architectural concerns separately.

---

**Immediate next task:** Reproduce Codex's P2 path-filter collision in a third #17 regression test. Do not merge PR #19 until exact-file execution has been verified.
