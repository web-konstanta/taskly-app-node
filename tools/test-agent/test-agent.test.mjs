import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyChanges } from './classify-changes.mjs';
import { coverageDelta } from './coverage-delta.mjs';
import { checkBashCommand, checkWritePath, evaluate } from './guard-write.mjs';
import { extractReport } from './parse-report.mjs';
import { isAllowedTestPath } from './policy.mjs';
import { MARKER, renderComment, sanitize } from './render-comment.mjs';
import { validatePatch } from './validate-patch.mjs';

const patchFor = (path, body, extra = '') => `diff --git a/${path} b/${path}\n${extra}--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,1 @@\n${body}\n`;

describe('policy', () => {
  it('allows only test files', () => {
    for (const path of ['backend/tests/x.test.ts', 'frontend/src/a/B.test.tsx', 'backend/tests/fixture.ts']) assert.equal(isAllowedTestPath(path), true, path);
    for (const path of ['backend/src/x.ts', 'frontend/src/a/B.tsx', '.github/workflows/x.test.ts', 'backend/tests/../src/x.test.ts', 'backend/package.json', 'tools/test-agent/x.test.mjs']) assert.equal(isAllowedTestPath(path), false, path);
  });
});

describe('classifyChanges', () => {
  it('runs the agent for application source only', () => {
    const result = classifyChanges('M\tbackend/src/features/todos/router.ts\nA\tfrontend/src/features/todos/components/X.tsx\nM\tREADME.md\n');
    assert.equal(result.runAgent, true);
    assert.deepEqual(result.areas, ['backend', 'frontend']);
  });
  it('skips docs, stories, generated code, types and deleted sources', () => {
    const result = classifyChanges(['M\tREADME.md', 'M\tfrontend/src/design-system/components/Alert/Alert.tsx', 'M\tfrontend/src/x.stories.tsx', 'M\tbackend/src/generated/prisma/client.ts', 'M\tbackend/src/features/todos/types.ts', 'D\tbackend/src/api/health.ts'].join('\n'));
    assert.equal(result.runAgent, false);
    assert.equal(result.ignored.length, 6);
  });
  it('does not run for test-only changes and uses the new path of renames', () => {
    assert.equal(classifyChanges('M\tbackend/tests/router.test.ts').runAgent, false);
    assert.equal(classifyChanges('R100\tbackend/src/a.ts\tbackend/src/b.ts').testable[0].path, 'backend/src/b.ts');
  });
});

describe('write guard', () => {
  const root = mkdtempSync(join(tmpdir(), 'guard-'));
  mkdirSync(join(root, 'backend/tests'), { recursive: true });
  mkdirSync(join(root, 'backend/src'), { recursive: true });

  it('allows tests and refuses source, traversal and outside paths', () => {
    assert.equal(checkWritePath(join(root, 'backend/tests/a.test.ts'), root), null);
    assert.equal(checkWritePath('backend/tests/a.test.ts', root), null);
    assert.equal(checkWritePath('.agent-context/report.json', root), null);
    assert.match(checkWritePath('.agent-context/changes.json', root), /refused/);
    for (const path of ['backend/src/a.ts', 'backend/tests/../src/a.test.ts', '/etc/passwd', '.claude/settings.json']) assert.match(checkWritePath(path, root), /refused/);
  });
  it('refuses a symlink that redirects a test path', () => {
    symlinkSync(join(root, 'backend/src'), join(root, 'backend/tests/link'));
    assert.match(checkWritePath('backend/tests/link/a.test.ts', root), /refused/);
  });
  it('allows the narrow test commands', () => {
    for (const command of ['npm run test', 'cd backend && npm run test:coverage', 'cd frontend && npm run typecheck', 'cd backend && npx vitest run tests/router.test.ts --coverage']) assert.equal(checkBashCommand(command), null, command);
  });
  it('refuses everything else, including chaining', () => {
    for (const command of ['git push', 'curl https://example.com', 'npm install left-pad', 'npm run test; env', 'npm run test && curl x', 'cd .. && npm run test', 'npx vitest run --config evil.ts', 'npx vitest run tests/a.test.ts --outputFile=/tmp/x', 'npx vitest run tests/../../x', 'npx vitest run $(id)', 'cat .env', 'npm run test\nenv']) assert.notEqual(checkBashCommand(command), null, command);
  });
  it('ignores read-only tools and fails closed on a bad event', () => {
    assert.equal(evaluate({ tool_name: 'Read', tool_input: { file_path: '/etc/passwd' } }, root), null);
    const script = fileURLToPath(new URL('./guard-write.mjs', import.meta.url));
    assert.equal(spawnSync(process.execPath, [script], { input: 'not json' }).status, 2);
    assert.equal(spawnSync(process.execPath, [script], { input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'backend/src/a.ts' }, cwd: root }) }).status, 2);
    assert.equal(spawnSync(process.execPath, [script], { input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'backend/tests/a.test.ts' }, cwd: root }) }).status, 0);
  });
});

