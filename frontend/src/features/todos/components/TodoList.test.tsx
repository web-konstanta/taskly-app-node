import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: ({
    hasTodos,
    disabled,
    onCreate,
  }: {
    hasTodos: boolean
    disabled: boolean
    onCreate: () => void
  }) => (
    <button disabled={disabled} onClick={onCreate}>
      Empty task list (hasTodos: {String(hasTodos)})
    </button>
  ),
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    busy,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todo: Todo
    busy: boolean
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <li>
      <span>{todo.title}</span>
      <span>{busy ? 'busy' : 'idle'}</span>
      <button onClick={onToggle}>Toggle {todo.title}</button>
      <button onClick={onEdit}>Edit {todo.title}</button>
      <button onClick={onDelete}>Delete {todo.title}</button>
    </li>
  ),
}))

const props = {
  todos: [] as Todo[],
  hasTodos: false,
  loading: false,
  failed: false,
  busy: false,
  onCreate: vi.fn(),
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

it('shows loading feedback before showing an empty list', () => {
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText(/Empty task list/)).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText(/Empty task list/)).toBeVisible()
})

it('explains that the list is unavailable when loading failed and nothing is cached', () => {
  render(<TodoList {...props} failed />)
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.getByText('Try again to load your tasks.')).toBeVisible()
  expect(screen.queryByText(/Empty task list/)).not.toBeInTheDocument()
})

it('keeps showing cached tasks when a later refresh failed', () => {
  render(<TodoList {...props} failed hasTodos todos={[todoFixture]} />)
  expect(screen.getByText(todoFixture.title)).toBeVisible()
  expect(
    screen.queryByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).not.toBeInTheDocument()
})

it('renders a list item per task and forwards each action with its task', async () => {
  const user = userEvent.setup()
  const second: Todo = { ...todoFixture, id: 8, title: 'Second task' }
  const onToggle = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoList
      {...props}
      hasTodos
      todos={[todoFixture, second]}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('list')).toBeVisible()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  await user.click(screen.getByRole('button', { name: 'Toggle Second task' }))
  await user.click(screen.getByRole('button', { name: 'Edit Second task' }))
  await user.click(
    screen.getByRole('button', { name: 'Delete Prepare a demo' }),
  )
  expect(onToggle).toHaveBeenCalledExactlyOnceWith(second)
  expect(onEdit).toHaveBeenCalledExactlyOnceWith(second)
  expect(onDelete).toHaveBeenCalledExactlyOnceWith(todoFixture)
})

it('passes the busy state down to each task', () => {
  render(<TodoList {...props} hasTodos busy todos={[todoFixture]} />)
  expect(screen.getByText('busy')).toBeVisible()
})

it('tells the empty state whether tasks exist and forwards creation', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  const { rerender } = render(<TodoList {...props} onCreate={onCreate} />)
  expect(screen.getByRole('button')).toHaveTextContent('hasTodos: false')
  await user.click(screen.getByRole('button'))
  expect(onCreate).toHaveBeenCalledTimes(1)
  rerender(<TodoList {...props} hasTodos busy onCreate={onCreate} />)
  expect(screen.getByRole('button')).toHaveTextContent('hasTodos: true')
  expect(screen.getByRole('button')).toBeDisabled()
})
