# Supervised Builder pilot work order — Forge #11

**State:** Candidate work order awaiting assignment. Implementation and pilot verification are pending.

## Task

Fix [Forge #11: Java test discovery ignores configured directories](https://github.com/zerogravit1/forge/issues/11).

**Observed baseline defect:** For a Maven target configured with tests under `app/tests`, Forge can discover no tests and return success while an independent Maven execution runs a failing `AppTest`.

The human owner must assign this work order before implementation. The first Builder implementation pilot was the internal Vitest evidence increment in [PR #28](https://github.com/zerogravit1/forge/pull/28).

## Scope

Inspect and change only the code and tests needed to make Java test discovery honor configured test roots.

Start with:

- `src/discovery/java-test-files.ts` — currently hardcodes `src/test/java`.
- `src/validation/create-validation-targets.ts` — currently does not pass the resolved `testRoots` to Java discovery.
- `src/regressions/java-targets.regression.test.ts` — contains the quarantined #11 regression.
- Related Java discovery and target-construction unit tests.

Do not fold unrelated Java source-matching, static-import, or shared-source issues (#12, #15, #16) into this pilot.

## Expected independent behavior

1. A target with `path: "app"` and `tests: ["tests"]` discovers `app/tests/example/AppTest.java`, not an unrelated test in the default directory.
2. The fixture POM's custom `<testSourceDirectory>tests</testSourceDirectory>` is honored during the Maven control run.
3. Forge executes the intended JUnit test and returns a nonzero result for its failing assertion.
4. Existing standard `src/test/java` targets still discover and run correctly.
5. Promote the corrected discovery regression to normal CI once it passes. Verify real execution separately with JDK 21 and Maven.

## Execution and review sequence

1. Read the repository `AGENTS.md`, `docs/engineering/BUILDER_V0.1.md`, the full issue #11 reproduction, and the present discovery/runner code.
2. Record `git rev-parse HEAD`, Node version from `.nvmrc`, actual tool versions, and `npm ci` result. The independent Maven run requires JDK 21 and Maven with working dependencies.
3. Before changing production code, run `FORGE_REGRESSION_BASELINE=1 npm test -- src/regressions -t '#11'`. Confirm the assertion that fails and record the observed result; do not confuse this expected red regression with a passing validation.
4. Propose the smallest change that passes normalized configured test roots through discovery. Check behavior for root `.`, nested project roots, multiple roots, missing roots, and standard layout. Do not silently broaden scope if new failures belong to #12.
5. Implement targeted unit/regression tests and the minimal production change. Keep the negative test that demonstrates incorrect success.
6. Re-run the #11 regression and `npm run check`. Compare discovery with the fixture's declared roots and test identities. The original issue script asserts the defect, so update its assertions when verifying the fix.
7. Create two fresh disposable copies of the same fixture. Run Forge in the first and record its exit and fresh Surefire report before running the direct Maven control in the second. Check each report for exactly one execution and one failure of `example.AppTest`. Verify that Forge excluded the unrelated default-directory test. A missing Forge report leaves its execution unverified even if Forge exits nonzero and the direct control succeeds.
8. Prepare a draft PR with the evidence and limitations, link #11, and follow the Builder charter's independent review handoff.

## Mandatory stop conditions

Escalate if the fix changes the public configuration format, if test-discovery rules conflict with Maven defaults, if zero executed tests are still treated as success, or if the only passing implementation requires weakening the independent regression. If Maven or JDK 21 is unavailable, complete the discovery checks and report the execution control as unverified.

## Evidence handoff

Provide the exact target configuration, discovered and selected tests, commands and versions, and the positive and negative controls. Identify the fixture root, exit status, fresh report, and executed test identities and counts for each invocation. Label checks with missing prerequisites or evidence as **not verified**.
