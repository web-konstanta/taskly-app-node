import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'
import type { Todo, TodoInput } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

const validInput: TodoInput = {
  title: 'Write tests',
  description: '',
  priority: 'medium',
  due_date: null,
  completed: false,
}

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('keeps only completed tasks for the completed filter', () => {
    const done: Todo = { ...base, id: 2, completed: true }
    expect(selectTodos([base, done], 'completed', '', 'newest')).toEqual([done])
  })

  it('matches the search against the title', () => {
    const other: Todo = { ...base, id: 2, title: 'Groceries' }
    expect(selectTodos([base, other], 'all', 'GROCER', 'newest')).toEqual([
      other,
    ])
  })

  it('orders tasks of equal priority with the most recent id first', () => {
    const newer: Todo = { ...base, id: 5 }
    expect(selectTodos([base, newer], 'all', '', 'priority')).toEqual([
      newer,
      base,
    ])
  })

  it('sorts by due date and places tasks without a due date last', () => {
    const noDate: Todo = { ...base, id: 1 }
    const late: Todo = { ...base, id: 2, due_date: '2026-12-01' }
    const early: Todo = { ...base, id: 3, due_date: '2026-11-01' }
    expect(selectTodos([noDate, late, early], 'all', '', 'due')).toEqual([
      early,
      late,
      noDate,
    ])
  })

  it('places tasks without a due date last regardless of input order', () => {
    const noDate: Todo = { ...base, id: 1 }
    const dated: Todo = { ...base, id: 2, due_date: '2026-11-01' }
    expect(selectTodos([dated, noDate], 'all', '', 'due')).toEqual([
      dated,
      noDate,
    ])
    expect(selectTodos([noDate, dated], 'all', '', 'due')).toEqual([
      dated,
      noDate,
    ])
  })

  it('orders tasks with the same due date with the most recent id first', () => {
    const a: Todo = { ...base, id: 1, due_date: '2026-11-01' }
    const b: Todo = { ...base, id: 2, due_date: '2026-11-01' }
    expect(selectTodos([a, b], 'all', '', 'due')).toEqual([b, a])
  })

  it('sorts newest first by creation time and breaks ties by id', () => {
    const older: Todo = { ...base, id: 1, created_at: '2026-09-01T00:00:00Z' }
    const newest: Todo = { ...base, id: 2, created_at: '2026-10-05T00:00:00Z' }
    const sameTime: Todo = {
      ...base,
      id: 3,
      created_at: '2026-10-05T00:00:00Z',
    }
    expect(selectTodos([older, newest, sameTime], 'all', '', 'newest')).toEqual(
      [sameTime, newest, older],
    )
  })
})

describe('validateTodo', () => {
  it('accepts a valid task', () => {
    expect(validateTodo(validInput)).toEqual({})
  })

  it('requires a title', () => {
    expect(validateTodo({ ...validInput, title: '  ' })).toEqual({
      title: 'Enter a task title.',
    })
  })

  it('allows a title of exactly 120 characters but not 121', () => {
    expect(validateTodo({ ...validInput, title: 'a'.repeat(120) })).toEqual({})
    expect(validateTodo({ ...validInput, title: 'a'.repeat(121) })).toEqual({
      title: 'The title must be at most 120 characters.',
    })
  })

  it('allows a description of exactly 2000 characters but not 2001', () => {
    expect(
      validateTodo({ ...validInput, description: 'a'.repeat(2000) }),
    ).toEqual({})
    expect(
      validateTodo({ ...validInput, description: 'a'.repeat(2001) }),
    ).toEqual({
      description: 'The description must be at most 2000 characters.',
    })
  })

  it('accepts a real calendar date including a leap day', () => {
    expect(validateTodo({ ...validInput, due_date: '2028-02-29' })).toEqual({})
  })

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '26-01-01', 'tomorrow'])(
    'rejects the invalid due date %s',
    (due_date) => {
      expect(validateTodo({ ...validInput, due_date })).toEqual({
        due_date: 'Enter a valid date.',
      })
    },
  )

  it('reports several problems at once', () => {
    expect(
      Object.keys(
        validateTodo({ ...validInput, title: '', due_date: 'nope' }),
      ).sort(),
    ).toEqual(['due_date', 'title'])
  })
})

describe('isOverdue', () => {
  afterEach(() => vi.useRealTimers())

  function at(year: number, monthIndex: number, day: number) {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(year, monthIndex, day, 12))
  }

  it('is true for an active task due before today', () => {
    at(2026, 9, 15)
    expect(isOverdue({ ...base, due_date: '2026-10-14' })).toBe(true)
  })

  it('is false for a task due today or later', () => {
    at(2026, 9, 15)
    expect(isOverdue({ ...base, due_date: '2026-10-15' })).toBe(false)
    expect(isOverdue({ ...base, due_date: '2026-10-16' })).toBe(false)
  })

  it('compares correctly across month and year boundaries with zero padding', () => {
    at(2027, 0, 5)
    expect(isOverdue({ ...base, due_date: '2026-12-31' })).toBe(true)
    expect(isOverdue({ ...base, due_date: '2027-01-05' })).toBe(false)
  })

  it('is false for a completed task or one without a due date', () => {
    at(2026, 9, 15)
    expect(
      isOverdue({ ...base, due_date: '2026-10-01', completed: true }),
    ).toBe(false)
    expect(isOverdue({ ...base, due_date: null })).toBe(false)
  })
})

describe('formatDate', () => {
  it('formats an ISO date as a short British date', () => {
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026')
  })

  it('does not shift the day regardless of the time zone offset', () => {
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026')
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026')
  })
})