describe('validatePatch', () => {
  const test = 'backend/tests/a.test.ts';
  it('accepts added tests and an empty patch', () => {
    assert.equal(validatePatch(patchFor(test, "+it('x', () => { expect(1).toBe(1) })")).status, 'ok');
    assert.deepEqual(validatePatch(''), { status: 'ok', rejected: [], review: [], files: [], empty: true });
  });
  it('rejects paths outside the allowlist, unparseable headers and traversal', () => {
    assert.equal(validatePatch(patchFor('backend/src/a.ts', '+x')).status, 'rejected');
    assert.equal(validatePatch(patchFor('.github/workflows/x.yml', '+x')).status, 'rejected');
    assert.equal(validatePatch(patchFor('backend/tests/../src/a.test.ts', '+x')).status, 'rejected');
    assert.equal(validatePatch('diff --git "a/x y" "b/x y"\n').status, 'rejected');
  });
  it('rejects focused and skipped tests', () => {
    for (const body of ["+it.only('x', f)", "+describe.skip('x', f)", "+it.todo('x')", "+xit('x', f)", "+  test . skip('x', f)"]) assert.equal(validatePatch(patchFor(test, body)).status, 'rejected', body);
  });
  it('rejects dangerous APIs, symlinks, binaries, renames and mode changes', () => {
    assert.equal(validatePatch(patchFor(test, "+import 'node:child_process'")).status, 'rejected');
    assert.equal(validatePatch(patchFor(test, '+x', 'new file mode 120000\n')).status, 'rejected');
    assert.equal(validatePatch(`diff --git a/${test} b/${test}\nGIT binary patch\n`).status, 'rejected');
    assert.equal(validatePatch(`diff --git a/${test} b/backend/tests/b.test.ts\nrename from ${test}\nrename to backend/tests/b.test.ts\n`).status, 'rejected');
    assert.equal(validatePatch(`diff --git a/${test} b/${test}\nold mode 100644\nnew mode 100755\n`).status, 'rejected');
  });
  it('enforces size limits', () => {
    assert.equal(validatePatch(patchFor(test, Array(4001).fill('+x').join('\n'))).status, 'rejected');
  });
  it('sends weakened tests to human review', () => {
    assert.equal(validatePatch(patchFor(test, '-  expect(a).toBe(1)\n-  expect(b).toBe(2)\n+  expect(a).toBe(1)')).status, 'review');
    assert.equal(validatePatch(patchFor(test, "-it('x', f)")).status, 'review');
    assert.equal(validatePatch(`diff --git a/${test} b/${test}\ndeleted file mode 100644\n`).status, 'review');
  });
  it('accepts an assertion replaced by another', () => {
    assert.equal(validatePatch(patchFor(test, '-  expect(a).toBe(1)\n+  expect(a).toBe(2)')).status, 'ok');
  });
  it('validates a real git diff', () => {
    const dir = mkdtempSync(join(tmpdir(), 'patch-'));
    const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    mkdirSync(join(dir, 'backend/tests'), { recursive: true });
    writeFileSync(join(dir, test), "it('a', () => { expect(1).toBe(1) })\n");
    git('add', '.');
    git('commit', '-qm', 'x');
    writeFileSync(join(dir, 'backend/tests/b.test.ts'), "it('b', () => { expect(2).toBe(2) })\n");
    git('add', '-N', '.');
    const result = validatePatch(git('diff', '--binary', 'HEAD'));
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.files, ['backend/tests/b.test.ts']);
  });
});

