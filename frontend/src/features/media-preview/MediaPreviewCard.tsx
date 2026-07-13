import { Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react'

import { Card } from '../../components/Card'

/** Replaceable static preview. No Spotify SDK, account, or network access is used. */
export function MediaPreviewCard() {
  return (
    <Card className="media-card" tone="green" aria-label="Medienvorschau">
      <div className="media-layout">
        <img className="media-cover" src="/media-cover.svg" alt="Abstraktes Albumcover" />
        <div className="media-copy">
          <div className="card-eyebrow media-service">
            <span className="spotify-dot" /> Medienvorschau
          </div>
          <h2>Golden Hour</h2>
          <p>Morning Collective · Slow Sundays</p>
        </div>
      </div>
      <div className="media-progress" aria-label="Wiedergabefortschritt">
        <span />
      </div>
      <div className="media-time">
        <span>1:42</span>
        <span>3:58</span>
      </div>
      <div className="media-controls" aria-label="Statische Mediensteuerung">
        <button type="button" disabled aria-label="Vorheriger Titel">
          <SkipBack />
        </button>
        <button type="button" disabled className="media-play" aria-label="Pause">
          <Pause />
        </button>
        <button type="button" disabled aria-label="Nächster Titel">
          <SkipForward />
        </button>
        <Volume2 className="media-volume" aria-hidden="true" />
      </div>
    </Card>
  )
}
