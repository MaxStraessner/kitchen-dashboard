export interface ProviderMeta {
  updated_at: string
  stale: boolean
  demo_mode: boolean
}

export interface WeatherData {
  location: string
  temperature: number
  condition: string
  weather_code: number
  icon: string
  is_day: boolean
  wind_speed: number
  precipitation_probability: number
  high: number
  low: number
  observed_at: string
  forecast: WeatherForecastDay[]
}

export interface WeatherForecastDay {
  date: string
  condition: string
  weather_code: number
  icon: string
  precipitation_probability: number
  high: number
  low: number
}

export interface WeatherResponse {
  data: WeatherData
  meta: ProviderMeta
}

export interface CalendarEvent {
  id: string
  calendarId: string
  calendarName: string
  title: string
  start: string
  end: string
  allDay: boolean
  location: string | null
  description: string | null
  color: string
  source: string
  lastModified: string | null
  cancelled: boolean
  stale: boolean
}

export interface CalendarSource {
  id: string
  name: string
  color: string
  category: string | null
  stale: boolean
  last_success_at: string | null
}

export interface CalendarResponse {
  events: CalendarEvent[]
  sources: CalendarSource[]
  hidden_event_count: number
  meta: ProviderMeta
}

export interface DashboardResponse {
  weather: WeatherResponse
  calendar: CalendarResponse
  meta: ProviderMeta
}

export interface Task {
  id: string
  title: string
  completed: boolean
  createdAt: string
  updatedAt: string
  completedAt: string | null
  sortOrder: number
}

export interface TaskListResponse {
  tasks: Task[]
}
