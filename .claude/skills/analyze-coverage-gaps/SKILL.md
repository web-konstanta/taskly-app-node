---
name: analyze-coverage-gaps
description: Choose which files to test first from a coverage report. Use in backfill mode when closing existing coverage gaps.
---

# Analyze coverage gaps

1. Run `npm run test:coverage` in the area named by the task, as described in `run-and-verify-tests`.
2. Read `coverage/coverage-summary.json` and rank files by uncovered branches, then uncovered lines.
3. Prefer, in order: request handling and error paths; business logic and state (hooks, mutations, utilities); UI branches (loading, error, empty, disabled); thin wiring.
4. Skip what has no behaviour to assert. Report it as a `skip` with the reason instead of writing a test that only executes the lines.

Do not aim for a number at the cost of meaningful assertions. Record each file you acted on or skipped as a decision.
