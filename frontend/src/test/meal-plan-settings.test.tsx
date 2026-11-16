import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { App } from '../app/App'
import { AuthProvider } from '../auth/AuthProvider'
import { MealPlanCard } from '../features/meal-plan/MealPlanCard'
import { MealPlanPage } from '../pages/MealPlanPage'
import { createFallbackDashboard } from '../services/fallback'

const plan = {
  id: 'p1',
  originalName: 'Familienplan.png',
  width: 1200,
  height: 800,
  uploadedAt: '2026-11-16T12:00:00Z',
  imageUrl: '/image/p1',
  thumbnailUrl: '/thumb/p1',
}

function mock(role: 'member' | 'admin' | null = 'member', current: typeof plan | null = null) {
  const fetchMock = vi.fn((input: string | URL | Request, options?: RequestInit) => {
    if (options?.method && options.method !== 'GET')
      return Promise.resolve(new Response(null, { status: 403 }))
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const payload: Record<string, unknown> = {
      '/api/v1/setup/status': { setupRequired: false },
      '/api/v1/auth/me': role
        ? {
            id: 'u1',
            username: 'synthetic',
            displayName: 'Test',
            role,
            household: { id: 'h1', name: 'Testfamilie' },
            mustChangePassword: false,
            lastLoginAt: null,
          }
        : { detail: 'Anmeldung erforderlich.' },
      '/api/v1/camera/status': {
        active: false,
        expiresAt: null,
        streamUrl: '/camera-stream/api/stream.mp4?src=tapo',
        revision: 0,
      },
      '/api/v1/dashboard': createFallbackDashboard(),
      '/api/v1/tasks': { tasks: [] },
      '/api/v1/photos/gallery': { photos: [] },
      '/api/v1/meal-plan': { plan: current },
      '/api/v1/bring/items': {
        items: [],
        configured: false,
        available: false,
        stale: false,
        status: 'disabled',
        revision: 0,
        last_successful_sync_at: null,
      },
    }
    const status = !role && url.endsWith('/auth/me') ? 401 : 200
    return Promise.resolve(new Response(JSON.stringify(payload[url] ?? {}), { status }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}
afterEach(() => vi.unstubAllGlobals())

test.each(['member', 'admin'] as const)('settings entry is available for %s', async (role) => {
  mock(role)
  renderApp('/settings')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('link', { name: /Essensplan hochladen und verwalten/ }))
  expect(await screen.findByRole('heading', { name: 'Essensplan', level: 1 })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Essensplan hochladen' })).toBeEnabled()
})

test('the sidebar links to the protected meal-plan settings page', async () => {
  mock()
  renderApp('/')
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Einstellungen öffnen' }))
  await user.click(screen.getByRole('link', { name: 'Essensplan' }))
  expect(await screen.findByRole('heading', { name: 'Essensplan', level: 1 })).toBeInTheDocument()
})

test('unauthenticated direct access redirects to login', async () => {
  mock(null)
  renderApp('/settings/meal-plan')
  expect(await screen.findByRole('button', { name: 'Anmelden' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Essensplan' })).not.toBeInTheDocument()
})

test('dashboard has only preview and enlargement, with no file picker or mutations', async () => {
  const fetchMock = mock('member', plan)
  const { container } = render(<MealPlanCard />)
  await screen.findByAltText('Aktueller Essensplan')
  expect(container.querySelector('input[type="file"]')).toBeNull()
  expect(
    screen.queryByRole('button', { name: /hochladen|ersetzen|löschen/i }),
  ).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Essensplan vergrößern' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(
    fetchMock.mock.calls.every((call) => !call[1]?.method || call[1].method === 'GET'),
  ).toBeTruthy()
})

test('canceling the file picker never starts an upload', async () => {
  const fetchMock = mock()
  render(
    <MemoryRouter>
      <MealPlanPage />
    </MemoryRouter>,
  )
  await screen.findByText('Noch kein Essensplan hinterlegt')
  const calls = fetchMock.mock.calls.length
  fireEvent.change(screen.getByLabelText('Essensplan auswählen'), { target: { files: [] } })
  expect(fetchMock.mock.calls).toHaveLength(calls)
})
