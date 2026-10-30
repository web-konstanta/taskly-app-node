import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { remove: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  return { queryClient, result }
}

it('deletes the task through the API and removes it from the cached list', async () => {
  const other: Todo = { ...todoFixture, id: 8, title: 'Other' }
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [todoFixture, other])
  await act(() => result.current.mutateAsync(todoFixture.id))
  expect(todosApi.remove).toHaveBeenCalledWith(todoFixture.id)
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([other])
})

it('does not create a cached list when none was loaded', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { queryClient, result } = setup()
  await act(() => result.current.mutateAsync(todoFixture.id))
  expect(queryClient.getQueryData(todoKeys.list)).toBeUndefined()
})

it('invalidates the statistics after a task is deleted', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { queryClient, result } = setup()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  await act(() => result.current.mutateAsync(todoFixture.id))
  expect(invalidate).toHaveBeenCalledWith({ queryKey: todoKeys.stats })
})

it('does not invalidate the statistics when deletion fails', async () => {
  vi.mocked(todosApi.remove).mockRejectedValue(new Error('Could not delete'))
  const { queryClient, result } = setup()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  await act(async () => {
    await expect(result.current.mutateAsync(todoFixture.id)).rejects.toThrow(
      'Could not delete',
    )
  })
  expect(invalidate).not.toHaveBeenCalled()
})

it('exposes the error and keeps the task cached when deletion fails', async () => {
  vi.mocked(todosApi.remove).mockRejectedValue(new Error('Could not delete'))
  const { queryClient, result } = setup()
  queryClient.setQueryData<Todo[]>(todoKeys.list, [todoFixture])
  await act(async () => {
    await expect(result.current.mutateAsync(todoFixture.id)).rejects.toThrow(
      'Could not delete',
    )
  })
  await waitFor(() =>
    expect(result.current.error?.message).toBe('Could not delete'),
  )
  expect(queryClient.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
