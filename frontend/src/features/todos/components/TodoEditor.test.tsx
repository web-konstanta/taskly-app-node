import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from '../hooks/useCreateTodoMutation'
import { useUpdateTodoMutation } from '../hooks/useUpdateTodoMutation'
import type { Todo, TodoInput } from '../types'
import { TodoEditor } from './TodoEditor'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useCreateTodoMutation', () => ({
  useCreateTodoMutation: vi.fn(),
}))
vi.mock('../hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./TodoForm', () => ({
  TodoForm: ({
    initial,
    busy,
    error,
    onSubmit,
    onCancel,
  }: {
    initial?: Todo
    busy: boolean
    error: string | null
    onSubmit: (input: TodoInput) => Promise<void>
    onCancel: () => void
  }) => (
    <div>
      <p>initial: {initial ? initial.title : 'none'}</p>
      <p>busy: {String(busy)}</p>
      <p>error: {error ?? 'none'}</p>
      <button onClick={() => void onSubmit(todoFixture)}>Submit form</button>
      <button onClick={onCancel}>Cancel form</button>
    </div>
  ),
}))
beforeEach(() => vi.clearAllMocks())

function mockMutations({
  create = vi.fn(),
  update = vi.fn(),
  createState = {},
  updateState = {},
}: {
  create?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  createState?: { isPending?: boolean; error?: Error | null }
  updateState?: { isPending?: boolean; error?: Error | null }
} = {}) {
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
    ...createState,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
    ...updateState,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  return { create, update }
}

it('creates a new task and reports a successful save', async () => {
  const user = userEvent.setup()
  const { create, update } = mockMutations({
    create: vi.fn().mockResolvedValue(todoFixture),
  })
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'New task' })).toBeVisible()
  expect(screen.getByText('initial: none')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('New task added.'))
  expect(create).toHaveBeenCalledWith(todoFixture)
  expect(update).not.toHaveBeenCalled()
})

it('updates an existing task by id and reports the saved changes', async () => {
  const user = userEvent.setup()
  const { create, update } = mockMutations({
    update: vi.fn().mockResolvedValue(todoFixture),
  })
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  expect(screen.getByText(`initial: ${todoFixture.title}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Changes saved.'))
  expect(update).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: todoFixture,
  })
  expect(create).not.toHaveBeenCalled()
})

it('does not report a save that failed', async () => {
  const user = userEvent.setup()
  const create = vi.fn().mockRejectedValue(new Error('Server down'))
  mockMutations({ create })
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  expect(onSaved).not.toHaveBeenCalled()
})

it('passes the error of the active mutation to the form', () => {
  mockMutations({
    createState: { error: new Error('Create failed') },
    updateState: { error: new Error('Update failed') },
  })
  const { rerender } = render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={vi.fn()} />,
  )
  expect(screen.getByText('error: Create failed')).toBeVisible()
  rerender(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  )
  expect(screen.getByText('error: Update failed')).toBeVisible()
})

it('ignores submissions while a save is already pending', async () => {
  const user = userEvent.setup()
  const { create } = mockMutations({ createState: { isPending: true } })
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={vi.fn()} />,
  )
  expect(screen.getByText('busy: true')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(create).not.toHaveBeenCalled()
})

it('ignores submissions while another task operation is busy', async () => {
  const user = userEvent.setup()
  const { update } = mockMutations()
  render(
    <TodoEditor todo={todoFixture} busy onClose={vi.fn()} onSaved={vi.fn()} />,
  )
  expect(screen.getByText('busy: true')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(update).not.toHaveBeenCalled()
})

it('closes from the form cancel action', async () => {
  const user = userEvent.setup()
  mockMutations()
  const onClose = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={onClose} onSaved={vi.fn()} />,
  )
  await user.click(screen.getByRole('button', { name: 'Cancel form' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})
