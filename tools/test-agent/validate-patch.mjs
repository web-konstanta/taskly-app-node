#!/usr/bin/env node
// Checks the agent's patch independently of the agent. Usage: validate-patch.mjs <patch file>
// Prints { status: ok | review | rejected, ... }. Only `ok` may be committed automatically.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isAllowedTestPath } from './policy.mjs';

export const LIMITS = { files: 30, addedLines: 4000 };

const FOCUS_OR_SKIP = /\b(?:it|test|describe|suite)\s*\.\s*(?:only|skip|todo|fails)\b|\b(?:xit|xtest|xdescribe|fit|fdescribe)\s*\(/;
const DANGEROUS = /\bchild_process\b|\beval\s*\(|new\s+Function\s*\(/;
const ASSERTION = /\bexpect(?:\.\w+)?\s*\(|\bassert\b/;
const TEST_CASE = /\b(?:it|test)(?:\.each\([^)]*\))?\s*\(/;

export function validatePatch(patch) {
  const rejected = [];
  const review = [];
  const files = [];
  let addedTotal = 0;
  let current = null;
  let inHunk = false;

  const finish = () => {
    if (!current) return;
    if (current.removedAssertions > current.addedAssertions) {
      review.push(`${current.path}: assertions reduced from ${current.removedAssertions} to ${current.addedAssertions} in the changed lines`);
    }
    if (current.removedCases > current.addedCases) {
      review.push(`${current.path}: test cases removed (${current.removedCases - current.addedCases})`);
    }
    files.push(current);
  };

  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      finish();
      inHunk = false;
      const match = line.match(/^diff --git a\/(\S+) b\/(\S+)$/);
      if (!match) {
        rejected.push(`Unparseable file header: ${line}`);
        current = null;
        continue;
      }
      for (const path of [match[1], match[2]]) {
        if (!isAllowedTestPath(path)) rejected.push(`Path outside the test allowlist: ${path}`);
      }
      current = { path: match[2], added: 0, removed: 0, addedAssertions: 0, removedAssertions: 0, addedCases: 0, removedCases: 0 };
      continue;
    }
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      if (/^(new file mode|deleted file mode|old mode|new mode) /.test(line) && line.includes('120000')) rejected.push(`Symlink not allowed: ${current?.path}`);
      if (/^(old mode|new mode) /.test(line)) rejected.push(`File mode change not allowed: ${current?.path}`);
      if (/^(deleted file mode) /.test(line)) review.push(`${current?.path}: test file deleted`);
      if (/^(GIT binary patch|Binary files )/.test(line)) rejected.push(`Binary content not allowed: ${current?.path}`);
      if (/^(rename|copy) (from|to) /.test(line)) rejected.push(`Rename or copy not allowed: ${current?.path}`);
      if (/^[+-]/.test(line) && !/^(---|\+\+\+) /.test(line)) rejected.push(`Content outside a hunk: ${current?.path}`);
      continue;
    }
    if (!current) continue;
    const content = line.slice(1);
    if (line.startsWith('+')) {
      current.added += 1;
      addedTotal += 1;
      if (ASSERTION.test(content)) current.addedAssertions += 1;
      if (TEST_CASE.test(content)) current.addedCases += 1;
      if (FOCUS_OR_SKIP.test(content)) rejected.push(`Focused or skipped test in ${current.path}: ${content.trim()}`);
      if (DANGEROUS.test(content)) rejected.push(`Dangerous API in ${current.path}: ${content.trim()}`);
    } else if (line.startsWith('-')) {
      current.removed += 1;
      if (ASSERTION.test(content)) current.removedAssertions += 1;
      if (TEST_CASE.test(content)) current.removedCases += 1;
    }
  }
  finish();

  if (patch.trim() && files.length === 0 && rejected.length === 0) rejected.push('Patch has content but no file headers.');
  if (files.length > LIMITS.files) rejected.push(`Too many files: ${files.length} > ${LIMITS.files}`);
  if (addedTotal > LIMITS.addedLines) rejected.push(`Too many added lines: ${addedTotal} > ${LIMITS.addedLines}`);

  const status = rejected.length ? 'rejected' : review.length ? 'review' : 'ok';
  return { status, rejected, review, files: files.map((file) => file.path), empty: files.length === 0 };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validatePatch(readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'rejected' ? 1 : 0;
}
