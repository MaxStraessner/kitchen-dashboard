import { Droplets, MapPin, Wind } from 'lucide-react'

import { Card } from '../../components/Card'
import type { WeatherResponse } from '../../types/api'
import { WeatherIcon } from './WeatherIcon'

export function WeatherCard({ weather }: { weather: WeatherResponse }) {
  const { data, meta } = weather
  return (
    <Card className="weather-card" tone="warm" aria-label={`Wetter für ${data.location}`}>
      <div className="weather-head">
        <div>
          <div className="card-eyebrow">
            <MapPin aria-hidden="true" /> {data.location}
          </div>
          <p className="weather-condition">{data.condition}</p>
        </div>
        {meta.stale && <span className="status-pill">Zuletzt bekannt</span>}
      </div>
      <div className="weather-main">
        <div className="weather-symbol">
          <WeatherIcon name={data.icon} />
        </div>
        <strong className="weather-temperature">{Math.round(data.temperature)}°</strong>
      </div>
      <div className="weather-range">
        <span>H {Math.round(data.high)}°</span>
        <span>T {Math.round(data.low)}°</span>
      </div>
      <div className="weather-details">
        <span>
          <Wind aria-hidden="true" /> {Math.round(data.wind_speed)} km/h
        </span>
        <span>
          <Droplets aria-hidden="true" /> {data.precipitation_probability} %
        </span>
      </div>
    </Card>
  )
}
