#!/usr/bin/env node
// Checks the report file the agent must write. Usage: parse-report.mjs <agent-result.json> <report.json> <decisions.json>
// A file is the contract because a model's final message is not reliably JSON, even with --json-schema.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ACTIONS = new Set(['create', 'update', 'skip']);
const isText = (value) => typeof value === 'string';

export function reportProblem(report) {
  if (typeof report !== 'object' || report === null) return 'report is not an object';
  if (!isText(report.summary)) return 'summary must be a string';
  if (!Array.isArray(report.decisions)) return 'decisions must be an array';
  if (!Array.isArray(report.suspectedBugs)) return 'suspectedBugs must be an array';
  for (const item of report.decisions) {
    if (!isText(item?.path) || !isText(item?.reason) || !ACTIONS.has(item?.action)) return `invalid decision: ${JSON.stringify(item)}`;
    if (item.testFile !== null && !isText(item.testFile)) return `invalid testFile: ${JSON.stringify(item)}`;
    if (!Array.isArray(item.skills) || !item.skills.every(isText)) return `invalid skills: ${JSON.stringify(item)}`;
  }
  for (const bug of report.suspectedBugs) {
    if (!isText(bug?.path) || !isText(bug?.description)) return `invalid suspected bug: ${JSON.stringify(bug)}`;
  }
  return null;
}

export function extractReport(result, reportText) {
  if (result.is_error) throw new Error(`Agent run failed: ${result.subtype}`);
  if (reportText === null) throw new Error('Agent run wrote no report file.');
  let report;
  try {
    report = JSON.parse(reportText);
  } catch {
    throw new Error('Agent report is not valid JSON.');
  }
  const problem = reportProblem(report);
  if (problem) throw new Error(`Invalid agent report: ${problem}`);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [resultPath, reportPath, outputPath] = process.argv.slice(2);
  const result = JSON.parse(readFileSync(resultPath, 'utf8'));
  const { total_cost_usd, num_turns, duration_ms, subtype } = result;
  console.log(JSON.stringify({ total_cost_usd, num_turns, duration_ms, subtype }));
  try {
    const reportText = existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : null;
    writeFileSync(outputPath, JSON.stringify(extractReport(result, reportText), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
