import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { App } from '../app/App'
import { AuthProvider } from '../auth/AuthProvider'
import { CameraStreamCard } from '../features/camera/CameraStreamCard'
import { createFallbackDashboard } from '../services/fallback'
import type { CameraModeEvent, CameraModeStatus } from '../types/api'

class EventSourceMock {
  static instances: EventSourceMock[] = []
  readonly listeners = new Map<string, EventListenerOrEventListenerObject>()
  onerror: (() => void) | null = null

  constructor(readonly url: string) {
    EventSourceMock.instances.push(this)
  }

  addEventListener(name: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.set(name, listener)
  }

  emit(name: string, payload: object) {
    const listener = this.listeners.get(name)
    const event = new MessageEvent('message', { data: JSON.stringify(payload) })
    if (typeof listener === 'function') listener(event)
    else listener?.handleEvent(event)
  }

  close() {}
}

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  }
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function mockApplication(initialCamera: CameraModeStatus) {
  let camera = initialCamera
  let taskRequests = 0
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = requestUrl(input)
    if (url.endsWith('/setup/status')) return Promise.resolve(response({ setupRequired: false }))
    if (url.endsWith('/auth/me'))
      return Promise.resolve(
        response({
          id: 'u1',
          username: 'max',
          displayName: 'Max',
          role: 'admin',
          household: { id: 'h1', name: 'Familie' },
          mustChangePassword: false,
          lastLoginAt: null,
        }),
      )
    if (url.endsWith('/auth/csrf')) return Promise.resolve(response({ csrfToken: 'csrf' }))
    if (url.endsWith('/camera/status')) return Promise.resolve(response(camera))
    if (url.endsWith('/camera/activate') && init?.method === 'POST') {
      camera = {
        active: true,
        expiresAt: '2026-08-22T12:15:00Z',
        streamUrl: '/camera-stream/api/stream.mp4?src=tapo',
        revision: camera.revision + 1,
      }
      return Promise.resolve(response(camera))
    }
    if (url.endsWith('/camera/deactivate') && init?.method === 'POST') {
      camera = { ...camera, active: false, expiresAt: null, revision: camera.revision + 1 }
      return Promise.resolve(response(camera))
    }
    if (url.includes('/camera-stream/'))
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('answer'),
      })
    if (url.endsWith('/dashboard')) return Promise.resolve(response(createFallbackDashboard()))
    if (url.endsWith('/tasks')) {
      taskRequests += 1
      return Promise.resolve(
        response({
          tasks: [
            {
              id: 'task-1',
              title: 'Küche putzen',
              completed: false,
              createdAt: '',
              updatedAt: '',
              completedAt: null,
              sortOrder: 0,
            },
          ],
        }),
      )
    }
    if (url.endsWith('/photos/gallery')) return Promise.resolve(response({ photos: [] }))
    if (url.endsWith('/bring/items'))
      return Promise.resolve(
        response({
          items: [],
          configured: false,
          available: false,
          stale: false,
          status: 'disabled',
          last_successful_sync_at: null,
          revision: 0,
        }),
      )
    return Promise.resolve(response({}))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, taskRequests: () => taskRequests }
}

function cameraEventSource(): EventSourceMock {
  const source = EventSourceMock.instances.find((entry) => entry.url.endsWith('/camera/events'))
  if (!source) throw new Error('Camera EventSource was not created')
  return source
}

beforeEach(() => {
  EventSourceMock.instances = []
  vi.stubGlobal('EventSource', EventSourceMock)
})

afterEach(() => vi.unstubAllGlobals())

