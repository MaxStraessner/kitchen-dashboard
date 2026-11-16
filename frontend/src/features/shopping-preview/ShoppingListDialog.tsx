import { Check, Circle } from 'lucide-react'

import { ModalDialog } from '../../components/ModalDialog'
import type { BringItem } from '../../types/api'

export function ShoppingItem({
  item,
  completing,
  onComplete,
}: {
  item: BringItem
  completing: boolean
  onComplete: () => void
}) {
  return (
    <button
      className={`shopping-item ${completing ? 'is-done' : ''}`}
      type="button"
      disabled={completing || item.id.startsWith('pending-')}
      aria-label={`${item.name} als gekauft markieren`}
      onClick={onComplete}
    >
      {completing ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
      <span className="shopping-copy">
        <span>{item.name}</span>
        {item.specification && <small>{item.specification}</small>}
      </span>
    </button>
  )
}

export function ShoppingListDialog({
  items,
  completing,
  onComplete,
  onAdd,
  onClose,
  error,
}: {
  items: BringItem[]
  completing: Set<string>
  onComplete: (id: string) => void
  onAdd: () => void
  onClose: () => void
  error: string | null
}) {
  return (
    <ModalDialog title={`Einkaufsliste · ${String(items.length)} offen`} onClose={onClose}>
      <div className="modal-body">
        <div className="shopping-dialog-items">
          {items.length === 0 && <p>Alles erledigt</p>}
          {items.map((item) => (
            <ShoppingItem
              key={item.id}
              item={item}
              completing={completing.has(item.id)}
              onComplete={() => onComplete(item.id)}
            />
          ))}
        </div>
      </div>
      {error && (
        <p role="status" className="form-error">
          {error}
        </p>
      )}
      <button type="button" className="quiet-add" onClick={onAdd}>
        Artikel hinzufügen
      </button>
    </ModalDialog>
  )
}
