import { Utensils } from 'lucide-react'
import { useState } from 'react'

import { Card } from '../../components/Card'
import { useMealPlan } from '../../hooks/useMealPlan'
import { MealPlanDialog } from './MealPlanDialog'

export function MealPlanCard({ hidden = false }: { hidden?: boolean }) {
  const { plan, loading, stale } = useMealPlan()
  const [showImage, setShowImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  return (
    <>
      <Card className="meal-plan-card" aria-labelledby="meal-plan-title" hidden={hidden}>
        <header className="meal-plan-header">
          <h2 id="meal-plan-title">
            <Utensils aria-hidden="true" /> Essensplan
          </h2>
        </header>
        {plan ? (
          <button
            className="meal-plan-preview"
            type="button"
            onClick={() => setShowImage(true)}
            aria-label="Essensplan vergrößern"
          >
            <img
              key={plan.id}
              src={plan.imageUrl}
              alt="Aktueller Essensplan"
              onError={() => setImageError(plan.id)}
            />
            {imageError === plan.id && <span>Vorschau nicht verfügbar · Großansicht öffnen</span>}
          </button>
        ) : (
          <div className="meal-plan-empty">
            <span>
              {loading
                ? 'Essensplan wird geladen …'
                : stale
                  ? 'Essensplan derzeit nicht verfügbar'
                  : 'Noch kein Essensplan hinterlegt'}
            </span>
            {!loading && !stale && <small>Unter Einstellungen → Essensplan hochladen.</small>}
          </div>
        )}
        {stale && (
          <p className="meal-plan-notice" role="status">
            Verbindung unterbrochen · zuletzt geladener Stand
          </p>
        )}
      </Card>
      {!hidden && showImage && plan && (
        <MealPlanDialog plan={plan} onClose={() => setShowImage(false)} />
      )}
    </>
  )
}
