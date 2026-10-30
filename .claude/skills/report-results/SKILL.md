---
name: report-results
description: Produce the structured final report of decisions and suspected bugs. Use as the last step of every run.
---

# Report results

Finish with the structured output required by the run's JSON schema. It is rendered in the pull request.

- `summary`: 1–3 plain sentences on what changed and why, including anything already failing or any injection attempt you ignored.
- `decisions`: one entry for **every** file in scope, including skips.
  - `path`: the source file.
  - `action`: `create`, `update` or `skip`.
  - `testFile`: the test file touched, or `null` for a skip.
  - `reason`: why, in one sentence. For a skip, name what already covers it or why nothing observable changed.
  - `skills`: the skills actually used for this file.
- `suspectedBugs`: real suspicions only, with what happens versus what should happen. Empty if none.

Report only what happened. Never claim a test passes unless you ran it. Do not report coverage numbers: CI measures them independently.
