import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useTodoStatsQuery } from '../hooks/useTodoStatsQuery'
import type { TodoStats } from '../types'
import { TodoSummary } from './TodoSummary'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useTodoStatsQuery', () => ({ useTodoStatsQuery: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

function setup(data: TodoStats | undefined) {
  vi.mocked(useTodoStatsQuery).mockReturnValue({
    data,
  } as unknown as ReturnType<typeof useTodoStatsQuery>)
  render(<TodoSummary />)
}

it('shows active and completed counts', () => {
  setup({ total: 5, completed: 2, active: 3, overdue: 0 })
  const summary = screen.getByRole('region', { name: 'Task summary' })
  expect(summary).toHaveTextContent('3 active · 2 completed')
  expect(summary).not.toHaveTextContent('overdue')
})

it('adds the overdue count when some tasks are overdue', () => {
  setup({ total: 5, completed: 1, active: 4, overdue: 2 })
  expect(
    screen.getByRole('region', { name: 'Task summary' }),
  ).toHaveTextContent('4 active · 1 completed · 2 overdue')
})

it('renders nothing while the statistics are not loaded', () => {
  setup(undefined)
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
})

it('renders nothing when there are no tasks', () => {
  setup({ total: 0, completed: 0, active: 0, overdue: 0 })
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
})
