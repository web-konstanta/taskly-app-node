#!/usr/bin/env bash
# Runs the unit test agent headlessly.
#   run-agent.sh pr <output dir>                  expects .agent-context/{changes.json,pr.diff}
#   run-agent.sh backfill <backend|frontend> <output dir>
set -euo pipefail

mode="${1:?usage: run-agent.sh pr|backfill ...}"
root="$(git rev-parse --show-toplevel)"
tools="$root/tools/test-agent"
cd "$root"

case "$mode" in
  pr)
    out="${2:?output dir required}"
    test -f .agent-context/changes.json && test -f .agent-context/pr.diff
    prompt="PR mode. Follow your process for the files listed as testable in .agent-context/changes.json, using .agent-context/pr.diff."
    ;;
  backfill)
    area="${2:?area required}"
    out="${3:?output dir required}"
    case "$area" in backend|frontend) ;; *) echo "unknown area: $area" >&2; exit 64 ;; esac
    prompt="Backfill mode for the $area area. Close its meaningful unit test coverage gaps, working through the whole coverage report."
    ;;
  *) echo "unknown mode: $mode" >&2; exit 64 ;;
esac

mkdir -p "$out" .agent-context
rm -f .agent-context/report.json # A stale report must never pass for this run.

# The subprocess scrub removes the API key from everything the agent runs, including tests.
export CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
export DISABLE_AUTOUPDATER=1
# Each command starts at the repository root, so the guard's `cd <area> &&` prefix works for both areas.
export CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR=1

claude -p "$prompt" \
  --agent unit-test-agent \
  --model "${TEST_AGENT_MODEL:-claude-sonnet-5-5}" \
  --setting-sources project \
  --settings "$tools/agent-settings.json" \
  --tools "Read,Grep,Glob,Edit,Write,Bash,Skill" \
  --allowedTools "Read,Grep,Glob,Edit,Write,Skill,Bash(npm run *),Bash(npx vitest run *),Bash(cd backend && *),Bash(cd frontend && *)" \
  --strict-mcp-config \
  --no-session-persistence \
  --max-budget-usd "${TEST_AGENT_MAX_BUDGET_USD:-5}" \
  --output-format json \
  > "$out/agent-result.json"

node "$tools/parse-report.mjs" "$out/agent-result.json" .agent-context/report.json "$out/decisions.json"
