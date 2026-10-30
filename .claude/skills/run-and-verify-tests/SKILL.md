---
name: run-and-verify-tests
description: Run tests, typecheck, and diagnose failures within the attempt limit. Use after writing or updating tests, before reporting.
---

# Run and verify tests

Only these commands are allowed. Others are refused by a hook, and `&&` chains beyond the `cd` prefix are refused too.

```
cd backend && npx vitest run tests/<file>.test.ts
cd frontend && npx vitest run src/<path>/<file>.test.tsx
cd <area> && npm run test
cd <area> && npm run test:coverage
cd <area> && npm run typecheck
```

Order: the changed test file first, then the area's typecheck, then its full suite. Tests are typechecked in this project, so a test that passes but fails `tsc` is not done.

## When a test fails

Read the actual error, then classify it:

- **Test is wrong** (bad mock, wrong query, wrong expectation about the contract): fix the test.
- **Code looks wrong** (the test states the intended behaviour and the code violates it): do not change the assertion to match. Remove that case and add it to `suspectedBugs`.
- **Already failing before your change, unrelated to it:** do not touch it. Mention it in `summary`.

At most 3 fix attempts per test file. After that, remove what still fails and explain in the decision.

An independent CI job re-runs everything, including repeat runs for flakiness, and discards the patch if anything fails. Your own green run is necessary, not sufficient.
