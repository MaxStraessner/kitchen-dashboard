import { Circle, Sparkles } from 'lucide-react'

import { Card } from '../../components/Card'
import { useTasks } from '../../hooks/useTasks'

/** Dashboard preview: intentionally read-only; task management lives in settings. */
export function TodoPreviewCard() {
  const { tasks, loading } = useTasks()
  const openTasks = tasks.filter((task) => !task.completed)

  return (
    <Card className="list-card" aria-labelledby="todo-title">
      <header className="list-header">
        <div>
          <div className="card-eyebrow">
            <Sparkles aria-hidden="true" /> Heute im Blick
          </div>
          <h2 id="todo-title">Aufgaben</h2>
        </div>
        <span className="count-badge">{openTasks.length} offen</span>
      </header>
      <div className="task-list" aria-busy={loading}>
        {!loading && openTasks.length === 0 && <p className="task-empty">Keine offenen Aufgaben</p>}
        {openTasks.map((task) => (
          <div className="task-row task-row--display" key={task.id}>
            <span className="task-status-icon" aria-hidden="true">
              <Circle />
            </span>
            <strong>{task.title}</strong>
            <span>Offen</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
