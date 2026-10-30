import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const variables = ['DATABASE_URL', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'DB_PORT', 'POSTGRES_DB'];

beforeEach(() => {
  // A real .env may be loaded on import: clear everything these tests depend on.
  for (const name of variables) vi.stubEnv(name, '');
});
afterEach(() => vi.unstubAllEnvs());

it('prefers an explicit override over DATABASE_URL', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env:env@envhost:5432/env');
  expect(resolveDatabaseUrl('postgresql://o:o@override:5432/o')).toBe('postgresql://o:o@override:5432/o');
});

it('uses DATABASE_URL when no override is given', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env:env@envhost:5432/env');
  expect(resolveDatabaseUrl()).toBe('postgresql://env:env@envhost:5432/env');
});

it('rewrites the SQLAlchemy psycopg driver scheme', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql+psycopg://u:p@host:5432/db');
  expect(resolveDatabaseUrl()).toBe('postgresql://u:p@host:5432/db');
});

it('builds the URL from POSTGRES_* parts and encodes the database name', () => {
  vi.stubEnv('POSTGRES_USER', 'user');
  vi.stubEnv('POSTGRES_PASSWORD', 'secret');
  vi.stubEnv('POSTGRES_HOST', 'db.internal');
  vi.stubEnv('DB_PORT', '5433');
  vi.stubEnv('POSTGRES_DB', 'my db');
  expect(resolveDatabaseUrl()).toBe('postgresql://user:secret@db.internal:5433/my%20db');
});

it.each(variables.slice(1))('throws naming the missing variable %s', (missing) => {
  for (const name of variables.slice(1)) vi.stubEnv(name, name === missing ? '' : 'value');
  vi.stubEnv('DB_PORT', missing === 'DB_PORT' ? '' : '5432');
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${missing}`);
});
