import { ImagePlus, Utensils } from 'lucide-react'
import { useRef, useState } from 'react'

import { Card } from '../../components/Card'
import { ModalDialog } from '../../components/ModalDialog'
import { useMealPlan } from '../../hooks/useMealPlan'
import { MealPlanDialog } from './MealPlanDialog'

export function MealPlanCard({ hidden = false }: { hidden?: boolean }) {
  const state = useMealPlan()
  const fileInput = useRef<HTMLInputElement>(null)
  const [showImage, setShowImage] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  return (
    <>
      <Card className="meal-plan-card" aria-labelledby="meal-plan-title" hidden={hidden}>
        <header className="meal-plan-header">
          <h2 id="meal-plan-title">
            <Utensils aria-hidden="true" /> Essensplan
          </h2>
          <div className="meal-plan-actions">
            <input
              className="photo-file-input"
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              aria-label="Essensplan auswählen"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void state.replace(file)
              }}
            />
            <button
              className="quiet-button"
              type="button"
              disabled={state.saving}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
              {state.saving
                ? 'Wird gespeichert …'
                : state.plan
                  ? 'Ersetzen'
                  : 'Essensplan hochladen'}
            </button>
            {state.plan && (
              <button
                className="quiet-button quiet-button--danger"
                type="button"
                disabled={state.saving}
                onClick={() => setConfirmDelete(true)}
              >
                Löschen
              </button>
            )}
          </div>
        </header>
        {state.plan ? (
          <button
            className="meal-plan-preview"
            type="button"
            onClick={() => setShowImage(true)}
            aria-label="Essensplan vergrößern"
          >
            <img
              key={state.plan.id}
              src={state.plan.thumbnailUrl}
              alt="Aktueller Essensplan"
              onError={() => setImageError(state.plan?.id ?? null)}
            />
            {imageError === state.plan.id && (
              <span>Vorschau nicht verfügbar · Großansicht öffnen</span>
            )}
          </button>
        ) : (
          <div className="meal-plan-empty">
            {state.loading
              ? 'Essensplan wird geladen …'
              : state.stale
                ? 'Essensplan derzeit nicht verfügbar'
                : 'Noch kein Essensplan hinterlegt'}
          </div>
        )}
        {(state.error || state.stale) && (
          <p className="meal-plan-notice" role="status">
            {state.error ?? 'Verbindung unterbrochen · zuletzt geladener Stand'}
          </p>
        )}
      </Card>
      {!hidden && showImage && state.plan && (
        <MealPlanDialog plan={state.plan} onClose={() => setShowImage(false)} />
      )}
      {!hidden && confirmDelete && (
        <ModalDialog title="Essensplan löschen?" onClose={() => setConfirmDelete(false)}>
          <p>Der aktuelle Essensplan wird für alle Familienmitglieder entfernt.</p>
          <div className="modal-actions">
            <button className="quiet-button" type="button" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </button>
            <button
              className="quiet-button quiet-button--danger"
              type="button"
              onClick={() => {
                setConfirmDelete(false)
                void state.remove()
              }}
            >
              Löschen bestätigen
            </button>
          </div>
        </ModalDialog>
      )}
    </>
  )
}
