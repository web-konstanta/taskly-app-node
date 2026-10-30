import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo, TodoInput } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { create: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

const input: TodoInput = {
  title: todoFixture.title,
  description: '',
  priority: 'medium',
  due_date: null,
  completed: false,
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  return { queryClient, result }
}

it('sends the input to the API and puts the saved task first in the cached list', async () => {
  const existing: Todo = { ...todoFixture, id: 1, title: 'Existing' }
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [existing])
  await act(() => result.current.mutateAsync(input))
  expect(todosApi.create).toHaveBeenCalledWith(input)
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([
    todoFixture,
    existing,
  ])
})

it('creates the cached list when none was loaded yet', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { queryClient, result } = setup()
  await act(() => result.current.mutateAsync(input))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('replaces a cached task with the same id instead of duplicating it', async () => {
  const stale: Todo = { ...todoFixture, title: 'Stale title' }
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [stale])
  await act(() => result.current.mutateAsync(input))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('exposes the error and leaves the cached list untouched when creation fails', async () => {
  vi.mocked(todosApi.create).mockRejectedValue(new Error('Server down'))
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [todoFixture])
  await act(async () => {
    await expect(result.current.mutateAsync(input)).rejects.toThrow(
      'Server down',
    )
  })
  await waitFor(() => expect(result.current.error?.message).toBe('Server down'))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
