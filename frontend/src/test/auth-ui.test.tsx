import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { App } from '../app/App'
import { AuthProvider } from '../auth/AuthProvider'
import type { CurrentUser } from '../auth/types'
import { createFallbackDashboard } from '../services/fallback'

const admin: CurrentUser = {
  id: 'u1',
  username: 'max',
  displayName: 'Max',
  role: 'admin',
  household: { id: 'h1', name: 'Familie' },
  mustChangePassword: false,
  lastLoginAt: null,
}
const member: CurrentUser = {
  ...admin,
  id: 'u2',
  username: 'jessica',
  displayName: 'Jessica',
  role: 'member',
}

function response(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(payload) }
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function mockState(user: CurrentUser | null, setupRequired = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => {
      const url = requestUrl(input)
      if (url.endsWith('/setup/status')) return Promise.resolve(response({ setupRequired }))
      if (url.endsWith('/auth/me'))
        return Promise.resolve(
          user ? response(user) : response({ detail: 'Anmeldung erforderlich.' }, 401),
        )
      if (url.endsWith('/dashboard')) return Promise.resolve(response(createFallbackDashboard()))
      if (url.endsWith('/admin/users')) return Promise.resolve(response([]))
      return Promise.resolve(response({}))
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

test('setup page renders, validates and initializes the first administrator', async () => {
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = requestUrl(input)
    if (url.endsWith('/setup/status')) return Promise.resolve(response({ setupRequired: true }))
    if (url.endsWith('/setup/initialize')) return Promise.resolve(response(admin))
    if (url.endsWith('/dashboard')) return Promise.resolve(response(createFallbackDashboard()))
    return Promise.resolve(response({}))
  })
  vi.stubGlobal('fetch', fetchMock)
  const interaction = userEvent.setup()
  renderAt('/setup')
  expect(await screen.findByRole('heading', { name: 'Willkommen' })).toBeInTheDocument()
  await interaction.type(screen.getByLabelText('Anzeigename'), 'Max')
  await interaction.type(screen.getByLabelText('Benutzername'), 'max')
  await interaction.type(
    screen.getByLabelText('Passwort', { exact: true }),
    'lange sichere Passphrase',
  )
  await interaction.type(screen.getByLabelText('Passwort bestätigen'), 'anderes langes Passwort')
  await interaction.click(screen.getByRole('button', { name: 'Familie einrichten' }))
  expect(await screen.findByText('Die Passwörter stimmen nicht überein.')).toBeInTheDocument()
  await interaction.clear(screen.getByLabelText('Passwort bestätigen'))
  await interaction.type(screen.getByLabelText('Passwort bestätigen'), 'lange sichere Passphrase')
  await interaction.click(screen.getByRole('button', { name: 'Familie einrichten' }))
  expect(await screen.findByText('Familienkalender')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/setup/initialize'),
    expect.objectContaining({ method: 'POST' }),
  )
})

test('login uses hidden password, remember option and generic error', async () => {
  mockState(null)
  const original = vi.mocked(fetch)
  original.mockImplementation((input: string | URL | Request) => {
    const url = requestUrl(input)
    if (url.endsWith('/setup/status'))
      return Promise.resolve(response({ setupRequired: false })) as never
    if (url.endsWith('/auth/me')) return Promise.resolve(response({}, 401)) as never
    if (url.endsWith('/auth/login'))
      return Promise.resolve(response({ detail: 'internal' }, 401)) as never
    return Promise.resolve(response({})) as never
  })
  const interaction = userEvent.setup()
  renderAt('/login')
  const password = await screen.findByLabelText('Passwort')
  expect(password).toHaveAttribute('type', 'password')
  expect(screen.getByLabelText('Angemeldet bleiben')).toBeInTheDocument()
  await interaction.type(screen.getByLabelText('Benutzername'), 'max')
  await interaction.type(password, 'falsches Passwort')
  await interaction.click(screen.getByRole('button', { name: 'Anmelden' }))
  expect(
    await screen.findByText('Benutzername oder Passwort ist nicht korrekt.'),
  ).toBeInTheDocument()
})

test('protected routes redirect and role-specific navigation is enforced', async () => {
  mockState(null)
  const first = renderAt('/')
  expect(await screen.findByRole('heading', { name: 'Kitchen Dashboard' })).toBeInTheDocument()
  first.unmount()

  mockState(member)
  const second = renderAt('/settings')
  expect(await screen.findByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument()
  expect(screen.queryByText('Benutzerverwaltung')).not.toBeInTheDocument()
  second.unmount()

  mockState(admin)
  renderAt('/settings')
  expect(await screen.findByText('Benutzerverwaltung')).toBeInTheDocument()
})

test('dashboard settings menu opens and account route renders', async () => {
  mockState(admin)
  const interaction = userEvent.setup()
  const dashboard = renderAt('/')
  const trigger = await screen.findByLabelText('Einstellungen öffnen')
  await interaction.click(trigger)
  expect(
    within(screen.getByRole('navigation', { name: 'Einstellungsnavigation' })).getByText(
      'Mein Konto',
    ),
  ).toBeInTheDocument()
  expect(
    within(screen.getByRole('navigation', { name: 'Einstellungsnavigation' })).getByText(
      'Benutzerverwaltung',
    ),
  ).toBeInTheDocument()
  dashboard.unmount()

  mockState(admin)
  renderAt('/account')
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Max' })).toBeInTheDocument())
  expect(screen.getByRole('heading', { name: 'Passwort ändern' })).toBeInTheDocument()
})

test('temporary password opens mandatory account page', async () => {
  mockState({ ...member, mustChangePassword: true })
  renderAt('/')
  expect(
    await screen.findByText('Bitte ändere zuerst dein vorläufiges Passwort.'),
  ).toBeInTheDocument()
})
