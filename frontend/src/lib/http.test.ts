import { afterEach, expect, it, vi } from 'vitest'
import { request } from './http'

function stubFetch(response: Response | { rejectWith: unknown }) {
  const fetchMock = vi.fn(() =>
    response instanceof Response
      ? Promise.resolve(response)
      : Promise.reject(response.rejectWith),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status })
}

afterEach(() => vi.unstubAllGlobals())

it('prefixes the path with /api and sends a JSON content type header', async () => {
  const fetchMock = stubFetch(jsonResponse([{ id: 1 }], 200))
  await expect(request('/todos')).resolves.toEqual([{ id: 1 }])
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    headers: { 'Content-Type': 'application/json' },
  })
})

it('forwards request options and lets callers extend the headers', async () => {
  const fetchMock = stubFetch(jsonResponse({ id: 1 }, 201))
  await request('/todos', {
    method: 'POST',
    body: '{}',
    headers: { 'X-Test': 'yes' },
  })
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    method: 'POST',
    body: '{}',
    headers: { 'Content-Type': 'application/json', 'X-Test': 'yes' },
  })
})

it('resolves with undefined for an empty 204 response', async () => {
  stubFetch(new Response(null, { status: 204 }))
  await expect(request('/todos/1', { method: 'DELETE' })).resolves.toBe(
    undefined,
  )
})

it('reports a connection problem when the network request fails', async () => {
  stubFetch({ rejectWith: new TypeError('Failed to fetch') })
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the original error when the request was aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const abortError = new DOMException('Aborted', 'AbortError')
  stubFetch({ rejectWith: abortError })
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abortError,
  )
})

it('shows the validation guidance for a 422 response', async () => {
  stubFetch(jsonResponse({ detail: [{ msg: 'too long' }] }, 422))
  await expect(request('/todos')).rejects.toThrow(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('uses the server detail message for other failed responses', async () => {
  stubFetch(jsonResponse({ detail: 'Task not found' }, 404))
  await expect(request('/todos/9')).rejects.toThrow('Task not found')
})

it('falls back to a generic message when the error detail is not a string', async () => {
  stubFetch(jsonResponse({ detail: { code: 1 } }, 500))
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

it('falls back to a generic message when the error body is not JSON', async () => {
  stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }))
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})
