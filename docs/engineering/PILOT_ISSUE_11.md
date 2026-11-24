# Supervised Builder pilot work order — Forge #11

**State:** Prepared for assignment. **No implementation, baseline execution, or review is claimed by this file.**

## Task

Fix [Forge #11: Java test discovery ignores configured directories](https://github.com/zerogravit1/forge/issues/11).

**Observed baseline defect:** For a Maven target configured with tests under `app/tests`, Forge can discover no tests and return success while an independent Maven execution runs a failing `AppTest`.

**Human approval gate:** This is the proposed first supervised Builder regression pilot, not permission to merge or publish a change. The human owner may redirect the pilot to the TypeScript evidence milestone before implementation.

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
5. The #11 regression is promoted from quarantine to normal CI once it passes against the fix.

## Execution and review sequence

1. Read the repository `AGENTS.md`, `docs/engineering/BUILDER_V0.1.md`, the full issue #11 reproduction, and the present discovery/runner code.
2. Record `git rev-parse HEAD`, Node version from `.nvmrc`, actual tool versions, and `npm ci` result. The independent Maven run requires JDK 21 and Maven with working dependencies.
3. Before changing production code, run `FORGE_REGRESSION_BASELINE=1 npm test -- src/regressions -t '#11'`. Confirm the assertion that fails and record the observed result; do not confuse this expected red regression with a passing validation.
4. Propose the smallest change that passes normalized configured test roots through discovery. Check behavior for root `.`, nested project roots, multiple roots, missing roots, and standard layout. Do not silently broaden scope if new failures belong to #12.
5. Implement targeted unit/regression tests and the minimal production change. Keep the negative test that demonstrates incorrect success.
6. Re-run the #11 regression and `npm run check`, and independently execute the disposable Maven fixture from #11. **The issue's original reproduction script asserts the broken behavior and must be updated or inverted for proof of the fix.**
7. Verify actual JUnit identity/count in a fresh Surefire report, observed Maven failure exit status, and Forge's nonzero result. Compare discovery against fixture expectations independent of Forge.
8. Prepare a draft PR with a concise explanation, tests, environment, observed results, unresolved risks, and links back to #11. Request independent code review. **Do not merge.**

## Mandatory stop conditions

Escalate if Maven cannot run, if the fix changes the public configuration format, if test-discovery rules conflict with Maven defaults, if zero executed tests are still treated as success, or if the only passing implementation requires weakening the independent regression.

## Evidence handoff

Provide the exact target configuration, discovered test identities, selected test identities, actual executed test identities/counts, runner exit codes, commands and versions, and both positive and negative controls. Missing environment prerequisites or unavailable checks must be labeled **not verified**, never inferred as passing.
