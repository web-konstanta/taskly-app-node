import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useMutation } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

function setup() {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper }
}

function useBusyAndMutation(
  mutationKey: readonly string[],
  fn: () => Promise<void>,
) {
  const mutation = useMutation({ mutationKey, mutationFn: fn })
  return { busy: useTodosBusy(), mutation }
}

it('is idle when no task mutation is running', () => {
  const { wrapper } = setup()
  const { result } = renderHook(() => useTodosBusy(), { wrapper })
  expect(result.current).toBe(false)
})

it('is busy while any task mutation is pending and idle again afterwards', async () => {
  const { wrapper } = setup()
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => (release = resolve))
  const { result } = renderHook(
    () => useBusyAndMutation(todoKeys.update, () => pending),
    { wrapper },
  )
  let promise: Promise<void> = Promise.resolve()
  act(() => {
    promise = result.current.mutation.mutateAsync()
  })
  await waitFor(() => expect(result.current.busy).toBe(true))
  await act(async () => {
    release()
    await promise
  })
  await waitFor(() => expect(result.current.busy).toBe(false))
})

it('ignores mutations that do not belong to tasks', async () => {
  const { wrapper } = setup()
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => (release = resolve))
  const { result } = renderHook(
    () => useBusyAndMutation(['other', 'update'], () => pending),
    { wrapper },
  )
  let promise: Promise<void> = Promise.resolve()
  act(() => {
    promise = result.current.mutation.mutateAsync()
  })
  await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
  expect(result.current.busy).toBe(false)
  await act(async () => {
    release()
    await promise
  })
})
