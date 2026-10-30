#!/usr/bin/env bash
# Independent verification, run with no secrets. Usage: verify.sh <tools dir> <patch> <results dir> <areas...>
# Records the outcome in verify.json and exits non-zero if any check failed.
set -uo pipefail

tools="$1"; patch="$2"; results="$3"; shift 3
root="$(pwd)"
status=0
area_results='{}'

coverage_run() { # <area> <copy target>
  # Failing tests are expected here, and the report is still needed as the baseline.
  (cd "$root/$1" && npx vitest run --coverage --coverage.reportOnFailure >/dev/null 2>&1)
  local code=$?
  cp "$root/$1/coverage/coverage-summary.json" "$2" 2>/dev/null || true
  return $code
}

# Coverage of the PR without the agent's tests. The PR's own failures do not stop the run here.
for area in "$@"; do coverage_run "$area" "$results/$area-before.json"; done

if [ -s "$patch" ]; then
  git apply --check "$patch" && git apply "$patch" || { echo "Patch does not apply" >&2; exit 1; }
fi

for area in "$@"; do
  echo "::group::$area"
  typecheck=pass; tests=pass; repeat=n/a
  (cd "$area" && npm run typecheck) || { typecheck=fail; status=1; }
  (cd "$area" && npm run test:coverage) || { tests=fail; status=1; }
  cp "$area/coverage/coverage-summary.json" "$results/$area-after.json" 2>/dev/null || true

  mapfile -t files < <(node -e '
    const result = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    for (const file of result.files) if (file.startsWith(process.argv[2] + "/") && /\.test\.tsx?$/.test(file)) console.log(file.slice(process.argv[2].length + 1));
  ' "$results/validation.json" "$area")
  if [ "${#files[@]}" -gt 0 ]; then
    passed=0
    for attempt in 1 2 3; do
      (cd "$area" && npx vitest run "${files[@]}") && passed=$((passed + 1))
    done
    repeat="$passed/3"
    [ "$passed" -eq 3 ] || status=1
  fi
  echo "::endgroup::"

  coverage="$(node "$tools/coverage-delta.mjs" "$results/$area-before.json" "$results/$area-after.json")"
  area_results="$(node -e '
    const [all, area, typecheck, tests, repeat, coverage] = process.argv.slice(1);
    console.log(JSON.stringify({ ...JSON.parse(all), [area]: { typecheck, tests, repeat, coverage: JSON.parse(coverage) } }));
  ' "$area_results" "$area" "$typecheck" "$tests" "$repeat" "$coverage")"
done

node -e 'console.log(JSON.stringify({ areas: JSON.parse(process.argv[1]) }, null, 2))' "$area_results" > "$results/verify.json"
exit "$status"
