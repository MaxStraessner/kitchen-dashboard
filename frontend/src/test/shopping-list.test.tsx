import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ShoppingPreviewCard } from '../features/shopping-preview/ShoppingPreviewCard'
import { clearCsrfToken } from '../services/api'
import type { BringItemsResponse } from '../types/api'

const initial: BringItemsResponse = {
  items: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      name: 'Haferdrink',
      specification: '2 Packungen',
      position: 0,
    },
    {
      id: '00000000-0000-4000-8000-000000000102',
      name: 'Haferdrink',
      specification: 'ungesüßt',
      position: 1,
    },
  ],
  configured: true,
  available: true,
  stale: false,
  status: 'ok',
  last_successful_sync_at: '2026-07-16T08:00:00Z',
  revision: 1,
}

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected test value is missing')
  return value
}

class EventSourceMock {
  static instances: EventSourceMock[] = []
  onerror: (() => void) | null = null
  listeners = new Map<string, (event: MessageEvent<string>) => void>()

  constructor(readonly url: string) {
    EventSourceMock.instances.push(this)
  }

  addEventListener(name: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.set(name, listener as (event: MessageEvent<string>) => void)
  }

  emit(payload: BringItemsResponse) {
    this.listeners.get('items')?.({ data: JSON.stringify(payload) } as MessageEvent<string>)
  }

  close() {}
}

beforeEach(() => {
  EventSourceMock.instances = []
  vi.stubGlobal('EventSource', EventSourceMock)
})

afterEach(() => {
  clearCsrfToken()
  vi.unstubAllGlobals()
})

test('renders duplicate open items, specifications and empty state from real data shape', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response(initial))),
  )
  const view = render(<ShoppingPreviewCard />)
  expect(await screen.findAllByText('Haferdrink')).toHaveLength(2)
  expect(screen.getByText('2 Packungen')).toBeInTheDocument()
  expect(screen.getByText('ungesüßt')).toBeInTheDocument()
  expect(screen.getByText('2 offen')).toBeInTheDocument()

  act(() => present(EventSourceMock.instances[0]).emit({ ...initial, items: [], revision: 2 }))
  expect(await screen.findByText('Alles erledigt')).toBeInTheDocument()
  expect(screen.getByText('Die Einkaufsliste ist leer.')).toBeInTheDocument()
  view.unmount()
})

test('adds an item optimistically and prevents repeated submit', async () => {
  let resolveAdd: ((value: Response) => void) | undefined
  const fetchMock = vi.fn((input: string | URL | Request, options?: RequestInit) => {
    const url = requestUrl(input)
    if (url.endsWith('/bring/items') && options?.method === 'POST') {
      return new Promise<Response>((resolve) => {
        resolveAdd = resolve
      })
    }
    if (url.endsWith('/auth/csrf')) return Promise.resolve(response({ csrfToken: 'mock-csrf' }))
    return Promise.resolve(response(initial))
  })
  vi.stubGlobal('fetch', fetchMock)
  const user = userEvent.setup()
  render(<ShoppingPreviewCard />)
  await screen.findByText('2 offen')
  await user.click(screen.getByRole('button', { name: 'Artikel hinzufügen' }))
  await user.type(screen.getByLabelText('Artikelname'), 'Reis')
  await user.type(screen.getByLabelText(/Menge oder Zusatzangabe/), '1 kg')
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Artikel hinzufügen' }),
  )
  expect(screen.getByText('Reis')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Wird hinzugefügt …' })).toBeDisabled()
  resolveAdd?.(
    response(
      {
        id: '00000000-0000-4000-8000-000000000103',
        name: 'Reis',
        specification: '1 kg',
        position: 2,
      },
      201,
    ),
  )
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1)
})

test('completes the selected UUID and rolls back only that item on failure', async () => {
  const fetchMock = vi.fn((input: string | URL | Request, options?: RequestInit) => {
    const url = requestUrl(input)
    if (url.endsWith('/auth/csrf')) return Promise.resolve(response({ csrfToken: 'mock-csrf' }))
    if (url.includes('/complete') && options?.method === 'POST') {
      return Promise.resolve(response({ detail: 'Bring ist vorübergehend nicht erreichbar.' }, 503))
    }
    return Promise.resolve(response(initial))
  })
  vi.stubGlobal('fetch', fetchMock)
  const user = userEvent.setup()
  render(<ShoppingPreviewCard />)
  const buttons = await screen.findAllByRole('button', {
    name: 'Haferdrink als gekauft markieren',
  })
  await user.click(present(buttons[1]))
  await waitFor(() =>
    expect(screen.getByText('Bring ist vorübergehend nicht erreichbar.')).toBeInTheDocument(),
  )
  expect(screen.getAllByText('Haferdrink')).toHaveLength(2)
  const completeCall = fetchMock.mock.calls.find((call) =>
    requestUrl(call[0]).includes('/complete'),
  )
  expect(completeCall && requestUrl(completeCall[0])).toContain(
    '00000000-0000-4000-8000-000000000102',
  )
})

test('applies a live update to multiple open card instances', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response(initial))),
  )
  render(
    <>
      <ShoppingPreviewCard />
      <ShoppingPreviewCard />
    </>,
  )
  expect(await screen.findAllByText('2 offen')).toHaveLength(2)
  const update = {
    ...initial,
    items: [{ ...present(initial.items[0]), name: 'Brot' }],
    revision: 2,
  }
  act(() => {
    present(EventSourceMock.instances[0]).emit(update)
    present(EventSourceMock.instances[1]).emit(update)
  })
  expect(await screen.findAllByText('Brot')).toHaveLength(2)
  expect(screen.getAllByText('1 offen')).toHaveLength(2)
})

test('reconnects the live channel with controlled delay', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response(initial))),
  )
  render(<ShoppingPreviewCard />)
  await screen.findByText('2 offen')
  act(() => present(EventSourceMock.instances[0]).onerror?.())
  expect(screen.getByText('Live-Verbindung wird wiederhergestellt …')).toBeInTheDocument()
  await waitFor(() => expect(EventSourceMock.instances).toHaveLength(2), { timeout: 1_500 })
})
