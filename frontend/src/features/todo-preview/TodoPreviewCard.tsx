import { Check, Circle, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'

import { Card } from '../../components/Card'
import { useTasks } from '../../hooks/useTasks'

export function TodoPreviewCard() {
  const taskState = useTasks()
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState<string | null>(null)

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
    try { await action() } finally { setPending(null) }
  }

  const open = taskState.tasks.filter((task) => !task.completed).length
  return (
    <Card className="list-card" aria-labelledby="todo-title">
      <header className="list-header">
        <div>
          <div className="card-eyebrow"><Sparkles aria-hidden="true" /> Heute im Blick</div>
          <h2 id="todo-title">Aufgaben</h2>
        </div>
        <span className="count-badge">{open} offen</span>
      </header>
      <div className="task-list" aria-busy={taskState.loading}>
        {!taskState.loading && taskState.tasks.length === 0 && <p className="task-empty">Keine Aufgaben offen.</p>}
        {taskState.tasks.map((task) => (
          <div className={`task-row ${task.completed ? 'is-done' : ''}`} key={task.id}>
            <button className="task-toggle" type="button" aria-label={`${task.completed ? 'Öffnen' : 'Erledigen'}: ${task.title}`} disabled={pending !== null} onClick={() => void update(task.id, () => taskState.toggle(task))}>
              {task.completed ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
            </button>
            <strong>{task.title}</strong>
            <span>{task.completed ? 'Erledigt' : 'Offen'}</span>
            <button className="task-delete" type="button" aria-label={`Löschen: ${task.title}`} disabled={pending !== null} onClick={() => void update(task.id, () => taskState.remove(task.id))}><Trash2 aria-hidden="true" /></button>
          </div>
        ))}
      </div>
      {taskState.error && <p className="task-error" role="status">{taskState.error}</p>}
      <form className="task-add-form" onSubmit={(event) => void addTask(event)}>
        <input aria-label="Neue Aufgabe" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} placeholder="Aufgabe hinzufügen" disabled={pending !== null} />
        <button className="quiet-add" type="submit" disabled={!title.trim() || pending !== null}><Plus aria-hidden="true" /> Hinzufügen</button>
      </form>
    </Card>
  )
}
