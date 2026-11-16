import { useState } from 'react'

import { ModalDialog } from '../../components/ModalDialog'
import type { MealPlan } from '../../types/api'

export function MealPlanDialog({ plan, onClose }: { plan: MealPlan; onClose: () => void }) {
  const [zoom, setZoom] = useState(1)
  return (
    <ModalDialog title="Essensplan" onClose={onClose} className="meal-plan-dialog">
      <div className="image-zoom-controls">
        <button
          type="button"
          className="quiet-button"
          disabled={zoom === 1}
          onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
        >
          Verkleinern
        </button>
        <span>{Math.round(zoom * 100)} %</span>
        <button
          type="button"
          className="quiet-button"
          disabled={zoom === 3}
          onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
        >
          Vergrößern
        </button>
      </div>
      <div className="meal-plan-image-scroll">
        <div
          className="meal-plan-zoom-canvas"
          style={{ width: `${String(zoom * 100)}%`, height: `${String(zoom * 100)}%` }}
        >
          <img src={plan.imageUrl} alt="Essensplan in Großansicht" />
        </div>
      </div>
    </ModalDialog>
  )
}
