import type { CalendarEvent } from '../../types/api'

export const dashboardTimeZone = 'Europe/Berlin'

const berlinDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: dashboardTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function eventDate(event: CalendarEvent): Date {
  if (!event.allDay) return new Date(event.start)
  const [year, month, day] = event.start.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12))
}

export function dateKey(date: Date): string {
  const parts = berlinDateParts.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function isSameDay(left: Date, right: Date): boolean {
  return dateKey(left) === dateKey(right)
}

export function eventDateKeys(event: CalendarEvent): string[] {
  const startKey = event.allDay ? event.start.slice(0, 10) : dateKey(new Date(event.start))
  const endKey = event.allDay
    ? event.end.slice(0, 10)
    : dateKey(
        new Date(Math.max(new Date(event.start).getTime(), new Date(event.end).getTime() - 1)),
      )
  const cursor = new Date(`${startKey}T12:00:00Z`)
  const end = new Date(`${endKey}T12:00:00Z`)
  const keys: string[] = []

  while (cursor < end || (!event.allDay && cursor.getTime() === end.getTime())) {
    keys.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return keys.length > 0 ? keys : [startKey]
}
