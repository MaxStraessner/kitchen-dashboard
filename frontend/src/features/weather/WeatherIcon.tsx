import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  CloudSunRain,
  Moon,
  Snowflake,
  Sun,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const icons: Record<string, LucideIcon> = {
  cloud: Cloud,
  'cloud-drizzle': CloudDrizzle,
  'cloud-fog': CloudFog,
  'cloud-hail': CloudHail,
  'cloud-lightning': CloudLightning,
  'cloud-moon': CloudMoon,
  'cloud-rain': CloudRain,
  'cloud-rain-wind': CloudRainWind,
  'cloud-snow': CloudSnow,
  'cloud-sun': CloudSun,
  'cloud-sun-rain': CloudSunRain,
  moon: Moon,
  snowflake: Snowflake,
  sun: Sun,
}

export function WeatherIcon({ name }: { name: string }) {
  const Icon = icons[name] ?? Cloud
  return <Icon aria-hidden="true" />
}
