import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'
import type { Todo } from './types'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: ({
    disabled,
    onCreate,
  }: {
    disabled: boolean
    onCreate: () => void
  }) => (
    <header>
      <h1>Tasks</h1>
      <button disabled={disabled} onClick={onCreate}>
        New task
      </button>
    </header>
  ),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoSummary', () => ({
  TodoSummary: () => <p>task summary</p>,
}))
vi.mock('./components/TodoList', () => ({
  TodoList: ({
    todos,
    hasTodos,
    loading,
    failed,
    busy,
    onCreate,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todos: Todo[]
    hasTodos: boolean
    loading: boolean
    failed: boolean
    busy: boolean
    onCreate: () => void
    onToggle: (todo: Todo) => void
    onEdit: (todo: Todo) => void
    onDelete: (todo: Todo) => void
  }) => (
    <section>
      <p>
        list: hasTodos={String(hasTodos)} loading={String(loading)} failed=
        {String(failed)} busy={String(busy)}
      </p>
      <button onClick={onCreate}>Create from list</button>
      {todos.map((todo) => (
        <div key={todo.id}>
          <button onClick={() => onToggle(todo)}>Toggle {todo.title}</button>
          <button onClick={() => onEdit(todo)}>Edit {todo.title}</button>
          <button onClick={() => onDelete(todo)}>Delete {todo.title}</button>
        </div>
      ))}
    </section>
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: ({
    todo,
    onClose,
    onSaved,
  }: {
    todo: Todo | 'new'
    onClose: () => void
    onSaved: (message: string) => void
  }) => (
    <div role="dialog" aria-label="Editor">
      <p>editing: {todo === 'new' ? 'new task' : todo.title}</p>
      <button onClick={onClose}>Close editor</button>
      <button onClick={() => onSaved('Editor saved.')}>Save editor</button>
    </div>
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: ({
    todo,
    onClose,
    onDeleted,
  }: {
    todo: Todo
    onClose: () => void
    onDeleted: () => void
  }) => (
    <div role="dialog" aria-label="Confirm deletion">
      <p>deleting: {todo.title}</p>
      <button onClick={onClose}>Close confirmation</button>
      <button onClick={onDeleted}>Confirm deletion</button>
    </div>
  ),
}))
vi.mock('../../components/SuccessNotice', () => ({
  SuccessNotice: ({ message }: { message: string }) => (
    <p data-testid="notice">{message}</p>
  ),
}))

interface Options {
  data?: Todo[]
  isPending?: boolean
  isFetching?: boolean
  isError?: boolean
  queryError?: Error | null
  mutationError?: Error | null
  busy?: boolean
  mutateAsync?: ReturnType<typeof vi.fn>
  message?: string
}

function setup(options: Options = {}) {
  const {
    data = [todoFixture],
    isPending = false,
    isFetching = false,
    isError = false,
    queryError = null,
    mutationError = null,
    busy = false,
    mutateAsync = vi.fn(),
    message = '',
  } = options
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  const notify = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data,
    isPending,
    isFetching,
    isError,
    error: queryError,
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: mutationError,
    reset,
    mutateAsync,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message, notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: data,
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  return { refetch, reset, notify, mutateAsync }
}

beforeEach(() => vi.clearAllMocks())

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

it('shows the task summary on the page', () => {
  setup()
  expect(screen.getByText('task summary')).toBeVisible()
})

it('shows no alert when nothing failed', () => {
  setup()
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
})

it('prefers a task update error over a loading error in the alert', () => {
  setup({
    queryError: new Error('Loading failed'),
    mutationError: new Error('Update failed'),
  })
  expect(screen.getByTestId('alert')).toHaveTextContent('Update failed')
  expect(screen.getByTestId('alert')).not.toHaveTextContent('Loading failed')
})

it('passes the loading and failure state to the list', () => {
  setup({ data: [], isPending: true, isError: true })
  expect(screen.getByText(/loading=true/)).toBeVisible()
  expect(screen.getByText(/failed=true/)).toBeVisible()
  expect(screen.getByText(/hasTodos=false/)).toBeVisible()
})

it('disables creation and retry while tasks are loading or an operation is busy', () => {
  setup({
    isPending: true,
    queryError: new Error('x'),
    isFetching: true,
  })
  expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('disables creation and retry while a task operation is busy', () => {
  setup({ busy: true, queryError: new Error('x') })
  expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
  expect(screen.getByText(/busy=true/)).toBeVisible()
})

it('completes a task and congratulates the user', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi
    .fn()
    .mockResolvedValue({ ...todoFixture, completed: true })
  const { notify } = setup({ mutateAsync })
  await user.click(
    screen.getByRole('button', { name: `Toggle ${todoFixture.title}` }),
  )
  expect(mutateAsync).toHaveBeenCalledExactlyOnceWith({
    id: todoFixture.id,
    input: { completed: true },
  })
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Another task complete. Well done!'),
  )
})

it('marks a completed task as active again', async () => {
  const user = userEvent.setup()
  const done = { ...todoFixture, completed: true }
  const mutateAsync = vi.fn().mockResolvedValue({ ...done, completed: false })
  const { notify } = setup({ data: [done], mutateAsync })
  await user.click(screen.getByRole('button', { name: `Toggle ${done.title}` }))
  expect(mutateAsync).toHaveBeenCalledExactlyOnceWith({
    id: done.id,
    input: { completed: false },
  })
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Task marked as active.'),
  )
})

it('does not notify when toggling a task fails', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockRejectedValue(new Error('Update failed'))
  const { notify } = setup({ mutateAsync })
  await user.click(
    screen.getByRole('button', { name: `Toggle ${todoFixture.title}` }),
  )
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(notify).not.toHaveBeenCalled()
})

it('ignores toggle requests while another operation is busy', async () => {
  const user = userEvent.setup()
  const { mutateAsync } = setup({ busy: true })
  await user.click(
    screen.getByRole('button', { name: `Toggle ${todoFixture.title}` }),
  )
  expect(mutateAsync).not.toHaveBeenCalled()
})

it('opens the editor for a new task and closes it without notifying', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'New task' }))
  expect(screen.getByText('editing: new task')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Close editor' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})

it('opens the editor for a new task from the list empty state', async () => {
  const user = userEvent.setup()
  setup({ data: [] })
  await user.click(screen.getByRole('button', { name: 'Create from list' }))
  expect(screen.getByText('editing: new task')).toBeVisible()
})

it('opens the editor for an existing task and notifies once it is saved', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  await user.click(
    screen.getByRole('button', { name: `Edit ${todoFixture.title}` }),
  )
  expect(screen.getByText(`editing: ${todoFixture.title}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Save editor' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledExactlyOnceWith('Editor saved.')
})

it('asks for confirmation before deleting and cancels without notifying', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  await user.click(
    screen.getByRole('button', { name: `Delete ${todoFixture.title}` }),
  )
  expect(screen.getByText(`deleting: ${todoFixture.title}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Close confirmation' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})

it('closes the confirmation and notifies after a task is deleted', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  await user.click(
    screen.getByRole('button', { name: `Delete ${todoFixture.title}` }),
  )
  await user.click(screen.getByRole('button', { name: 'Confirm deletion' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledExactlyOnceWith('Task deleted.')
})

it('shows the current notice message', () => {
  setup({ message: 'Hello' })
  expect(screen.getByTestId('notice')).toHaveTextContent('Hello')
})
