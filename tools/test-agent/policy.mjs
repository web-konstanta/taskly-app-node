// Single source of truth for what the agent may touch and which changes need tests.
// Used by the write guard (during the run) and by the patch validator (after it).

const TEST_PATHS = [
  /^backend\/tests\/[\w./-]+\.test\.ts$/,
  /^backend\/tests\/fixture\.ts$/,
  /^frontend\/src\/[\w./-]+\.test\.tsx?$/,
  /^frontend\/src\/test\/todoFixture\.ts$/,
];

export function isAllowedTestPath(path) {
  if (typeof path !== 'string' || path.split('/').some((part) => part === '..' || part === '.' || part === '')) return false;
  return TEST_PATHS.some((pattern) => pattern.test(path));
}

const BACKEND_IGNORED = [
  [/^backend\/src\/generated\//, 'generated code'],
  [/\/types\.ts$/, 'types only'],
  [/^backend\/src\/main\.ts$/, 'process entrypoint'],
];

// Mirrors the coverage exclusions in frontend/vite.config.ts.
const FRONTEND_IGNORED = [
  [/\.stories\.tsx?$/, 'storybook story'],
  [/\.styles\.ts$/, 'styles only'],
  [/(^|\/)(types|[\w-]+\.types)\.ts$/, 'types only'],
  [/\/index\.ts$/, 'barrel file'],
  [/^frontend\/src\/design-system\//, 'design system (covered by storybook)'],
  [/^frontend\/src\/test\//, 'test support'],
  [/^frontend\/src\/main\.tsx$/, 'process entrypoint'],
  [/^frontend\/src\/lib\/queryClient\.ts$/, 'static configuration'],
  [/\/api\/queryKeys\.ts$/, 'static configuration'],
];

function firstReason(path, rules) {
  return rules.find(([pattern]) => pattern.test(path))?.[1];
}

export function classifyFile(path, status = 'M') {
  if (isAllowedTestPath(path)) return { kind: 'test', area: path.split('/')[0] };
  const area = path.startsWith('backend/src/') && path.endsWith('.ts') ? 'backend'
    : path.startsWith('frontend/src/') && /\.tsx?$/.test(path) ? 'frontend'
      : null;
  if (!area) return { kind: 'ignored', reason: 'not application source' };
  if (status === 'D') return { kind: 'ignored', reason: 'source file deleted' };
  const reason = firstReason(path, area === 'backend' ? BACKEND_IGNORED : FRONTEND_IGNORED);
  return reason ? { kind: 'ignored', reason } : { kind: 'testable', area };
}
