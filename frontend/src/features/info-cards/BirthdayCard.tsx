import { CakeSlice } from 'lucide-react'

import { Card } from '../../components/Card'
import { calculateBirthday, formatAge, formatDayCount, type CalendarDate } from './birthday'

interface BirthdayCardProps {
  name: string
  birthDate: string
  accent: 'blue' | 'rose'
  currentDate: CalendarDate
  omitZeroYears?: boolean
}

export function BirthdayCard({
  name,
  birthDate,
  accent,
  currentDate,
  omitZeroYears = false,
}: BirthdayCardProps) {
  const birthday = calculateBirthday(birthDate, currentDate)
  const age = formatAge(birthday, omitZeroYears)

  return (
    <Card
      className={`info-card birthday-card info-card--${accent}`}
      aria-label={`Geburtstags-Countdown für ${name}`}
    >
      <div className="info-icon">
        <CakeSlice aria-hidden="true" />
      </div>
      <div>
        <span>{name}</span>
        {birthday.isBirthdayToday ? (
          <strong className="birthday-today">🎂 Heute Geburtstag!</strong>
        ) : (
          <>
            <strong
              className="birthday-countdown"
              aria-label={formatDayCount(birthday.daysUntilBirthday)}
            >
              <b>{birthday.daysUntilBirthday}</b>
              <span>{formatDayCount(birthday.daysUntilBirthday).replace(/^\d+\s/, '')}</span>
            </strong>
            <small className="birthday-context">bis zum Geburtstag</small>
          </>
        )}
        <small className="birthday-age">{age}</small>
      </div>
    </Card>
  )
}
