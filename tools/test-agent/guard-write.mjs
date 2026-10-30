#!/usr/bin/env node
// PreToolUse hook: exit code 2 blocks the tool call and shows stderr to the agent.
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isAllowedTestPath } from './policy.mjs';

const VITEST_FLAGS = new Set(['--coverage', '--reporter=dot', '--reporter=verbose', '--silent']);
const TEST_ARGUMENT = /^(tests|src)\/[\w./-]+$/;

export function checkBashCommand(command) {
  if (typeof command !== 'string') return 'Missing command.';
  const match = command.trim().match(/^(?:cd (backend|frontend) && )?(.+)$/s);
  const body = match[2];
  if (/^npm run (test|test:coverage|typecheck)$/.test(body)) return null;
  const words = body.split(' ');
  if (words[0] === 'npx' && words[1] === 'vitest' && words[2] === 'run') {
    const bad = words.slice(3).find((word) => !VITEST_FLAGS.has(word) && (!TEST_ARGUMENT.test(word) || word.includes('..')));
    return bad === undefined ? null : `Argument not allowed: ${bad}`;
  }
  return 'Only `npm run test|test:coverage|typecheck` and `npx vitest run <test files>` are allowed, optionally prefixed with `cd backend && ` or `cd frontend && `.';
}

// Resolves symlinks in the existing part of the path so a link cannot redirect a write.
function realPathOf(path) {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : resolve(realPathOf(parent), path.slice(parent.length + 1));
  }
}

export function checkWritePath(filePath, projectDir) {
  if (typeof filePath !== 'string') return 'Missing file path.';
  const root = realPathOf(projectDir);
  const absolute = realPathOf(isAbsolute(filePath) ? filePath : resolve(projectDir, filePath));
  const path = relative(root, absolute);
  return isAllowedTestPath(path) ? null : `Writes are limited to unit test files; refused: ${path}`;
}

export function evaluate(event, projectDir) {
  const input = event.tool_input ?? {};
  if (event.tool_name === 'Bash') return checkBashCommand(input.command);
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(event.tool_name)) {
    return checkWritePath(input.file_path ?? input.notebook_path, projectDir);
  }
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let refusal;
  try {
    const event = JSON.parse(readFileSync(0, 'utf8'));
    refusal = evaluate(event, process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd());
  } catch (error) {
    refusal = `Guard failed closed: ${error.message}`;
  }
  if (refusal) {
    console.error(refusal);
    process.exit(2);
  }
}
