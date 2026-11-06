# Regression baseline

These seven tests describe the required behavior for confirmed defects
[#11–#17](https://github.com/zerogravit1/forge/issues). They intentionally fail
against the reviewed production implementation at commit
[`6aaef70`](https://github.com/zerogravit1/forge/commit/6aaef70ed7d5558c62c173c6db666b5d265428ff).
The branch `test/regression-baseline` contains tests and this report only; it does
not fix the implementation.

## Running the tests

Use the Node version in `.nvmrc` and install the locked dependencies with `npm ci`.
From the repository root:

```bash
# Opt in to all seven regression tests. Expected baseline result: seven failures.
FORGE_REGRESSION_BASELINE=1 npm test -- src/regressions

# Select a single issue, for example #13.
FORGE_REGRESSION_BASELINE=1 npm test -- src/regressions -t '#13'

# Normal passing CI workflow; the seven new tests are skipped.
npm run check
```

The opt-in follows the existing `FORGE_MAVEN_INTEGRATION` test-gating pattern.
Normal CI does not set `FORGE_REGRESSION_BASELINE`, so it does not execute these
tests. This is an explicit quarantine, not `it.fails`, an inverted assertion, or
a disabled assertion. Opting in runs ordinary assertions of the required
behavior and returns a nonzero status until the defects are corrected.

All fixtures are created in disposable temporary directories and removed after
each test. No Git history, network service, Maven installation, or JDK is needed.
The Java cases test dependency analysis, configured discovery, and routing using
small source files. The TypeScript isolation case uses real Vitest discovery
and execution with the already installed dependencies, and checks fresh JSON
reports. It requires normal subprocess permissions; restricted execution can
otherwise produce unrelated process errors.

## Issue-to-test mapping

The expected lists below come from the fixture's declared dependencies and
configuration. They are not derived from Forge's output. Tests also check
exclusion of unrelated files or targets. Controls establish that an alias, an
ordinary nested Java target, B's dependency graph, and the package's Vitest
configuration work independently of the defective operation.

| Issue                                                 | Regression test                                                              | Expected behavior                                                                                                                        | Observed failure at `6aaef70`                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [#11](https://github.com/zerogravit1/forge/issues/11) | [Java target roots](java-targets.regression.test.ts), `#11`                  | Discover `app/tests/example/AppTest.java`; exclude the unconfigured default directory.                                                   | Discovery returns `app/src/test/java/example/UnrelatedTest.java` instead.                                                                   |
| [#12](https://github.com/zerogravit1/forge/issues/12) | [Java target roots](java-targets.regression.test.ts), `#12`                  | Root `.` matches both Git-relative source and test paths. A nested target must exclude the similarly named `application/` directory.     | Both root-target matches return `false`; nested-target and directory-boundary controls pass.                                                |
| [#13](https://github.com/zerogravit1/forge/issues/13) | [TypeScript dependencies](typescript-dependencies.regression.test.ts), `#13` | Select static and dynamic consumers of `value.ts`, exclude the unrelated consumer; an unrelated source change selects only its own test. | Only the static consumer is selected for `value.ts`.                                                                                        |
| [#14](https://github.com/zerogravit1/forge/issues/14) | [TypeScript dependencies](typescript-dependencies.regression.test.ts), `#14` | Select relative and valid project-alias consumers, excluding unrelated tests in both change directions.                                  | Only the relative consumer is selected, although TypeScript resolves the configured alias independently.                                    |
| [#15](https://github.com/zerogravit1/forge/issues/15) | [Java dependencies](java-dependencies.regression.test.ts), `#15`             | Select both normal and static-import consumers of `Rules`, excluding a class that only shares its package.                               | The static-import consumer is omitted.                                                                                                      |
| [#16](https://github.com/zerogravit1/forge/issues/16) | [Shared Java sources](shared-java-sources.regression.test.ts), `#16`         | Select A and B and their affected tests for the explicitly shared source; exclude unrelated tests and target C.                          | The global plan contains only A, although direct planning for B correctly maps the source to B's test.                                      |
| [#17](https://github.com/zerogravit1/forge/issues/17) | [TypeScript target isolation](typescript-target.regression.test.ts), `#17`   | Discover and execute the configured package's test, producing its fresh report without running root or sibling tests.                    | Discovery returns the unrelated root test; Forge produces a root report and no package report. The direct package execution control passes. |

Each row has its own reproduction command; the issue number is the test filter:

```bash
FORGE_REGRESSION_BASELINE=1 npm test -- src/regressions -t '#11'
FORGE_REGRESSION_BASELINE=1 npm test -- src/regressions -t '#12'
FORGE_REGRESSION_BASELINE=1 npm test -- src/regressions -t '#13'
FORGE_REGRESSION_BASELINE=1 npm test -- src/regressions -t '#14'
FORGE_REGRESSION_BASELINE=1 npm test -- src/regressions -t '#15'
FORGE_REGRESSION_BASELINE=1 npm test -- src/regressions -t '#16'
FORGE_REGRESSION_BASELINE=1 npm test -- src/regressions -t '#17'
```

All seven findings reproduce. None remain unverified. Assertions on discovery,
selection, and routing fail for their corresponding defects, rather than a
missing tool or an intentionally failing fixture assertion. For #17 the fixture
tests themselves pass; the regression fails because Forge executes the wrong
project.

## Baseline verification

The branch starts directly at `6aaef70`. Before adding the test-only commit, its
production tree is exactly that reviewed commit. Verification consists of:

1. Running the opt-in suite against that unchanged production tree and checking
   that exactly seven tests execute and fail at the assertions described above.
2. Running each issue filter individually to confirm it executes exactly its
   corresponding regression test.
3. Running `npm run check` with opt-in disabled: type checking, lint, existing
   tests, formatting, and the production build must still pass.
4. Confirming the final diff contains only this directory's test files and
   documentation.

Observed results at the reviewed implementation:

- Opt-in suite: **7 executed, 7 failed**, all at the defect assertions above.
- Each issue filter: **1 failed**, with the other six regressions skipped; no
  setup, import, or timeout errors substituted for the expected failure.
- Normal `npm run check`: **95 passed, 8 skipped**. Seven skips are this
  quarantined baseline; the eighth is the existing optional Maven integration
  test. Type checking, lint, formatting, and the build pass.
- The production implementation, dependency manifests, lockfile, and existing
  tests are unchanged from `6aaef70`.

Promote these tests into normal CI only after the remediation sequence has been
reviewed and the corresponding fixes are implemented. Do not change the
expectations to match the current omissions or substitute unrelated tests.
