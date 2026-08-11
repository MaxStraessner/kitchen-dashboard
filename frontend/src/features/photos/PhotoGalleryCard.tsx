import { ImageOff, Images } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Card } from '../../components/Card'
import { photosApi } from '../../services/api'
import type { Photo } from '../../types/api'

const SLIDESHOW_INTERVAL_MS = 12_000

export function PhotoSlideshow({ photos }: { photos: Photo[] }) {
  const [available, setAvailable] = useState(photos)
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    setAvailable(photos)
    setCurrentIndex(0)
  }, [photos])

  useEffect(() => {
    if (available.length < 2) return
    const timer = window.setInterval(() => {
      setCurrentIndex((current) => (current + 1) % available.length)
    }, SLIDESHOW_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [available.length])

  useEffect(() => {
    if (currentIndex >= available.length) setCurrentIndex(0)
  }, [available.length, currentIndex])

  const visibleIds = useMemo(() => {
    if (available.length === 0) return new Set<string>()
    const previous = (currentIndex - 1 + available.length) % available.length
    const next = (currentIndex + 1) % available.length
    return new Set([available[currentIndex]?.id, available[previous]?.id, available[next]?.id])
  }, [available, currentIndex])

  if (available.length === 0) {
    return (
      <div className="photo-empty-state">
        <Images aria-hidden="true" />
        <strong>Noch keine Fotos</strong>
        <span>Fotos können in den Einstellungen hinzugefügt werden.</span>
      </div>
    )
  }

  return (
    <>
      <div className="photo-slides" aria-live="off">
        {available.map((photo, index) =>
          visibleIds.has(photo.id) ? (
            <img
              key={photo.id}
              className={`photo-slide ${index === currentIndex ? 'is-active' : ''}`}
              src={photo.imageUrl}
              alt={`Familienfoto von ${photo.uploaderDisplayName}`}
              onError={() => {
                setAvailable((current) => current.filter((item) => item.id !== photo.id))
              }}
            />
          ) : null,
        )}
      </div>
      <div className="photo-card-overlay">
        <span>Familienfotos</span>
        {available.length > 1 && <small>{available.length} Fotos</small>}
      </div>
    </>
  )
}

export function PhotoGalleryCard() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    photosApi
      .gallery(controller.signal)
      .then((response) => setPhotos(Array.isArray(response.photos) ? response.photos : []))
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  return (
    <Card className="photo-card" aria-label="Familienfotos" aria-busy={loading}>
      {error ? (
        <div className="photo-empty-state">
          <ImageOff aria-hidden="true" />
          <strong>Fotos nicht verfügbar</strong>
          <span>Die Galerie konnte gerade nicht geladen werden.</span>
        </div>
      ) : (
        <PhotoSlideshow photos={photos} />
      )}
    </Card>
  )
}
