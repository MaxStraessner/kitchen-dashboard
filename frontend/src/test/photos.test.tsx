import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { App } from '../app/App'
import { AuthProvider } from '../auth/AuthProvider'
import { PhotoSlideshow } from '../features/photos/PhotoGalleryCard'
import type { Photo } from '../types/api'

const user = {
  id: 'u1',
  username: 'max',
  displayName: 'Max',
  role: 'admin',
  household: { id: 'h1', name: 'Familie' },
  mustChangePassword: false,
  lastLoginAt: null,
}

function photo(id: string, uploaderDisplayName = 'Max'): Photo {
  return {
    id,
    uploaderUserId: 'u1',
    uploaderDisplayName,
    originalName: `${id}.jpg`,
    originalMimeType: 'image/jpeg',
    mimeType: 'image/webp',
    originalFileSize: 1_000_000,
    fileSize: 200_000,
    width: 1200,
    height: 800,
    uploadedAt: '2026-08-11T10:00:00Z',
    imageUrl: `/api/v1/photos/${id}/image`,
    thumbnailUrl: `/api/v1/photos/${id}/thumbnail`,
    canDelete: true,
  }
}

function response(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(payload) }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('photo tile handles zero, one and multiple photos with a quiet slideshow', async () => {
  const empty = render(<PhotoSlideshow photos={[]} />)
  expect(screen.getByText('Noch keine Fotos')).toBeInTheDocument()
  empty.unmount()

  const single = render(<PhotoSlideshow photos={[photo('one')]} />)
  expect(screen.getByAltText('Familienfoto von Max')).toHaveClass('is-active')
  single.unmount()

  vi.useFakeTimers()
  const slideshow = render(
    <PhotoSlideshow
      photos={[photo('first', 'Max'), photo('second', 'Jessica'), photo('third', 'Hannah')]}
    />,
  )
  expect(screen.getByAltText('Familienfoto von Max')).toHaveClass('is-active')
  await act(() => {
    vi.advanceTimersByTime(60_000)
    return Promise.resolve()
  })
  expect(screen.getByAltText('Familienfoto von Jessica')).toHaveClass('is-active')

  slideshow.rerender(<PhotoSlideshow photos={[photo('first', 'Max'), photo('third', 'Hannah')]} />)
  await act(() => Promise.resolve())
  expect(screen.getByAltText('Familienfoto von Max')).toHaveClass('is-active')

  slideshow.rerender(
    <PhotoSlideshow
      photos={[photo('first', 'Max'), photo('third', 'Hannah'), photo('fourth', 'Lena')]}
    />,
  )
  await act(() => Promise.resolve())
  await act(() => {
    vi.advanceTimersByTime(60_000)
    return Promise.resolve()
  })
  expect(screen.getByAltText('Familienfoto von Hannah')).toHaveClass('is-active')
  await act(() => {
    vi.advanceTimersByTime(120_000)
    return Promise.resolve()
  })
  expect(screen.getByAltText('Familienfoto von Max')).toHaveClass('is-active')
})

test('photo management uploads immediately and deletes only after confirmation', async () => {
  const uploaded = photo('new-photo')
  const fetchMock = vi.fn((input: string | URL | Request, options?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.endsWith('/setup/status')) return Promise.resolve(response({ setupRequired: false }))
    if (url.endsWith('/auth/me')) return Promise.resolve(response(user))
    if (url.endsWith('/auth/csrf')) return Promise.resolve(response({ csrfToken: 'csrf' }))
    if (url.endsWith('/photos') && options?.method === 'POST') {
      expect(options.body).toBeInstanceOf(FormData)
      return Promise.resolve(response(uploaded, 201))
    }
    if (url.endsWith('/photos/new-photo') && options?.method === 'DELETE') {
      return Promise.resolve(response(undefined, 204))
    }
    if (url.endsWith('/photos')) return Promise.resolve(response({ photos: [] }))
    return Promise.resolve(response({}))
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  )
  const interaction = userEvent.setup()

  render(
    <MemoryRouter initialEntries={['/settings/photos']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('heading', { name: 'Fotos' })).toBeInTheDocument()
  expect(screen.getByLabelText('Fotos auswählen')).toHaveAttribute(
    'accept',
    'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.jpe,.png,.webp,.heic,.heif',
  )
  const file = new File(['photo-content'], 'Sommer.jpg', { type: 'image/jpeg' })
  await interaction.upload(screen.getByLabelText('Fotos auswählen'), file)
  expect(await screen.findByText('new-photo.jpg')).toBeInTheDocument()
  expect(screen.getByText('Von Max')).toBeInTheDocument()

  await interaction.click(screen.getByRole('button', { name: 'Foto löschen: new-photo.jpg' }))
  await waitFor(() => expect(screen.queryByText('new-photo.jpg')).not.toBeInTheDocument())
  expect(window.confirm).toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/photos/new-photo'),
    expect.objectContaining({ method: 'DELETE' }),
  )
})
