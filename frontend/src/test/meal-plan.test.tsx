import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MealPlanPage } from '../pages/MealPlanPage'

import { MealPlanCard } from '../features/meal-plan/MealPlanCard'
import { clearCsrfToken } from '../services/api'

const plan = {
  id: 'p1',
  originalName: 'plan.png',
  width: 1200,
  height: 800,
  uploadedAt: '2026-11-16T12:00:00Z',
  imageUrl: '/image/p1',
  thumbnailUrl: '/thumb/p1',
}

beforeEach(() => clearCsrfToken())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

test('uploads, enlarges and deletes a shared plan through protected API calls', async () => {
  let current: typeof plan | null = null
  const requests = vi.fn((url: string, options?: RequestInit) => {
    if (url.endsWith('/auth/csrf'))
      return Promise.resolve(new Response(JSON.stringify({ csrfToken: 'token' })))
    if (options?.method === 'PUT') current = plan
    if (options?.method === 'DELETE') {
      current = null
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    return Promise.resolve(new Response(JSON.stringify({ plan: current })))
  })
  vi.stubGlobal('fetch', requests)
  render(
    <MemoryRouter>
      <MealPlanPage />
    </MemoryRouter>,
  )
  expect(await screen.findByText('Noch kein Essensplan hinterlegt')).toBeInTheDocument()
  const user = userEvent.setup()
  await user.upload(
    screen.getByLabelText('Essensplan auswählen'),
    new File(['image'], 'plan.png', { type: 'image/png' }),
  )
  expect(await screen.findByAltText('Aktueller Essensplan')).toHaveAttribute('src', '/image/p1')
  const upload = requests.mock.calls.find(([, options]) => options?.method === 'PUT')
  expect(new Headers(upload?.[1]?.headers).get('X-CSRF-Token')).toBe('token')
  expect(upload?.[1]?.body).toBeInstanceOf(FormData)
  await user.click(screen.getByRole('button', { name: 'Essensplan vergrößern' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Vergrößern' }))
  expect(screen.getByText('150 %')).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Essensplan vergrößern' })).toHaveFocus()
  await user.click(screen.getByRole('button', { name: 'Löschen' }))
  await user.click(screen.getByRole('button', { name: 'Löschen bestätigen' }))
  expect(await screen.findByText('Noch kein Essensplan hinterlegt')).toBeInTheDocument()
})

test('keeps current image on failed replacement and refreshes visible devices', async () => {
  let id = 'p1'
  const requests = vi.fn((_url: string, options?: RequestInit) => {
    if (options?.method === 'PUT')
      return Promise.resolve(
        new Response(JSON.stringify({ detail: 'Bild ist zu groß' }), { status: 413 }),
      )
    if (_url.endsWith('/auth/csrf'))
      return Promise.resolve(new Response(JSON.stringify({ csrfToken: 'token' })))
    return Promise.resolve(
      new Response(
        JSON.stringify({
          plan: { ...plan, id, imageUrl: `/image/${id}`, thumbnailUrl: `/thumb/${id}` },
        }),
      ),
    )
  })
  vi.stubGlobal('fetch', requests)
  render(
    <MemoryRouter>
      <MealPlanPage />
    </MemoryRouter>,
  )
  await screen.findByAltText('Aktueller Essensplan')
  fireEvent.change(screen.getByLabelText('Essensplan auswählen'), {
    target: { files: [new File(['x'], 'bad.png', { type: 'image/png' })] },
  })
  expect(await screen.findByText('Bild ist zu groß')).toBeInTheDocument()
  expect(screen.getByAltText('Aktueller Essensplan')).toHaveAttribute('src', '/image/p1')
  id = 'p2'
  fireEvent(window, new Event('focus'))
  await waitFor(() =>
    expect(screen.getByAltText('Aktueller Essensplan')).toHaveAttribute('src', '/image/p2'),
  )
})

test('polls every eight seconds, pauses when hidden and retains last-known image offline', async () => {
  vi.useFakeTimers()
  let fail = false
  const requests = vi.fn(() =>
    fail
      ? Promise.reject(new Error('offline'))
      : Promise.resolve(new Response(JSON.stringify({ plan }))),
  )
  vi.stubGlobal('fetch', requests)
  render(<MealPlanCard />)
  await act(async () => {})
  expect(requests).toHaveBeenCalledTimes(1)
  fail = true
  await act(async () => {
    await vi.advanceTimersByTimeAsync(8000)
  })
  expect(screen.getByText(/Verbindung unterbrochen/)).toBeInTheDocument()
  expect(screen.getByAltText('Aktueller Essensplan')).toHaveAttribute('src', '/image/p1')
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(16000)
  })
  expect(requests).toHaveBeenCalledTimes(2)
  visibility.mockRestore()
})
