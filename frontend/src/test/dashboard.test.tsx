import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { App } from '../app/App'
import { createFallbackDashboard } from '../services/fallback'

function renderApp() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(createFallbackDashboard()) }),
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
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  renderApp()
  expect(await screen.findByText(/Offline · zuletzt bekannte Ansicht/)).toBeInTheDocument()
  expect(screen.getByText('Familienkalender')).toBeInTheDocument()
  expect(screen.getByText('Projektbesprechung')).toBeInTheDocument()
})
