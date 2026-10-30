#!/usr/bin/env node
// Reads `git diff --name-status` from stdin and decides, without any LLM, whether the agent should run.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { classifyFile } from './policy.mjs';

export function classifyChanges(nameStatus) {
  const result = { runAgent: false, areas: [], testable: [], tests: [], ignored: [] };
  for (const line of nameStatus.split('\n').filter(Boolean)) {
    const columns = line.split('\t');
    const status = columns[0][0];
    const path = columns.at(-1); // Renames list the old path first.
    const file = classifyFile(path, status);
    if (file.kind === 'testable') result.testable.push({ path, area: file.area, status });
    else if (file.kind === 'test') result.tests.push({ path, area: file.area, status });
    else result.ignored.push({ path, reason: file.reason });
  }
  result.areas = [...new Set(result.testable.map((file) => file.area))].sort();
  result.runAgent = result.testable.length > 0;
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(classifyChanges(readFileSync(0, 'utf8')), null, 2));
}
