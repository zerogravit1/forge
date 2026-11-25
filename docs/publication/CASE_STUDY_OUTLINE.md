# Publication brief — Trustworthy test selection in Forge

**Status:** Working outline, **not** a published article. Publication is conditional on independently reproducible evidence (Forge [#26](https://github.com/zerogravit1/forge/issues/26)).

## Working title

**Fast Tests, False Confidence: What It Takes to Trust Test Selection**

## Audience and engineering question

Quality engineers, test-infrastructure engineers, platform engineers, and teams integrating AI-assisted development into CI.

**Question:** How can a test-selection tool reduce validation work without silently omitting affected tests or treating missing execution proof as success?

## Proposed narrative

1. **The tempting metric:** Number of tests skipped and duration saved are easy to report but cannot alone establish safe selection.
2. **Concrete false-success controls:** A nested TypeScript target running the wrong Vitest project (#17), a missing dynamic import dependency (#13), and a project alias omitted from analysis (#14). Each requires independent failure and identity controls.
3. **What we fixed:** Point to merged PRs [#19](https://github.com/zerogravit1/forge/pull/19), [#22](https://github.com/zerogravit1/forge/pull/22), and [#23](https://github.com/zerogravit1/forge/pull/23).
4. **What became faster:** Dependency-analysis caching in merged [PR #24](https://github.com/zerogravit1/forge/pull/24). Its reported before/after measurements were 53.183 s → 1.732 s for dependency analysis, 52.30 s → 2.61 s for planning, and 76.18 s → 28.20 s for execution. These are measurements from a particular experiment, **not** universal product benchmarks.
5. **What execution evidence now shows:** Merged [PR #28](https://github.com/zerogravit1/forge/pull/28) records intended and observed specifications inside the Vitest runner. Its interrupted-teardown control observed a passing test and exit zero while shutdown remained unverified. Test outcomes, execution completeness, shutdown, and process status are separate evidence. The shared runner interface still gives the CLI the process exit status.
6. **Where strict execution stops:** Forge's own worker-only change was unmapped and selected zero tests before and after PR #28. The full PR plan selected nine files yet still reported the worker unmapped, so `run` refused to execute. The TypeScript analyzer misses subprocess launches. Keep that discovery gap separate from the proposed opt-in fallback for an established target, which would retain the original selection uncertainty. [Evidence design and roadmap](../evidence/EVIDENCE_CONTRACT_V0.1.md)
7. **What remains open:** Traceable per-test inclusion and exclusion reasons, fallback policy, and a portable evidence artifact are parts of the [#26](https://github.com/zerogravit1/forge/issues/26) roadmap. Four quarantined Java regressions (#11, #12, #15, #16) and packaging and installation limitations remain distinct from the TypeScript results.

## Evidence package required before publication

- Exact Forge commit/release and dependency/tool versions.
- Cloneable independent fixture, source modifications, and expected impact matrix created independently of Forge.
- Commands for selected and complete Vitest runs, observed test identities, invocation-bound results, shutdown status, process exit status, and correctness assertions. For any approved fallback, show the original uncertainty, the authorized scope, and the observed outcome.
- Source and conditions for performance measurements, number of runs, variance where available, and comparison limitations.
- Link to a versioned evidence contract or prototype; explicitly mark any proposed fields unavailable in the current CLI.
- Clear description of known false-negative and false-positive limitations.

## Publication sequence

1. Create the reproducible evidence package in Forge; seek independent technical review.
2. Publish the full case study on the personal website (canonical source) or DEV Community, and maintain links to supporting GitHub artifacts.
3. Publish a short LinkedIn engineering observation linking to the study; invite critique of correctness controls and measurement methodology.
4. Record links, discussion, and follow-up issues in Plane when accessible.

## Suggested LinkedIn thesis, not final copy

A test-selection run can finish quickly and pass every selected test while still missing a failing test. The difficult part is proving that the selection and execution were complete. Forge's regression fixtures show why dependency paths, target boundaries, actual test identities, and explicit uncertainty all matter.

**Do not publish a speedup figure without the experiment's scope. Do not claim that the evidence artifact is implemented until it is.**
