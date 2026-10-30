import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { update: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  return { queryClient, result }
}

it('sends the id and changes to the API and replaces only that task in the cache', async () => {
  const other: Todo = { ...todoFixture, id: 8, title: 'Other' }
  const saved: Todo = { ...todoFixture, completed: true }
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [todoFixture, other])
  await act(() =>
    result.current.mutateAsync({
      id: todoFixture.id,
      input: { completed: true },
    }),
  )
  expect(todosApi.update).toHaveBeenCalledWith(todoFixture.id, {
    completed: true,
  })
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([saved, other])
})

it('does not create a cached list when none was loaded', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
  const { queryClient, result } = setup()
  await act(() =>
    result.current.mutateAsync({ id: todoFixture.id, input: { title: 'x' } }),
  )
  expect(queryClient.getQueryData(todoKeys.list)).toBeUndefined()
})

it('invalidates the statistics after a task is updated', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
  const { queryClient, result } = setup()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  await act(() =>
    result.current.mutateAsync({
      id: todoFixture.id,
      input: { completed: true },
    }),
  )
  expect(invalidate).toHaveBeenCalledWith({ queryKey: todoKeys.stats })
})

it('does not invalidate the statistics when the update fails', async () => {
  vi.mocked(todosApi.update).mockRejectedValue(new Error('Not found'))
  const { queryClient, result } = setup()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  await act(async () => {
    await expect(
      result.current.mutateAsync({ id: todoFixture.id, input: { title: 'x' } }),
    ).rejects.toThrow('Not found')
  })
  expect(invalidate).not.toHaveBeenCalled()
})

it('exposes the error and keeps the cached list when the update fails', async () => {
  vi.mocked(todosApi.update).mockRejectedValue(new Error('Not found'))
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [todoFixture])
  await act(async () => {
    await expect(
      result.current.mutateAsync({ id: todoFixture.id, input: { title: 'x' } }),
    ).rejects.toThrow('Not found')
  })
  await waitFor(() => expect(result.current.error?.message).toBe('Not found'))
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
