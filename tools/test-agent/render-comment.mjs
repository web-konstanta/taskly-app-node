#!/usr/bin/env node
// Builds the sticky PR comment from the run's JSON results. Usage: render-comment.mjs <results dir>
// Everything the agent or the PR's code produced is untrusted, so it is neutralised before rendering.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MARKER = '<!-- test-agent-report -->';

export function sanitize(value, maxLength = 400) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_[\]|!#~]/g, (char) => `\\${char}`)
    .replace(/@/g, '@​') // No notifications from agent text.
    .replace(/(https?):\/\//gi, '$1[:]//') // No live links from agent text.
    .slice(0, maxLength);
}

function code(path) {
  return /^[\w./-]+$/.test(String(path)) ? `\`${path}\`` : sanitize(path);
}

function percent(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : 'n/a';
}

function headline({ gate, jobs, verify, validation, published }) {
  if (gate && !gate.runAgent) return ['⏭️', 'Agent not run: no testable source changes'];
  if (jobs?.agent && jobs.agent !== 'success') return ['⚠️', `Agent job ended with: ${sanitize(jobs.agent, 40)}. Nothing was committed`];
  if (validation?.status === 'rejected') return ['⛔', 'Patch rejected by policy. Nothing was committed'];
  if (validation?.status === 'review') return ['✋', 'Patch needs human review. Nothing was committed'];
  if (jobs?.verify && jobs.verify !== 'success') return ['❌', 'Verification failed. Nothing was committed'];
  if (validation?.empty) return ['✅', 'No test changes needed'];
  if (published?.pushed) return ['✅', 'Tests verified and committed to this branch'];
  if (published?.reason) return ['⚠️', `Tests verified but not committed: ${sanitize(published.reason, 120)}`];
  return ['⚠️', 'Run finished without a commit'];
}

export function renderComment(run) {
  const { gate, decisions, validation, verify, runUrl, headSha, published } = run;
  const [icon, title] = headline(run);
  const lines = [MARKER, `## ${icon} Unit Test Agent`, '', `**${title}**`, ''];
  if (decisions?.summary) lines.push(sanitize(decisions.summary, 600), '');

  if (decisions?.decisions?.length) {
    lines.push('### Decisions', '', '| Source | Action | Test file | Why | Skills |', '|---|---|---|---|---|');
    for (const item of decisions.decisions) {
      lines.push(`| ${code(item.path)} | ${sanitize(item.action, 10)} | ${item.testFile ? code(item.testFile) : '-'} | ${sanitize(item.reason, 300)} | ${(item.skills ?? []).map((skill) => sanitize(skill, 40)).join(', ')} |`);
    }
    lines.push('');
  }
  if (decisions?.suspectedBugs?.length) {
    lines.push('### ⚠️ Suspected bugs in the changed code', '');
    for (const bug of decisions.suspectedBugs) lines.push(`- ${code(bug.path)}: ${sanitize(bug.description)}`);
    lines.push('');
  }
  for (const [heading, items] of [['Rejected by policy', validation?.rejected], ['Needs human review', validation?.review]]) {
    if (items?.length) {
      lines.push(`### ${heading}`, '');
      for (const item of items) lines.push(`- ${sanitize(item)}`);
      lines.push('');
    }
  }
  if (verify?.areas && Object.keys(verify.areas).length) {
    lines.push('### Verification', '', '| Area | Typecheck | Test suite | Repeat runs of agent tests | Lines | Branches |', '|---|---|---|---|---|---|');
    for (const [area, result] of Object.entries(verify.areas)) {
      const cov = result.coverage ?? {};
      const metric = (name) => `${percent(cov[name]?.before)} → ${percent(cov[name]?.after)}`;
      lines.push(`| ${sanitize(area, 20)} | ${result.typecheck === 'pass' ? '✅' : '❌'} | ${result.tests === 'pass' ? '✅' : '❌'} | ${sanitize(result.repeat ?? 'n/a', 20)} | ${metric('lines')} | ${metric('branches')} |`);
    }
    lines.push('');
  }
  if (gate?.ignored?.length) {
    lines.push('<details><summary>Files not considered</summary>', '');
    for (const file of gate.ignored) lines.push(`- ${code(file.path)}: ${sanitize(file.reason, 80)}`);
    lines.push('', '</details>', '');
  }
  const footer = [headSha && `commit ${code(headSha.slice(0, 12))}`, runUrl && `[workflow run](${runUrl})`].filter(Boolean).join(' · ');
  if (footer) lines.push(`<sub>${footer}</sub>`);
  return lines.join('\n');
}

function load(dir, name) {
  const path = join(dir, name);
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  } catch {
    return null; // A corrupt artifact must not stop the report.
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  console.log(renderComment({
    gate: load(dir, 'gate.json'),
    decisions: load(dir, 'decisions.json'),
    validation: load(dir, 'validation.json'),
    verify: load(dir, 'verify.json'),
    published: load(dir, 'published.json'),
    jobs: { agent: process.env.AGENT_RESULT, verify: process.env.VERIFY_RESULT },
    runUrl: process.env.RUN_URL,
    headSha: process.env.HEAD_SHA,
  }));
}
