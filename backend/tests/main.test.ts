import { afterEach, it, expect, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('../src/core/lifespan.ts');
  vi.resetModules();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

it('starts the API on import', async () => {
  const start = vi.fn().mockResolvedValue(undefined);
  vi.doMock('../src/core/lifespan.ts', () => ({ start }));
  await import('../src/main.ts');
  expect(start).toHaveBeenCalledOnce();
  expect(process.exitCode).toBeUndefined();
});

it('logs the failure and sets a non-zero exit code when startup fails', async () => {
  const failure = new Error('boom');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.doMock('../src/core/lifespan.ts', () => ({ start: vi.fn().mockRejectedValue(failure) }));
  await import('../src/main.ts');
  await vi.waitFor(() => expect(log).toHaveBeenCalledWith('Cannot start Taskly App Node API:', failure));
  expect(process.exitCode).toBe(1);
});
