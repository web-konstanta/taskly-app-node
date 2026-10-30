import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useTodoStatsQuery } from './useTodoStatsQuery'

vi.mock('../api/todos', () => ({ todosApi: { stats: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

const stats = { total: 3, completed: 1, active: 2, overdue: 1 }

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useTodoStatsQuery(), { wrapper })
  return { queryClient, result }
}

it('loads the statistics, passes the abort signal and caches them under the stats key', async () => {
  vi.mocked(todosApi.stats).mockResolvedValue(stats)
  const { queryClient, result } = setup()
  await waitFor(() => expect(result.current.data).toEqual(stats))
  expect(todosApi.stats).toHaveBeenCalledWith(expect.any(AbortSignal))
  expect(queryClient.getQueryData(todoKeys.stats)).toEqual(stats)
})

it('exposes the error when loading fails', async () => {
  vi.mocked(todosApi.stats).mockRejectedValue(new Error('Server down'))
  const { result } = setup()
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error?.message).toBe('Server down')
  expect(result.current.data).toBeUndefined()
})
