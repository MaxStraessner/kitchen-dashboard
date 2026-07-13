import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { App } from '../app/App'
import { AuthProvider } from '../auth/AuthProvider'
import { createFallbackDashboard } from '../services/fallback'

function renderApp() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => {
      const url = requestUrl(input)
      const payload = url.endsWith('/setup/status')
        ? { setupRequired: false }
        : url.endsWith('/auth/me')
          ? {
              id: '1',
              username: 'max',
              displayName: 'Max',
              role: 'admin',
              household: { id: 'h1', name: 'Familie' },
              mustChangePassword: false,
              lastLoginAt: null,
            }
          : createFallbackDashboard()
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) })
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

test('dashboard renders every primary feature', async () => {
  renderApp()
  await waitFor(() => expect(screen.getByText('Familienkalender')).toBeInTheDocument())
  expect(screen.getByLabelText('Uhrzeit und Datum')).toBeInTheDocument()
  expect(screen.getByLabelText(/Wetter für Unna/)).toBeInTheDocument()
  expect(screen.getByLabelText('Medienvorschau')).toBeInTheDocument()
  expect(screen.getByTestId('agenda')).toBeInTheDocument()
  expect(screen.getByLabelText('Monatskalender')).toBeInTheDocument()
  expect(screen.getByText('Aufgaben')).toBeInTheDocument()
  expect(screen.getByText('Einkaufsliste')).toBeInTheDocument()
})

test('demo mode is shown without mixing real sources', async () => {
  renderApp()
  expect(await screen.findByText(/Demokalender/)).toBeInTheDocument()
})

test('backend failure keeps the composed dashboard visible', async () => {
  const fallback = createFallbackDashboard()
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => {
      const url = requestUrl(input)
      if (url.endsWith('/setup/status'))
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ setupRequired: false }),
        })
      if (url.endsWith('/auth/me'))
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: '1',
              username: 'max',
              displayName: 'Max',
              role: 'admin',
              household: { id: 'h1', name: 'Familie' },
              mustChangePassword: false,
              lastLoginAt: null,
            }),
        })
      if (url.endsWith('/dashboard')) return Promise.reject(new Error('offline'))
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(fallback) })
    }),
  )
  renderApp()
  expect(await screen.findByText(/Offline · zuletzt bekannte Ansicht/)).toBeInTheDocument()
  expect(screen.getByText('Familienkalender')).toBeInTheDocument()
  expect(screen.getByText('Projektbesprechung')).toBeInTheDocument()
})
