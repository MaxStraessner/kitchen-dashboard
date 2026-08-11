import { useCallback, useEffect, useState } from 'react'

import { photosApi } from '../services/api'
import type { Photo } from '../types/api'

interface PhotoState {
  photos: Photo[]
  loading: boolean
  uploading: boolean
  error: string | null
}

export function usePhotos() {
  const [state, setState] = useState<PhotoState>({
    photos: [],
    loading: true,
    uploading: false,
    error: null,
  })

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await photosApi.list(signal)
      setState((current) => ({
        ...current,
        photos: Array.isArray(response.photos) ? response.photos : [],
        loading: false,
        error: null,
      }))
    } catch (error) {
      if (signal?.aborted) return
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Fotos konnten nicht geladen werden.',
      }))
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  const upload = useCallback(async (files: File[]) => {
    setState((current) => ({ ...current, uploading: true, error: null }))
    try {
      for (const file of files) {
        const photo = await photosApi.upload(file)
        setState((current) => ({ ...current, photos: [photo, ...current.photos] }))
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Das Foto konnte nicht hochgeladen werden.',
      }))
      throw error
    } finally {
      setState((current) => ({ ...current, uploading: false }))
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    try {
      await photosApi.remove(id)
      setState((current) => ({
        ...current,
        photos: current.photos.filter((photo) => photo.id !== id),
        error: null,
      }))
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Das Foto konnte nicht gelöscht werden.',
      }))
      throw error
    }
  }, [])

  return { ...state, upload, remove, refresh }
}
