import { Check, ChevronDown, Circle, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Card } from '../components/Card'
import { useTasks } from '../hooks/useTasks'

export function TasksPage() {
  const taskState = useTasks()
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const openTasks = taskState.tasks.filter((task) => !task.completed)
  const completedTasks = taskState.tasks.filter((task) => task.completed)

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = title.trim()
    if (!value || pending) return
    setPending('new')
    try {
      await taskState.create(value)
      setTitle('')
    } finally {
      setPending(null)
    }
  }

  async function update(id: string, action: () => Promise<void>) {
    if (pending) return
    setPending(id)
    try {
      await action()
    } finally {
      setPending(null)
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="auth-eyebrow">Gemeinsamer Haushalt</p>
          <h1>Aufgaben</h1>
          <p>Gemeinsam planen und erledigte Aufgaben im Blick behalten.</p>
        </div>
        <Link className="quiet-button" to="/settings">
          Einstellungen
        </Link>
      </header>
      <Card className="tasks-manager-card" aria-labelledby="tasks-manager-title">
        <h2 id="tasks-manager-title">Offene Aufgaben</h2>
        <form className="task-add-form" onSubmit={(event) => void addTask(event)}>
          <input
            aria-label="Neue Aufgabe"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={240}
            placeholder="Aufgabe hinzufügen"
            disabled={pending !== null}
          />
          <button className="quiet-add" type="submit" disabled={!title.trim() || pending !== null}>
            <Plus aria-hidden="true" /> Hinzufügen
          </button>
        </form>
        {taskState.error && (
          <p className="task-error" role="status">
            {taskState.error}
          </p>
        )}
        <div className="task-list" aria-busy={taskState.loading}>
          {!taskState.loading && openTasks.length === 0 && (
            <p className="task-empty">Keine offenen Aufgaben</p>
          )}
          {openTasks.map((task) => (
            <TaskRow
              key={task.id}
              title={task.title}
              completed={false}
              disabled={pending !== null}
              onToggle={() => void update(task.id, () => taskState.toggle(task))}
              onDelete={() => void update(task.id, () => taskState.remove(task.id))}
            />
          ))}
        </div>
        {completedTasks.length > 0 && (
          <details className="completed-tasks">
            <summary>
              Erledigt ({completedTasks.length}) <ChevronDown aria-hidden="true" />
            </summary>
            <div className="task-list">
              {completedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  title={task.title}
                  completed
                  disabled={pending !== null}
                  onToggle={() => void update(task.id, () => taskState.toggle(task))}
                  onDelete={() => void update(task.id, () => taskState.remove(task.id))}
                />
              ))}
            </div>
          </details>
        )}
      </Card>
    </main>
  )
}

function TaskRow({
  title,
  completed,
  disabled,
  onToggle,
  onDelete,
}: {
  title: string
  completed: boolean
  disabled: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className={`task-row ${completed ? 'is-done' : ''}`}>
      <button
        className="task-toggle"
        type="button"
        aria-label={`${completed ? 'Öffnen' : 'Erledigen'}: ${title}`}
        disabled={disabled}
        onClick={() => onToggle()}
      >
        {completed ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
      </button>
      <strong>{title}</strong>
      <span>{completed ? 'Erledigt' : 'Offen'}</span>
      <button
        className="task-delete"
        type="button"
        aria-label={`Löschen: ${title}`}
        disabled={disabled}
        onClick={() => onDelete()}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  )
}
