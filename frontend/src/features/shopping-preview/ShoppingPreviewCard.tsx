import { AlertCircle, Check, Circle, Plus, ShoppingBasket, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Card } from '../../components/Card'
import { useShoppingList } from '../../hooks/useShoppingList'
import type { BringState } from '../../types/api'

const statusText: Partial<Record<BringState, string>> = {
  disabled: 'Bring ist noch nicht aktiviert.',
  configuration_missing: 'Die Bring-Verbindung ist noch nicht eingerichtet.',
  authentication_failed: 'Bring-Anmeldung fehlgeschlagen.',
  rate_limited: 'Bring ist vorübergehend ausgelastet.',
  unavailable: 'Bring ist vorübergehend nicht erreichbar.',
}

function AddItemDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (name: string, specification: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [specification, setSpecification] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose, saving])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || submitting.current) return
    submitting.current = true
    setSaving(true)
    setError('')
    try {
      await onAdd(trimmed, specification.trim())
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Artikel konnte nicht hinzugefügt werden.',
      )
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <div className="sheet-backdrop shopping-dialog-backdrop">
      <form
        className="user-dialog shopping-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-shopping-title"
        onSubmit={(event) => void submit(event)}
      >
        <header>
          <div>
            <p className="auth-eyebrow">Einkaufsliste</p>
            <h2 id="add-shopping-title">Artikel hinzufügen</h2>
          </div>
          <button type="button" aria-label="Dialog schließen" disabled={saving} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <label>
          Artikelname
          <input
            autoFocus
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Menge oder Zusatzangabe <small>optional</small>
          <input
            maxLength={160}
            value={specification}
            onChange={(event) => setSpecification(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={saving || !name.trim()}>
          {saving ? 'Wird hinzugefügt …' : 'Artikel hinzufügen'}
        </button>
      </form>
    </div>
  )
}

export function ShoppingPreviewCard() {
  const shopping = useShoppingList()
  const [adding, setAdding] = useState(false)
  const unavailableText = statusText[shopping.status]

  return (
    <>
      <Card className="list-card" aria-labelledby="shopping-title">
        <header className="list-header">
          <div>
            <div className="card-eyebrow">
              <ShoppingBasket aria-hidden="true" /> Einkauf
            </div>
            <h2 id="shopping-title">Einkaufsliste</h2>
          </div>
          <span className="count-badge">{shopping.items.length} offen</span>
        </header>
        <div className="shopping-grid" aria-live="polite">
          {shopping.loading &&
            Array.from({ length: 6 }, (_, index) => (
              <div className="shopping-item shopping-skeleton" key={index} aria-hidden="true" />
            ))}
          {!shopping.loading && shopping.items.length === 0 && shopping.status === 'ok' && (
            <div className="shopping-empty">
              <strong>Alles erledigt</strong>
              <span>Die Einkaufsliste ist leer.</span>
            </div>
          )}
          {shopping.items.map((item) => {
            const completing = shopping.completing.has(item.id)
            return (
              <button
                className={`shopping-item ${completing ? 'is-done' : ''}`}
                type="button"
                disabled={completing || item.id.startsWith('pending-')}
                aria-label={`${item.name} als gekauft markieren`}
                key={item.id}
                onClick={() => void shopping.completeItem(item.id)}
              >
                {completing ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
                <span className="shopping-copy">
                  <span>{item.name}</span>
                  {item.specification && <small>{item.specification}</small>}
                </span>
              </button>
            )
          })}
          {!shopping.loading && unavailableText && shopping.items.length === 0 && (
            <div className="shopping-state">
              <AlertCircle aria-hidden="true" /> {unavailableText}
            </div>
          )}
        </div>
        {(shopping.error || shopping.stale || shopping.liveReconnecting) && (
          <p className={`shopping-notice ${shopping.error ? 'is-error' : ''}`} role="status">
            {shopping.error ||
              (shopping.stale
                ? 'Zuletzt geladener Stand · Verbindung zu Bring wird wiederhergestellt.'
                : 'Live-Verbindung wird wiederhergestellt …')}
          </p>
        )}
        <button
          className="quiet-add"
          type="button"
          disabled={shopping.status !== 'ok' && !shopping.stale}
          onClick={() => {
            shopping.clearError()
            setAdding(true)
          }}
        >
          <Plus aria-hidden="true" /> Artikel hinzufügen
        </button>
      </Card>
      {adding && <AddItemDialog onClose={() => setAdding(false)} onAdd={shopping.addItem} />}
    </>
  )
}
