import { Check, Circle, Plus, ShoppingBasket } from 'lucide-react'

import { Card } from '../../components/Card'

const items = [
  ['Hafermilch', false],
  ['Eier', false],
  ['Avocados', false],
  ['Brot', true],
  ['Kaffee', false],
  ['Spül-Tabs', false],
  ['Tomaten', false],
  ['Mozzarella', true],
  ['Basilikum', false],
  ['Olivenöl', false],
  ['Nudeln', false],
  ['Parmesan', false],
  ['Zwiebeln', true],
  ['Knoblauch', false],
  ['Küchenrolle', false],
] as const

/** Replaceable static preview for a future Bring or shopping provider. */
export function ShoppingPreviewCard() {
  const done = items.filter(([, checked]) => checked).length
  return (
    <Card className="list-card" aria-labelledby="shopping-title">
      <header className="list-header">
        <div>
          <div className="card-eyebrow">
            <ShoppingBasket aria-hidden="true" /> Einkauf
          </div>
          <h2 id="shopping-title">Einkaufsliste</h2>
        </div>
        <span className="count-badge">
          {items.length - done} offen · {done} erledigt
        </span>
      </header>
      <div className="shopping-grid">
        {items.map(([title, checked]) => (
          <div className={`shopping-item ${checked ? 'is-done' : ''}`} key={title}>
            {checked ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
            <span>{title}</span>
          </div>
        ))}
      </div>
      <button className="quiet-add" type="button" disabled>
        <Plus aria-hidden="true" /> Artikel hinzufügen
      </button>
    </Card>
  )
}
