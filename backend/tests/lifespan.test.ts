import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';
import { resolveDatabaseUrl } from '../src/core/config.ts';
import { createApp } from '../src/factory.ts';
import { start } from '../src/core/lifespan.ts';

vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: vi.fn() }));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn() }));

function setup() {
  const database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  const server = Object.assign(new EventEmitter(), {
    address: () => ({ port: 4321 }),
    close: vi.fn((callback: () => void) => callback()),
  });
  const app = { listen: vi.fn((port: number, host: string, callback: () => void) => { queueMicrotask(callback); return server; }) };
  vi.mocked(resolveDatabaseUrl).mockReturnValue('postgresql://test:test@localhost:5432/test');
  vi.mocked(createDatabase).mockReturnValue(database as never);
  vi.mocked(initialize).mockResolvedValue(undefined);
  vi.mocked(createApp).mockReturnValue(app as never);
  // Capture signal handlers instead of registering them on the real process.
  const once = vi.spyOn(process, 'once').mockImplementation((() => process) as never);
  const handler = (signal: string) => once.mock.calls.find(([name]) => name === signal)?.[1] as () => void;
  return { database, server, app, once, handler };
}

beforeEach(() => {
  vi.stubEnv('API_PORT', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  process.exitCode = undefined;
});

it('connects, initializes the schema, then listens on the default port', async () => {
  const { database, server, app } = setup();
  const result = await start();
  expect(createDatabase).toHaveBeenCalledWith('postgresql://test:test@localhost:5432/test');
  expect(database.$connect).toHaveBeenCalledOnce();
  expect(initialize).toHaveBeenCalledWith(database);
  expect(createApp).toHaveBeenCalledWith(database);
  expect(app.listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
  expect(result).toEqual({ server, database });
  expect(console.log).toHaveBeenCalledWith('Taskly App Node API listening on port 4321');
});

it('listens on API_PORT when set', async () => {
  const { app } = setup();
  vi.stubEnv('API_PORT', '9090');
  await start();
  expect(app.listen).toHaveBeenCalledWith(9090, '0.0.0.0', expect.any(Function));
});

it('disconnects and rethrows when initialization fails', async () => {
  const { database, app } = setup();
  vi.mocked(initialize).mockRejectedValue(new Error('schema failed'));
  await expect(start()).rejects.toThrow('schema failed');
  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(app.listen).not.toHaveBeenCalled();
});

it('disconnects and rethrows when the listener fails to bind', async () => {
  const { database, server, app } = setup();
  app.listen.mockImplementation(() => { queueMicrotask(() => server.emit('error', new Error('EADDRINUSE'))); return server; });
  await expect(start()).rejects.toThrow('EADDRINUSE');
  expect(database.$disconnect).toHaveBeenCalledOnce();
});

it('does not register shutdown handlers when startup fails', async () => {
  const { once } = setup();
  vi.mocked(initialize).mockRejectedValue(new Error('schema failed'));
  await expect(start()).rejects.toThrow();
  expect(once).not.toHaveBeenCalled();
});

it.each(['SIGTERM', 'SIGINT'])('closes the server and disconnects on %s', async (signal) => {
  const { database, server, handler } = setup();
  await start();
  handler(signal)();
  expect(server.close).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(database.$disconnect).toHaveBeenCalledOnce());
  expect(process.exitCode).toBeUndefined();
});

it('reports a failing disconnect during shutdown through the exit code', async () => {
  const { database, handler } = setup();
  const failure = new Error('disconnect failed');
  database.$disconnect.mockRejectedValue(failure);
  await start();
  handler('SIGTERM')();
  await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith(failure));
  expect(process.exitCode).toBe(1);
});

it('forces exit with code 1 if the server does not close within 10 seconds', async () => {
  vi.useFakeTimers();
  const { server, handler } = setup();
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  server.close.mockImplementation((() => undefined) as never);
  await start();
  handler('SIGTERM')();
  vi.advanceTimersByTime(9_999);
  expect(exit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(exit).toHaveBeenCalledWith(1);
});
