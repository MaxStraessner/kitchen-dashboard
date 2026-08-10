import { Quote } from 'lucide-react'

import { Card } from '../../components/Card'
import { useMinuteClock } from '../../hooks/useMinuteClock'
import { berlinCalendarDate } from './birthday'
import { BirthdayCard } from './BirthdayCard'
import { GuestWifiCard } from './GuestWifiCard'

const birthdays = [
  {
    name: 'Hannah',
    birthDate: '2017-06-29',
    accent: 'rose' as const,
  },
  {
    name: 'Gabriel',
    birthDate: '2026-02-26',
    accent: 'blue' as const,
    omitZeroYears: true,
  },
]

export function InfoCards() {
  const currentDate = berlinCalendarDate(useMinuteClock())

  return (
    <div className="info-grid">
      {birthdays.map((birthday) => (
        <BirthdayCard currentDate={currentDate} key={birthday.name} {...birthday} />
      ))}
      <GuestWifiCard />
      <Card className="info-card info-card--violet">
        <div className="info-icon">
          <Quote aria-hidden="true" />
        </div>
        <div>
          <span>Spruch des Tages</span>
          <strong>Zusammen ist unser Lieblingsort.</strong>
          <small>Familienmoment</small>
        </div>
      </Card>
    </div>
  )
}
