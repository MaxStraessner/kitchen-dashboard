import type { CalendarEvent } from '../../types/api'

export function eventDate(event: CalendarEvent): Date {
  if (!event.allDay) return new Date(event.start)
  const [year, month, day] = event.start.slice(0, 10).split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

export function dateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(year)}-${month}-${day}`
}

export function isSameDay(left: Date, right: Date): boolean {
  return dateKey(left) === dateKey(right)
}
