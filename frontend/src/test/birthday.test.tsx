import { act, render, screen, within } from '@testing-library/react'

import { InfoCards } from '../features/info-cards/InfoCards'
import {
  berlinCalendarDate,
  calculateBirthday,
  formatAge,
  parseIsoDate,
  toIsoDate,
} from '../features/info-cards/birthday'

describe('birthday calendar calculations', () => {
  test('matches the Hannah and Gabriel reference values for 10 August 2026', () => {
    const currentDate = parseIsoDate('2026-08-10')

    expect(calculateBirthday('2017-06-29', currentDate)).toEqual({
      years: 9,
      months: 1,
      days: 12,
      nextBirthday: parseIsoDate('2027-06-29'),
      daysUntilBirthday: 323,
      isBirthdayToday: false,
    })
    expect(calculateBirthday('2026-02-26', currentDate)).toEqual({
      years: 0,
      months: 5,
      days: 15,
      nextBirthday: parseIsoDate('2027-02-26'),
      daysUntilBirthday: 200,
      isBirthdayToday: false,
    })
  })

  test('handles the birthday itself and the days immediately around it', () => {
    expect(calculateBirthday('2017-06-29', parseIsoDate('2026-06-28')).daysUntilBirthday).toBe(1)

    const birthday = calculateBirthday('2017-06-29', parseIsoDate('2026-06-29'))
    expect(birthday).toMatchObject({
      years: 9,
      months: 0,
      days: 0,
      daysUntilBirthday: 0,
      isBirthdayToday: true,
    })

    const followingDay = calculateBirthday('2017-06-29', parseIsoDate('2026-06-30'))
    expect(toIsoDate(followingDay.nextBirthday)).toBe('2027-06-29')
    expect(followingDay.daysUntilBirthday).toBe(364)
  })

  test('uses constrained calendar arithmetic at month ends', () => {
    expect(calculateBirthday('2026-01-31', parseIsoDate('2026-02-28'))).toMatchObject({
      years: 0,
      months: 1,
      days: 0,
    })
    expect(calculateBirthday('2026-01-31', parseIsoDate('2026-03-31'))).toMatchObject({
      years: 0,
      months: 2,
      days: 0,
    })
  })

  test('treats 29 February as 28 February in non-leap years', () => {
    expect(calculateBirthday('2024-02-29', parseIsoDate('2025-02-27'))).toMatchObject({
      daysUntilBirthday: 1,
      isBirthdayToday: false,
    })
    expect(calculateBirthday('2024-02-29', parseIsoDate('2025-02-28'))).toMatchObject({
      years: 1,
      months: 0,
      days: 0,
      isBirthdayToday: true,
    })
    expect(calculateBirthday('2024-02-29', parseIsoDate('2028-02-28')).daysUntilBirthday).toBe(1)
  })

  test('formats singular, plural and optionally omits zero years', () => {
    expect(formatAge({ years: 1, months: 1, days: 1 })).toBe('1 Jahr · 1 Monat · 1 Tag')
    expect(formatAge({ years: 2, months: 2, days: 2 })).toBe('2 Jahre · 2 Monate · 2 Tage')
    expect(formatAge({ years: 0, months: 5, days: 15 }, true)).toBe('5 Monate · 15 Tage')
  })

  test('derives the calendar day in Europe/Berlin', () => {
    expect(berlinCalendarDate(new Date('2026-08-09T22:30:00.000Z'))).toEqual(
      parseIsoDate('2026-08-10'),
    )
  })
})

describe('birthday cards', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('renders both people with the guest wifi card and daily quote', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T10:00:00.000Z'))
    render(<InfoCards />)

    const hannah = within(screen.getByLabelText('Geburtstags-Countdown für Hannah'))
    expect(hannah.getByLabelText('323 Tage')).toBeInTheDocument()
    expect(hannah.getByText('9 Jahre · 1 Monat · 12 Tage')).toBeInTheDocument()
    const gabriel = within(screen.getByLabelText('Geburtstags-Countdown für Gabriel'))
    expect(gabriel.getByLabelText('200 Tage')).toBeInTheDocument()
    expect(gabriel.getByText('5 Monate · 15 Tage')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'WLAN Gastzugang' })).toBeInTheDocument()
    expect(screen.getByAltText('QR-Code für den WLAN-Gastzugang')).toHaveAttribute(
      'src',
      '/assets/wlan-gastzugang.png',
    )
    expect(screen.getByText('Spruch des Tages')).toBeInTheDocument()
    expect(screen.getByText('Zusammen ist unser Lieblingsort.')).toBeInTheDocument()
    expect(screen.queryByText('Wasser')).not.toBeInTheDocument()
    expect(screen.queryByText('Raumtemperatur')).not.toBeInTheDocument()
  })

  test('switches to the birthday state after Berlin midnight without a reload', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-28T21:59:59.900Z'))
    render(<InfoCards />)
    const hannah = screen.getByLabelText('Geburtstags-Countdown für Hannah')
    expect(within(hannah).getByLabelText('1 Tag')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(hannah).toHaveTextContent('🎂 Heute Geburtstag!')
    expect(hannah).toHaveTextContent('9 Jahre · 0 Monate · 0 Tage')
  })
})
