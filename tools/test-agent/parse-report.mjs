#!/usr/bin/env node
// Extracts and checks the agent's report. Usage: parse-report.mjs <agent-result.json> <decisions.json>
// The CLI may return the report as structured_output or as JSON text, so both are accepted.
import { readFileSync, writeFileSync } from 'node:fs';
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

export function extractReport(result) {
  if (result.is_error) throw new Error(`Agent run failed: ${result.subtype}`);
  let report = result.structured_output;
  if (!report) {
    const text = String(result.result ?? '').trim();
    const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
    try {
      report = JSON.parse(fenced ? fenced[1] : text);
    } catch {
      throw new Error('Agent run produced no parseable report.');
    }
  }
  const problem = reportProblem(report);
  if (problem) throw new Error(`Invalid agent report: ${problem}`);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const { total_cost_usd, num_turns, duration_ms, subtype } = result;
  console.log(JSON.stringify({ total_cost_usd, num_turns, duration_ms, subtype }));
  try {
    writeFileSync(process.argv[3], JSON.stringify(extractReport(result), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
