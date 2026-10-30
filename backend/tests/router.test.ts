import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

function setup() {
  const repository = { list: vi.fn().mockResolvedValue([todo]), stats: vi.fn(), create: vi.fn().mockResolvedValue(todo), get: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}
it('lists tasks from the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(repository.list).toHaveBeenCalledOnce();
});
it('creates tasks with trimmed input and defaults', async () => {
  const { app, repository } = setup();
  const response = await request(app).post('/api/todos').send({ title: '  Plan the sprint  ', priority: 'high' });
  expect(response.status).toBe(201);
  expect(response.body).toEqual(todo);
  expect(repository.create).toHaveBeenCalledWith({ title: 'Plan the sprint', description: '', priority: 'high', due_date: null, completed: false });
});
it.each([{ title: '  ' }, { title: 'x'.repeat(121) }, { title: 'Task', priority: 'urgent' }, { title: 'Task', due_date: '2026-02-30' }])(
  'rejects invalid create input without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).post('/api/todos').send(payload)).status).toBe(422);
    expect(repository.create).not.toHaveBeenCalled();
  },
);
it('returns task statistics without treating "stats" as a task ID', async () => {
  const { app, repository } = setup();
  const stats = { total: 5, completed: 2, active: 3, overdue: 1, due_today: 1, completion_rate: 40 };
  repository.stats.mockResolvedValue(stats);
  const response = await request(app).get('/api/todos/stats');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(stats);
  expect(repository.stats).toHaveBeenCalledOnce();
  expect(repository.get).not.toHaveBeenCalled();
});
it('gets a task by ID', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(todo);
  const response = await request(app).get('/api/todos/1');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(todo);
  expect(repository.get).toHaveBeenCalledWith(1);
});
it('returns 404 when the task does not exist', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValue(null);
  const response = await request(app).get('/api/todos/7');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
  expect(repository.get).toHaveBeenCalledWith(7);
});
it.each(['abc', '0', '-1', '1.5', '9007199254740993'])('rejects malformed ID %s without calling the repository', async (id) => {
  const { app, repository } = setup();
  for (const response of [
    await request(app).get(`/api/todos/${id}`),
    await request(app).patch(`/api/todos/${id}`).send({ completed: true }),
    await request(app).delete(`/api/todos/${id}`),
  ]) {
    expect(response.status).toBe(422);
  }
  expect(repository.get).not.toHaveBeenCalled();
  expect(repository.update).not.toHaveBeenCalled();
  expect(repository.delete).not.toHaveBeenCalled();
});
it('updates a task with trimmed input', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue({ ...todo, title: 'Renamed' });
  const response = await request(app).patch('/api/todos/3').send({ title: '  Renamed  ' });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ...todo, title: 'Renamed' });
  expect(repository.update).toHaveBeenCalledWith(3, { title: 'Renamed' });
});
it.each([{}, { title: '' }, { priority: 'urgent' }, { id: 5 }, { completed: 'yes' }])(
  'rejects invalid update input without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).patch('/api/todos/1').send(payload)).status).toBe(422);
    expect(repository.update).not.toHaveBeenCalled();
  },
);
it('returns 404 when updating a missing task', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue(null);
  const response = await request(app).patch('/api/todos/9').send({ completed: true });
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
  expect(repository.update).toHaveBeenCalledWith(9, { completed: true });
});
it('deletes a task and responds with an empty 204', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValue(true);
  const response = await request(app).delete('/api/todos/4');
  expect(response.status).toBe(204);
  expect(response.text).toBe('');
  expect(repository.delete).toHaveBeenCalledWith(4);
});
it('returns 404 when deleting a missing task', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValue(false);
  const response = await request(app).delete('/api/todos/4');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
});