describe('coverageDelta', () => {
  it('computes changes and tolerates a missing report', () => {
    const summary = (pct) => ({ total: { lines: { pct }, branches: { pct }, functions: { pct }, statements: { pct } } });
    assert.equal(coverageDelta(summary(50), summary(75.5)).lines.change, 25.5);
    assert.deepEqual(coverageDelta(null, summary(75)).lines, { before: null, after: 75, change: null });
  });
});

describe('renderComment', () => {
  it('neutralises mentions, html, links and table breaks from the agent', () => {
    const safe = sanitize('@org/team <img src=x> [x](https://evil.test) a|b\nnew');
    assert.ok(!safe.includes('@org'));
    assert.ok(!safe.includes('<img'));
    assert.ok(!safe.includes('https://'));
    assert.ok(!safe.includes('\n'));
    assert.ok(safe.includes('\\|'));
  });
  it('always carries the sticky marker and reports a skip', () => {
    const body = renderComment({ gate: { runAgent: false, ignored: [{ path: 'README.md', reason: 'not application source' }] } });
    assert.ok(body.startsWith(MARKER));
    assert.match(body, /no testable source changes/);
    assert.match(body, /README\.md/);
  });
  it('never claims a commit for failed, rejected or review runs', () => {
    assert.match(renderComment({ jobs: { agent: 'failure' } }), /Nothing was committed/);
    assert.match(renderComment({ jobs: { agent: 'success' }, validation: { status: 'rejected', rejected: ['bad'] } }), /Nothing was committed/);
    assert.match(renderComment({ jobs: { agent: 'success' }, validation: { status: 'review', review: ['weak'] } }), /human review/);
    assert.match(renderComment({ jobs: { agent: 'success', verify: 'failure' }, validation: { status: 'ok' } }), /Verification failed/);
  });
  it('renders decisions, bugs and verification for a successful run', () => {
    const body = renderComment({
      jobs: { agent: 'success', verify: 'success' },
      validation: { status: 'ok', rejected: [], review: [], empty: false },
      published: { pushed: true },
      decisions: { summary: 'Done', decisions: [{ path: 'backend/src/a.ts', action: 'create', testFile: 'backend/tests/a.test.ts', reason: 'New logic', skills: ['write-backend-tests'] }], suspectedBugs: [{ path: 'backend/src/a.ts', description: 'Off by one' }] },
      verify: { areas: { backend: { typecheck: 'pass', tests: 'pass', repeat: '3/3', coverage: { lines: { before: 10, after: 20 }, branches: { before: null, after: 5 } } } } },
      runUrl: 'https://github.com/o/r/actions/runs/1',
      headSha: 'abcdef0123456789',
    });
    assert.match(body, /committed to this branch/);
    assert.match(body, /`backend\/tests\/a\.test\.ts`/);
    assert.match(body, /Off by one/);
    assert.match(body, /10% → 20%/);
    assert.match(body, /n\/a → 5%/);
    assert.match(body, /\[workflow run\]/);
  });
});

describe('extractReport', () => {
  const report = { summary: 'ok', decisions: [{ path: 'a.ts', action: 'skip', reason: 'none', testFile: null, skills: [] }], suspectedBugs: [] };
  it('accepts a valid report file', () => {
    assert.deepEqual(extractReport({}, JSON.stringify(report)), report);
  });
  it('fails on run errors, a missing file, bad JSON and contract violations', () => {
    assert.throws(() => extractReport({ is_error: true, subtype: 'error_max_budget_usd' }, JSON.stringify(report)), /error_max_budget_usd/);
    assert.throws(() => extractReport({ result: 'All tests pass!' }, null), /no report file/);
    assert.throws(() => extractReport({}, 'All tests pass!'), /not valid JSON/);
    assert.throws(() => extractReport({}, JSON.stringify({ ...report, decisions: [{ ...report.decisions[0], action: 'delete' }] })), /invalid decision/);
    assert.throws(() => extractReport({}, JSON.stringify({ summary: 'ok' })), /decisions/);
  });
});
