import { calculateAgendaLayout } from '../features/calendar/previewLayout'

test('keeps roomy type when all events fit and reduces it only as needed', () => {
  expect(calculateAgendaLayout(4, 520, 60).density).toBe('normal')
  const five = calculateAgendaLayout(5, 520, 60)
  expect(five.fontSize).toBe(14)
  expect(five.capacity).toBe(6)
  expect(calculateAgendaLayout(8, 700, 100).density).toBe('compact')
  expect(calculateAgendaLayout(12, 920, 106).density).toBe('normal')
})

test('retains the largest possible dense preview with a hard 14 pixel floor', () => {
  for (const total of [0, 4, 5, 8, 12, 50]) {
    const result = calculateAgendaLayout(total, 520, 60)
    expect(result.fontSize).toBeGreaterThanOrEqual(14)
    if (total <= 6) expect(result.capacity).toBeGreaterThanOrEqual(total)
    else expect(result.capacity).toBe(6)
  }
  expect(calculateAgendaLayout(50, 920, 106).capacity).toBe(20)
})