test('SSE switches only the lower dashboard region and preserves its mounted data', async () => {
  const application = mockApplication({
    active: false,
    expiresAt: null,
    streamUrl: '/camera-stream/api/stream.mp4?src=tapo',
    revision: 0,
  })
  renderAt()

  expect(await screen.findByText('Familienkalender')).toBeVisible()
  expect(await screen.findByText('Küche putzen')).toBeVisible()
  expect(screen.getByText('Spruch des Tages')).toBeVisible()

  const activeEvent: CameraModeEvent = {
    type: 'camera_mode_changed',
    active: true,
    expiresAt: '2026-08-22T12:15:00Z',
    streamUrl: '/camera-stream/api/stream.mp4?src=tapo',
    revision: 1,
  }
  act(() => cameraEventSource().emit('camera_mode_changed', activeEvent))

  const camera = await screen.findByLabelText('Tapo Live Stream')
  expect(camera).toBeVisible()
  expect(screen.getByText('Familienkalender')).toBeVisible()
  expect(screen.getByText('Küche putzen')).not.toBeVisible()
  expect(screen.getByText('Spruch des Tages')).not.toBeVisible()
  expect(camera.querySelector('video')).not.toHaveAttribute('controls')
  fireEvent.error(camera.querySelector('video') as HTMLVideoElement)
  expect(await screen.findByText('Kamera momentan nicht erreichbar')).toBeVisible()

  act(() =>
    cameraEventSource().emit('camera_mode_changed', {
      ...activeEvent,
      active: false,
      expiresAt: null,
      revision: 2,
    }),
  )
  await waitFor(() => expect(screen.queryByLabelText('Tapo Live Stream')).not.toBeInTheDocument())
  expect(screen.getByText('Küche putzen')).toBeVisible()
  expect(screen.getByText('Spruch des Tages')).toBeVisible()
  expect(application.taskRequests()).toBe(1)
})

test('mobile settings camera control activates with one button press', async () => {
  const application = mockApplication({
    active: false,
    expiresAt: null,
    streamUrl: '/camera-stream/api/stream.mp4?src=tapo',
    revision: 0,
  })
  const interaction = userEvent.setup()
  renderAt('/settings')

  expect(await screen.findByText('Kamera nicht aktiv')).toBeVisible()
  await interaction.click(screen.getByRole('button', { name: 'Kamera anzeigen' }))
  expect(await screen.findByText(/Kamera aktiv/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Kamera beenden' })).toBeEnabled()
  expect(application.fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/camera/activate'),
    expect.objectContaining({ method: 'POST' }),
  )
})

test('dashboard stop button closes camera mode and restores the normal region', async () => {
  mockApplication({
    active: true,
    expiresAt: '2026-08-22T12:15:00Z',
    streamUrl: '/camera-stream/api/stream.mp4?src=tapo',
    revision: 1,
  })
  const interaction = userEvent.setup()
  renderAt()

  const firstVideo = (await screen.findByLabelText('Tapo Live Stream')).querySelector('video')
  expect(firstVideo).not.toBeNull()
  await interaction.click(await screen.findByRole('button', { name: 'Kamera beenden' }))
  await waitFor(() => expect(screen.queryByLabelText('Tapo Live Stream')).not.toBeInTheDocument())
  expect(firstVideo?.isConnected).toBe(false)
  expect(await screen.findByText('Küche putzen')).toBeVisible()
  expect(screen.getByText('Familienkalender')).toBeVisible()

  const activeEvent: CameraModeEvent = {
    type: 'camera_mode_changed',
    active: true,
    expiresAt: '2026-08-22T12:30:00Z',
    streamUrl: '/camera-stream/api/stream.mp4?src=tapo',
    revision: 3,
  }
  act(() => cameraEventSource().emit('camera_mode_changed', activeEvent))
  const secondVideo = (await screen.findByLabelText('Tapo Live Stream')).querySelector('video')
  expect(secondVideo).not.toBeNull()
  expect(secondVideo).not.toBe(firstVideo)
  act(() =>
    cameraEventSource().emit('camera_mode_changed', {
      ...activeEvent,
      active: false,
      expiresAt: null,
      revision: 4,
    }),
  )
  await waitFor(() => expect(secondVideo?.isConnected).toBe(false))
  expect(screen.getByText('Küche putzen')).toBeVisible()
})

test('camera stream reconnects automatically after playback fails', async () => {
  render(
    <CameraStreamCard
      streamUrl="/camera-stream/api/stream.mp4?src=tapo"
      onDeactivate={() => Promise.resolve()}
    />,
  )

  const camera = screen.getByLabelText('Tapo Live Stream')
  const firstVideo = camera.querySelector('video') as HTMLVideoElement
  expect(firstVideo).toHaveAttribute('src', '/camera-stream/api/stream.mp4?src=tapo')
  fireEvent.error(firstVideo)
  expect(await screen.findByText('Kamera momentan nicht erreichbar')).toBeVisible()
  await waitFor(() => expect(camera.querySelector('video')).not.toBe(firstVideo), { timeout: 2_000 })
  const secondVideo = camera.querySelector('video') as HTMLVideoElement
  expect(await screen.findByText('Kamera wird verbunden')).toBeVisible()
  fireEvent.playing(secondVideo)
  await waitFor(() => expect(screen.queryByText('Kamera wird verbunden')).not.toBeInTheDocument())
})
