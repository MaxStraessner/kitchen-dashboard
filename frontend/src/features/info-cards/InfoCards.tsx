import { CakeSlice, Droplets, Quote, ThermometerSun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Card } from '../../components/Card'

interface InfoItem {
  label: string
  value: string
  detail: string
  icon: LucideIcon
  accent: string
}

const items: InfoItem[] = [
  {
    label: 'Gedanke des Tages',
    value: 'Zusammen ist unser Lieblingsort.',
    detail: 'Familienmoment',
    icon: Quote,
    accent: 'violet',
  },
  {
    label: 'Wasser',
    value: '5 von 8 Gläsern',
    detail: 'Noch 3 bis zum Tagesziel',
    icon: Droplets,
    accent: 'blue',
  },
  {
    label: 'Nächster Geburtstag',
    value: 'Hannah · in 14 Tagen',
    detail: 'Geschenkidee notieren',
    icon: CakeSlice,
    accent: 'rose',
  },
  {
    label: 'Raumtemperatur',
    value: '21,4 °C',
    detail: 'Küche · angenehm',
    icon: ThermometerSun,
    accent: 'amber',
  },
]

export function InfoCards() {
  return (
    <div className="info-grid">
      {items.map(({ label, value, detail, icon: Icon, accent }) => (
        <Card className={`info-card info-card--${accent}`} key={label}>
          <div className="info-icon">
            <Icon aria-hidden="true" />
          </div>
          <div>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        </Card>
      ))}
    </div>
  )
}
