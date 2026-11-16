import { Circle, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card } from '../../components/Card'
import { usePreviewCapacity } from '../../hooks/usePreviewCapacity'
import { useTasks } from '../../hooks/useTasks'

export function TodoPreviewCard() {
  const { tasks, loading } = useTasks()
  const openTasks = tasks.filter((task) => !task.completed)
  const { ref, capacity } = usePreviewCapacity(openTasks.length, 44, 3)
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
      <div className="task-list" ref={ref} aria-busy={loading}>
        {!loading && openTasks.length === 0 && <p className="task-empty">Keine offenen Aufgaben</p>}
        {openTasks.slice(0, capacity).map((task) => (
          <div className="task-row task-row--display" key={task.id}>
            <span className="task-status-icon" aria-hidden="true">
              <Circle />
            </span>
            <strong>{task.title}</strong>
            <span>Offen</span>
          </div>
        ))}
        {openTasks.length > capacity && (
          <Link className="preview-more" to="/settings/tasks">
            + {openTasks.length - capacity} weitere · Alle anzeigen
          </Link>
        )}
      </div>
    </Card>
  )
}
