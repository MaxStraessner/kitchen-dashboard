import { Check, Circle, Plus, Sparkles } from 'lucide-react'

import { Card } from '../../components/Card'

const tasks = [
  { title: 'Küche gründlich putzen', due: 'Heute', done: false },
  { title: 'Blumen gießen', due: 'Heute', done: false },
  { title: 'Wäsche waschen', due: 'Morgen', done: false },
  { title: 'Papierkram erledigen', due: 'Freitag', done: false },
  { title: 'Müll herausbringen', due: 'Erledigt', done: true },
]

/** Replaceable static preview for the later shared-tasks feature. */
export function TodoPreviewCard() {
  const open = tasks.filter((task) => !task.done).length
  return (
    <Card className="list-card" aria-labelledby="todo-title">
      <header className="list-header">
        <div>
          <div className="card-eyebrow">
            <Sparkles aria-hidden="true" /> Heute im Blick
          </div>
          <h2 id="todo-title">Aufgaben</h2>
        </div>
        <span className="count-badge">{open} offen</span>
      </header>
      <div className="task-list">
        {tasks.map((task) => (
          <div className={`task-row ${task.done ? 'is-done' : ''}`} key={task.title}>
            {task.done ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
            <strong>{task.title}</strong>
            <span>{task.due}</span>
          </div>
        ))}
      </div>
      <button className="quiet-add" type="button" disabled>
        <Plus aria-hidden="true" /> Aufgabe hinzufügen
      </button>
    </Card>
  )
}
