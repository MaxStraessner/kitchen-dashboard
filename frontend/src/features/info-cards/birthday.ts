export interface CalendarDate {
  year: number
  month: number
  day: number
}

export interface CalendarAge {
  years: number
  months: number
  days: number
}

export interface BirthdayDetails extends CalendarAge {
  nextBirthday: CalendarDate
  daysUntilBirthday: number
  isBirthdayToday: boolean
}

const millisecondsPerDay = 86_400_000

const berlinDateFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: 'Europe/Berlin',
})

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function compareDates(left: CalendarDate, right: CalendarDate): number {
  return toDayNumber(left) - toDayNumber(right)
}

function toDayNumber(date: CalendarDate): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / millisecondsPerDay)
}

function differenceInDays(start: CalendarDate, end: CalendarDate): number {
  return toDayNumber(end) - toDayNumber(start)
}

function dateInYear(date: CalendarDate, year: number): CalendarDate {
  return {
    year,
    month: date.month,
    day: Math.min(date.day, daysInMonth(year, date.month)),
  }
}

function addMonthsConstrained(date: CalendarDate, months: number): CalendarDate {
  const monthIndex = date.month - 1 + months
  const year = date.year + Math.floor(monthIndex / 12)
  const month = (((monthIndex % 12) + 12) % 12) + 1
  return {
    year,
    month,
    day: Math.min(date.day, daysInMonth(year, month)),
  }
}

export function parseIsoDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Ungültiges ISO-Datum: ${value}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Ungültiges Kalenderdatum: ${value}`)
  }
  return { year, month, day }
}

export function toIsoDate(date: CalendarDate): string {
  return `${String(date.year)}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

export function berlinCalendarDate(instant: Date): CalendarDate {
  const parts = berlinDateFormatter.formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type)
    if (!part) throw new Error(`Fehlender Datumsteil: ${type}`)
    return Number(part.value)
  }
  return { year: value('year'), month: value('month'), day: value('day') }
}

export function calculateBirthday(
  birthDateValue: string,
  currentDate: CalendarDate,
): BirthdayDetails {
  const birthDate = parseIsoDate(birthDateValue)
  if (compareDates(currentDate, birthDate) < 0) {
    throw new Error('Das aktuelle Datum liegt vor dem Geburtsdatum.')
  }

  let years = currentDate.year - birthDate.year
  let lastBirthday = dateInYear(birthDate, birthDate.year + years)
  if (compareDates(currentDate, lastBirthday) < 0) {
    years -= 1
    lastBirthday = dateInYear(birthDate, birthDate.year + years)
  }

  let months = 0
  for (let candidateMonth = 1; candidateMonth < 12; candidateMonth += 1) {
    if (compareDates(addMonthsConstrained(lastBirthday, candidateMonth), currentDate) > 0) break
    months = candidateMonth
  }
  const ageAnchor = addMonthsConstrained(lastBirthday, months)
  const days = differenceInDays(ageAnchor, currentDate)

  const birthdayThisYear = dateInYear(birthDate, currentDate.year)
  const isBirthdayToday = compareDates(currentDate, birthdayThisYear) === 0
  const nextBirthday =
    compareDates(currentDate, birthdayThisYear) <= 0
      ? birthdayThisYear
      : dateInYear(birthDate, currentDate.year + 1)

  return {
    years,
    months,
    days,
    nextBirthday,
    daysUntilBirthday: differenceInDays(currentDate, nextBirthday),
    isBirthdayToday,
  }
}

function unit(value: number, singular: string, plural: string): string {
  return `${String(value)} ${value === 1 ? singular : plural}`
}

export function formatAge(age: CalendarAge, omitZeroYears = false): string {
  const parts = [
    ...(!omitZeroYears || age.years > 0 ? [unit(age.years, 'Jahr', 'Jahre')] : []),
    unit(age.months, 'Monat', 'Monate'),
    unit(age.days, 'Tag', 'Tage'),
  ]
  return parts.join(' · ')
}

export function formatDayCount(days: number): string {
  return unit(days, 'Tag', 'Tage')
}
