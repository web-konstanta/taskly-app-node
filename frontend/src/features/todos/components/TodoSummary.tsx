import { Text } from '../../../design-system'
import { useTodoStatsQuery } from '../hooks/useTodoStatsQuery'

export function TodoSummary() {
  const { data } = useTodoStatsQuery()
  if (!data || data.total === 0) return null
  return (
    <section aria-label="Task summary">
      <Text muted>
        {data.active} active · {data.completed} completed
        {data.overdue > 0 && ` · ${data.overdue} overdue`}
        {data.due_today > 0 && ` · ${data.due_today} due today`}
      </Text>
    </section>
  )
}
