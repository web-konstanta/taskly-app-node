import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const done: Todo = {
  ...todoFixture,
  id: 8,
  title: 'Water the plants',
  completed: true,
  priority: 'high',
}
const todos = [todoFixture, done]

it('starts with all tasks, no search and the newest sort', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible).toEqual([done, todoFixture])
})

it('narrows the visible tasks by status', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('completed'))
  expect(result.current.filter).toBe('completed')
  expect(result.current.visible).toEqual([done])
  act(() => result.current.setFilter('active'))
  expect(result.current.visible).toEqual([todoFixture])
})

it('narrows the visible tasks by search text', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setSearch('plants'))
  expect(result.current.search).toBe('plants')
  expect(result.current.visible).toEqual([done])
})

it('reorders the visible tasks when the sort changes', () => {
  const low: Todo = { ...todoFixture, id: 9, priority: 'low' }
  const { result } = renderHook(() => useTodoFilters([low, todoFixture, done]))
  act(() => result.current.setSort('priority'))
  expect(result.current.sort).toBe('priority')
  expect(result.current.visible).toEqual([done, todoFixture, low])
})

it('reflects a changed task list', () => {
  const { result, rerender } = renderHook(({ list }) => useTodoFilters(list), {
    initialProps: { list: [todoFixture] },
  })
  expect(result.current.visible).toEqual([todoFixture])
  rerender({ list: [todoFixture, done] })
  expect(result.current.visible).toEqual([done, todoFixture])
})
