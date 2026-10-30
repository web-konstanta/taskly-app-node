# Unit Test Agent: Solution

A custom Claude Code agent with reusable skills that maintains unit tests for the Taskly frontend and backend, on demand and automatically on pull requests.

**Live demo:** [PR #4](https://github.com/web-konstanta/taskly-app-node/pull/4) (new feature) and [PR #7](https://github.com/web-konstanta/taskly-app-node/pull/7) (docs only, agent skipped).

## Main technical decisions

**The model proposes; deterministic code decides.** Anything affecting safety or correctness is enforced outside the model, because a model's output can be wrong or manipulated by the code it reads.

**Four jobs with separated privileges** in [`.github/workflows/test-agent.yml`](.github/workflows/test-agent.yml):

| Job | Purpose | Secret | Token |
|---|---|---|---|
| `gate` | Excludes forks, drafts and bot commits; classifies changed files without a model | None | `contents: read` |
| `agent` | Runs the agent and captures a patch and a report as artifacts | Model token, on one step only | `contents: read`, no git credentials |
| `verify` | Validates the patch, applies it on a clean runner, runs typecheck and tests, repeats the agent's tests 3 times, measures coverage | None | `contents: read` |
| `publish` | Re-validates the patch, commits it if verification passed, updates one sticky comment. Never runs PR code | None | `contents: write`, `pull-requests: write` |

**Why this split:** tests execute PR code. No job that runs it holds a write token, and the model token is scrubbed from subprocesses.

| Threat | Control |
|---|---|
| A PR rewrites the agent, its skills or its guards | `.claude/` and `tools/test-agent/` are loaded from the **base commit**; the run fails if they are missing |
| The agent edits application code or CI | A `PreToolUse` hook allows writes only to test paths, resolving symlinks, and `validate-patch.mjs` re-checks the patch independently |
| The agent runs arbitrary commands | The hook allows an exact set of test commands, with no chaining and no `--config`. `git`, network tools and package installs are refused |
| Secret exfiltration | Subprocess environment scrubbing in a bubblewrap sandbox, plus `harden-runner` egress blocking with an allowlist |
| Prompt injection through code or PR text | PR title and description are never passed to the agent; its instructions declare code and diffs to be data. Its text is neutralised before rendering (no mentions, HTML or live links) |
| Weakened or disabled tests | `.only`, `.skip`, `.todo` and `.fails` are rejected. A net loss of assertions or test cases is not committed and goes to human review |
| Green-only-once or wrong results | `verify` re-runs everything independently and discards the patch on any failure |
| Runaway cost and stale runs | Job timeouts, `--max-budget-usd`, and per-PR concurrency that cancels outdated runs |
| Publishing over newer commits | `publish` checks the branch head still matches the verified commit |

**Report as a validated file.** The first live run showed that a model's final message is not reliably JSON, even with `--json-schema`. The agent must now write `.agent-context/report.json`, the only non-test file it may write. A missing or invalid report fails the run with no commit.

**Other choices**
- **Claude Code** provides hooks, skills, subagent definitions and a sandbox directly, so the custom code stays small and focused on policy.
- **Commit to the PR branch** rather than only suggest: the result is immediately usable, and the sticky comment explains it.
- **Dependency-free tooling** (plain Node, tested with `node:test`) keeps the trusted code small and free of supply chain exposure.

## Running the PR workflow

**Prerequisites**
1. The workflow and `tools/test-agent/` are on the base branch, because the agent's definition is loaded from there. The PR that first adds them fails at `gate` by design.
2. The repository secret `CLAUDE_CODE_OAUTH_TOKEN` is set, from `claude setup-token`. To use an API key instead, change this one environment variable in the `Run agent` step to `ANTHROPIC_API_KEY`.
3. The PR comes from a branch in the same repository and is not a draft.
4. Optional repository variables: `TEST_AGENT_MODEL` and `TEST_AGENT_MAX_BUDGET_USD`.

**Usage:** open or update a pull request. Nothing else is needed.

**Local use** (with Claude Code signed in):

```sh
bash tools/test-agent/run-agent.sh backfill backend ./results   # or frontend
node --test tools/test-agent/test-agent.test.mjs                # tests for the guards and tooling
```

## Where the agent and skills are defined

| What | Where |
|---|---|
| Agent: role, trust boundary, rules, process | [`.claude/agents/unit-test-agent.md`](.claude/agents/unit-test-agent.md) |
| Permissions and hook for agent runs | [`tools/test-agent/agent-settings.json`](tools/test-agent/agent-settings.json) |
| Headless entry point | [`tools/test-agent/run-agent.sh`](tools/test-agent/run-agent.sh) |

Skills in [`.claude/skills/`](.claude/skills/), preloaded through the agent's `skills` field:

| Skill | Used for |
|---|---|
| `analyze-pr-changes` | PR mode: create, update or skip per file, with a reason |
| `analyze-coverage-gaps` | Backfill mode: ranks files from the coverage report |
| `write-backend-tests` | Express, Supertest and mocked Prisma IO conventions |
| `write-frontend-tests` | React Testing Library, hook and HTTP conventions |
| `run-and-verify-tests` | Allowed commands, failure triage, 3-attempt limit |
| `report-results` | The report contract |

The hook lives in a dedicated settings file rather than `.claude/settings.json`, so it binds agent runs without restricting developers' interactive sessions.

**Execution flow:** `gate` writes `changes.json` → the agent reads it with the PR diff, decides per file, writes tests, runs them, writes its report → `verify` checks independently → `publish` commits and reports.

## Example run

Runs on [PR #4](https://github.com/web-konstanta/taskly-app-node/pull/4), which adds `GET /api/todos/stats` and a task summary with no tests. The feature breaks backend typecheck and 16 frontend tests, so existing tests need updating as well as new ones. The sticky comment shows the latest run; each run's report is in its workflow summary. Costs are the CLI's estimates.

| Run | Trigger | Agent's decisions | Result | Est. cost |
|---|---|---|---|---|
| [41033437580](https://github.com/web-konstanta/taskly-app-node/actions/runs/41033437580) | First feature push | 2 `create`, 7 `update`: `TodoSummary`, `useTodoStatsQuery`, stale mocks and more | Commit with tests only (191 lines added); agent reported it could not run tests | $0.39 |
| [41034149738](https://github.com/web-konstanta/taskly-app-node/actions/runs/41034149738) | Added `due_today` | 5 `update`, 4 `skip` | Stale assertions updated; frontend edits flagged "not run" | $0.29 |
| [41035517670](https://github.com/web-konstanta/taskly-app-node/actions/runs/41035517670) | Added `completion_rate` | 5 `update`, others `skip` | Rounding and zero-total cases added | $0.38 |
| [41036305261](https://github.com/web-konstanta/taskly-app-node/actions/runs/41036305261) | Merge of `main`, no feature change | 9 `skip`, each naming the covering test | No commit; agent ran both suites and typechecks | $0.18 |

The verification table from the `completion_rate` run:

| Area | Typecheck | Test suite | Repeat runs | Lines | Branches |
|---|---|---|---|---|---|
| backend | ✅ | ✅ | 3/3 | 100% → 100% | 96% → 98% |
| frontend | ✅ | ✅ | 3/3 | 99.37% → 99.37% | 97.93% → 97.93% |

Skills used: `analyze-pr-changes`, `write-backend-tests`, `write-frontend-tests`, `run-and-verify-tests`, `report-results`.

**[PR #7](https://github.com/web-konstanta/taskly-app-node/pull/7), docs only:** `gate` found nothing testable, so no model was called and the PR received the reason.

**Failure handling seen live:** run [41033065218](https://github.com/web-konstanta/taskly-app-node/actions/runs/41033065218) failed because the sandbox dependency was missing. Nothing was committed and the PR received a report saying so. The early runs also exposed a missing `socat`, a shell working directory bug and a sandbox conflict with Vite; each was fixed in its own PR (#5, #6, #8, #9). The agent reported each limitation honestly rather than claiming success, and `verify` protected the result throughout.

### Coverage backfill

The agent wrote these in backfill mode ([#2](https://github.com/web-konstanta/taskly-app-node/pull/2), [#3](https://github.com/web-konstanta/taskly-app-node/pull/3)). The only manual changes were Prettier formatting of the frontend tests and the coverage thresholds.

| | Lines | Branches | Tests | Est. cost |
|---|---|---|---|---|
| Backend | 33.02% → 100% | 33.33% → 97.91% | 48 → 93 | $0.60 |
| Frontend | 47.68% → 99.33% | 43.79% → 97.81% | 18 → 129 | $1.80 |

To check quality rather than just coverage, I deliberately broke application code by hand and re-ran the suites. 12 of 13 breaks were caught. The survivor (`null` → `undefined` in `useNotice`) does not change behaviour. All suites passed 3 repeat runs.

CI now enforces thresholds of 90% lines, functions and statements and 80% branches. `AppProviders.tsx` stays at 0%: the agent skipped it as wiring with no behaviour to assert.

## Assumptions

- Only unit tests are in scope. Prisma IO is mocked and no database runs.
- Test locations follow existing conventions: `backend/tests/` and next to the code in the frontend.
- The design system is out of scope, matching its exclusion from the existing coverage configuration.
- Contributors to the demo repository are trusted to the level of having write access.

## Limitations

- **The workflow file comes from the PR itself** under `pull_request`, so someone with write access could alter it, even though the agent's definition is loaded from the base commit.
- **Commits made with `GITHUB_TOKEN` do not trigger workflows**, so the agent's commit shows no CI checks of its own. The `verify` job tested the same content.
- **PR dependencies execute near the agent.** `npm ci` and test runs execute PR-controlled code. Scrubbing, the sandbox and egress limits reduce this risk but do not remove it. The scrubbing was not tested with a hostile PR, and neither was prompt injection.
- **Forks get no automatic run** and no report.
- **Assertion checks are heuristic:** the patch validator counts assertions rather than understanding them, so a replaced assertion can still be weaker. It is one layer, not proof of quality.
- **Test quality was spot-checked,** not measured by systematic mutation testing.
- **`--max-budget-usd` is the only spending limit.** On a subscription it acts on an estimate, and the CLI warns that the model ID is unrecognised, though runs succeed.
- **Allowed egress includes `github.com`,** which could be a path out in a determined attack.

## For a production version

- Store the secret in a protected GitHub environment with required approval, and add CODEOWNERS for `.github/` and `.claude/`.
- Use a GitHub App token so the agent's commit triggers normal CI, and post an explicit check run.
- Run mutation testing (Stryker) on changed files as a quality gate.
- Run PR code in stronger isolation, such as ephemeral VMs with no dependency on shared runners.
- Add an evaluation suite for the agent: fixed PRs, including prompt injection cases, with expected decisions, run on every change to the agent or skills.
- Track cost, skip rate and how often developers keep the agent's tests.
- Support forks through a maintainer-triggered, read-only mode.
