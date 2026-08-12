import { ImageOff, Images } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Card } from '../../components/Card'
import { photosApi } from '../../services/api'
import type { Photo } from '../../types/api'
import { PHOTO_COLLECTION_CHANGED_EVENT } from './photoEvents'

const SLIDESHOW_INTERVAL_MS = 60_000

export function PhotoSlideshow({ photos }: { photos: Photo[] }) {
  const [available, setAvailable] = useState(photos)
  const [currentPhotoId, setCurrentPhotoId] = useState<string | null>(photos[0]?.id ?? null)
  const availableRef = useRef(available)
  availableRef.current = available

  useEffect(() => {
    setAvailable(photos)
    setCurrentPhotoId((current) =>
      photos.some((photo) => photo.id === current) ? current : (photos[0]?.id ?? null),
    )
  }, [photos])

  useEffect(() => {
    if (available.length < 2) return
    const timer = window.setInterval(() => {
      const currentPhotos = availableRef.current
      setCurrentPhotoId((current) => {
        const currentIndex = currentPhotos.findIndex((photo) => photo.id === current)
        const nextIndex = (Math.max(currentIndex, 0) + 1) % currentPhotos.length
        return currentPhotos[nextIndex]?.id ?? current
      })
    }, SLIDESHOW_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [available.length])

  useEffect(() => {
    if (available.length === 0) {
      if (currentPhotoId !== null) setCurrentPhotoId(null)
      return
    }
    if (!available.some((photo) => photo.id === currentPhotoId)) {
      const firstPhoto = available[0]
      if (firstPhoto) setCurrentPhotoId(firstPhoto.id)
    }
  }, [available, currentPhotoId])

  const currentIndex = Math.max(
    0,
    available.findIndex((photo) => photo.id === currentPhotoId),
  )

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

  const loadGallery = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(false)
    try {
      const response = await photosApi.gallery(signal)
      setPhotos(Array.isArray(response.photos) ? response.photos : [])
    } catch {
      if (!signal?.aborted) setError(true)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const refreshOnChange = () => void loadGallery()
    window.addEventListener(PHOTO_COLLECTION_CHANGED_EVENT, refreshOnChange)
    void loadGallery(controller.signal)
    return () => {
      controller.abort()
      window.removeEventListener(PHOTO_COLLECTION_CHANGED_EVENT, refreshOnChange)
    }
  }, [loadGallery])

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
