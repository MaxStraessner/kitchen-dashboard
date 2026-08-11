import { ImageOff, ImagePlus, Images, Trash2, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { usePhotos } from '../hooks/usePhotos'
import type { Photo } from '../types/api'

const ACCEPTED_PHOTOS = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
}

function formatUploadDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function PhotoItem({
  photo,
  deleting,
  onDelete,
}: {
  photo: Photo
  deleting: boolean
  onDelete: () => void
}) {
  const [previewAvailable, setPreviewAvailable] = useState(true)
  return (
    <article className="photo-manager-item">
      <div className="photo-manager-preview">
        {previewAvailable ? (
          <img
            src={photo.thumbnailUrl}
            alt={photo.originalName}
            loading="lazy"
            onError={() => setPreviewAvailable(false)}
          />
        ) : (
          <div className="photo-preview-missing">
            <ImageOff aria-hidden="true" />
            <span>Vorschau nicht verfügbar</span>
          </div>
        )}
      </div>
      <div className="photo-manager-copy">
        <strong title={photo.originalName}>{photo.originalName}</strong>
        <span>Von {photo.uploaderDisplayName}</span>
        <small>
          {formatUploadDate(photo.uploadedAt)} · {formatBytes(photo.fileSize)} · {photo.width} ×{' '}
          {photo.height}
        </small>
      </div>
      {photo.canDelete && (
        <button
          className="photo-delete-button"
          type="button"
          aria-label={`Foto löschen: ${photo.originalName}`}
          disabled={deleting}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" />
          Löschen
        </button>
      )}
    </article>
  )
}

export function PhotosPage() {
  const auth = useAuth()
  const photoState = usePhotos()
  const fileInput = useRef<HTMLInputElement>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function selectPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    try {
      await photoState.upload(files)
    } catch {
      // The hook exposes the safe server message in the page.
    }
  }

  async function deletePhoto(photo: Photo) {
    const confirmed = window.confirm(`„${photo.originalName}“ wirklich löschen?`)
    if (!confirmed) return
    setDeletingId(photo.id)
    try {
      await photoState.remove(photo.id)
    } catch {
      // The hook exposes the safe server message in the page.
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="auth-eyebrow">Gemeinsamer Haushalt</p>
          <h1>Fotos</h1>
          <p>
            {auth.user?.role === 'admin'
              ? 'Familienfotos hochladen und für den Haushalt verwalten.'
              : 'Deine Familienfotos hochladen und verwalten.'}
          </p>
        </div>
        <Link className="quiet-button" to="/settings">
          Einstellungen
        </Link>
      </header>

      <section className="photos-manager" aria-labelledby="photos-title">
        <div className="photo-upload-panel">
          <div>
            <Images aria-hidden="true" />
            <div>
              <h2 id="photos-title">
                {auth.user?.role === 'admin' ? 'Familienfotoübersicht' : 'Deine Fotoübersicht'}
              </h2>
              <p>JPEG, PNG, WebP, HEIC oder HEIF · maximal 20 MB je Foto</p>
            </div>
          </div>
          <input
            ref={fileInput}
            className="photo-file-input"
            type="file"
            accept={ACCEPTED_PHOTOS}
            multiple
            aria-label="Fotos auswählen"
            onChange={(event) => void selectPhotos(event)}
          />
          <button
            className="primary-button photo-upload-button"
            type="button"
            disabled={photoState.uploading}
            onClick={() => fileInput.current?.click()}
          >
            {photoState.uploading ? (
              <UploadCloud aria-hidden="true" />
            ) : (
              <ImagePlus aria-hidden="true" />
            )}
            {photoState.uploading ? 'Fotos werden hochgeladen …' : 'Foto hinzufügen'}
          </button>
        </div>

        {photoState.error && (
          <p className="photo-manager-error" role="alert">
            {photoState.error}
          </p>
        )}

        <div className="photo-manager-grid" aria-busy={photoState.loading}>
          {!photoState.loading && photoState.photos.length === 0 && (
            <div className="photo-manager-empty">
              <Images aria-hidden="true" />
              <strong>Noch keine Fotos</strong>
              <span>Füge das erste Foto für eure Dashboard-Kachel hinzu.</span>
            </div>
          )}
          {photoState.photos.map((photo) => (
            <PhotoItem
              key={photo.id}
              photo={photo}
              deleting={deletingId === photo.id}
              onDelete={() => void deletePhoto(photo)}
            />
          ))}
        </div>
      </section>
    </main>
  )
}
