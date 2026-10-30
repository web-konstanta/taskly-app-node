import { it, expect, vi } from 'vitest';
import { initialize } from '../src/core/database.ts';
import type { Database } from '../src/features/todos/types.ts';

it('creates the todos table idempotently with the expected constraints', async () => {
  const $executeRaw = vi.fn().mockResolvedValue(0);
  await initialize({ $executeRaw } as unknown as Database);
  expect($executeRaw).toHaveBeenCalledOnce();
  const sql = ($executeRaw.mock.calls[0][0] as string[]).join('');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS todos');
  expect(sql).toContain("priority IN ('low', 'medium', 'high')");
  expect(sql).toContain('length(title) >= 1');
});

it('propagates schema creation errors', async () => {
  const $executeRaw = vi.fn().mockRejectedValue(new Error('permission denied'));
  await expect(initialize({ $executeRaw } as unknown as Database)).rejects.toThrow('permission denied');
});
