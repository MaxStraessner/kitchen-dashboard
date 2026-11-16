import { ImagePlus, Utensils, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { ModalDialog } from '../components/ModalDialog'
import { MealPlanDialog } from '../features/meal-plan/MealPlanDialog'
import { useMealPlan } from '../hooks/useMealPlan'

const uploadedAt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

export function MealPlanPage() {
  const state = useMealPlan()
  const fileInput = useRef<HTMLInputElement>(null)
  const [showImage, setShowImage] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="auth-eyebrow">Gemeinsamer Haushalt</p>
          <h1>Essensplan</h1>
          <p>Den aktuellen Essensplan für eure Familie hochladen und verwalten.</p>
        </div>
        <Link className="quiet-button" to="/settings">
          Einstellungen
        </Link>
      </header>
      <section
        className="photos-manager meal-plan-manager"
        aria-labelledby="meal-plan-manager-title"
      >
        <div className="photo-upload-panel">
          <div>
            <Utensils aria-hidden="true" />
            <div>
              <h2 id="meal-plan-manager-title">Gemeinsamer Essensplan</h2>
              <p>JPG, JPEG, PNG oder WebP · maximal 20 MB · ein aktueller Plan</p>
            </div>
          </div>
          <input
            ref={fileInput}
            className="photo-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            aria-label="Essensplan auswählen"
            disabled={state.saving}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void state.replace(file)
            }}
          />
          <button
            type="button"
            className="primary-button photo-upload-button"
            disabled={state.saving || state.loading}
            onClick={() => fileInput.current?.click()}
          >
            {state.saving ? <UploadCloud aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
            {state.saving
              ? 'Wird gespeichert …'
              : state.plan
                ? 'Essensplan ersetzen'
                : 'Essensplan hochladen'}
          </button>
        </div>
        {state.error && (
          <p className="photo-manager-error" role="alert">
            {state.error}
          </p>
        )}
        {state.stale && (
          <p className="meal-plan-notice" role="status">
            Verbindung unterbrochen · zuletzt geladener Stand
          </p>
        )}
        {state.plan ? (
          <article className="meal-plan-current" aria-busy={state.saving}>
            <button
              type="button"
              className="meal-plan-manager-preview"
              onClick={() => setShowImage(true)}
              aria-label="Essensplan vergrößern"
            >
              <img src={state.plan.imageUrl} alt="Aktueller Essensplan" />
            </button>
            <div className="photo-manager-copy">
              <strong>{state.plan.originalName}</strong>
              <span>
                {state.plan.width} × {state.plan.height} Pixel
              </span>
              <small>Hochgeladen am {uploadedAt.format(new Date(state.plan.uploadedAt))}</small>
            </div>
            <div className="modal-actions">
              <button type="button" className="quiet-button" onClick={() => setShowImage(true)}>
                Vergrößern
              </button>
              <button
                type="button"
                className="quiet-button quiet-button--danger"
                disabled={state.saving}
                onClick={() => setConfirmDelete(true)}
              >
                Löschen
              </button>
            </div>
          </article>
        ) : (
          <div className="photo-manager-empty" aria-busy={state.loading}>
            <Utensils aria-hidden="true" />
            <strong>
              {state.loading
                ? 'Essensplan wird geladen …'
                : state.stale
                  ? 'Essensplan derzeit nicht verfügbar'
                  : 'Noch kein Essensplan hinterlegt'}
            </strong>
            {!state.loading && !state.stale && (
              <span>Lade ein Bild hoch. Es erscheint anschließend direkt auf dem Dashboard.</span>
            )}
          </div>
        )}
      </section>
      {showImage && state.plan && (
        <MealPlanDialog plan={state.plan} onClose={() => setShowImage(false)} />
      )}
      {confirmDelete && (
        <ModalDialog title="Essensplan löschen?" onClose={() => setConfirmDelete(false)}>
          <p>Der aktuelle Essensplan wird für alle Familienmitglieder entfernt.</p>
          <div className="modal-actions">
            <button type="button" className="quiet-button" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </button>
            <button
              type="button"
              className="quiet-button quiet-button--danger"
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
    </main>
  )
}
