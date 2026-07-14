import { expect, test, type Page } from '@playwright/test'

import { createFallbackDashboard } from '../src/services/fallback'

async function mockAuthentication(page: Page) {
  await page.route('**/api/v1/setup/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"setupRequired":false}',
    }),
  )
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'u1',
        username: 'max',
        displayName: 'Max',
        role: 'admin',
        household: { id: 'h1', name: 'Familie' },
        mustChangePassword: false,
        lastLoginAt: null,
      }),
    }),
  )
}

function expectNoOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  const separated =
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  expect(separated).toBeTruthy()
}

test('1440×2560 kiosk layout is complete, bounded, and non-overlapping', async ({ page }) => {
  await mockAuthentication(page)
  await page.setViewportSize({ width: 1440, height: 2560 })
  const dashboard = createFallbackDashboard(new Date('2026-07-13T12:00:00+02:00'))
  dashboard.weather.data = {
    ...dashboard.weather.data,
    temperature: 29,
    condition: 'Überwiegend klar',
    high: 31,
    low: 15,
    wind_speed: 10,
    precipitation_probability: 13,
  }
  dashboard.weather.meta.stale = false
  dashboard.meta.stale = false
  await page.route('**/api/v1/dashboard', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dashboard),
    }),
  )
  await page.goto('/')
  await expect(page.getByText('Familienkalender')).toBeVisible()
  await expect(page.getByText('Aufgaben')).toBeVisible()
  await expect(page.getByText('Einkaufsliste')).toBeVisible()
  await expect(page.getByText('Raumtemperatur')).toBeVisible()

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
  }))
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth)
  expect(dimensions.scrollHeight).toBe(dimensions.clientHeight)

  const top = await page.getByTestId('top-grid').boundingBox()
  const calendar = await page.locator('.calendar-card').boundingBox()
  const lower = await page.getByTestId('lower-grid').boundingBox()
  const info = await page.locator('.info-grid').boundingBox()
  expect(top).not.toBeNull()
  expect(calendar).not.toBeNull()
  expect(lower).not.toBeNull()
  expect(info).not.toBeNull()
  if (!top || !calendar || !lower || !info) throw new Error('A dashboard region is missing')
  expectNoOverlap(top, calendar)
  expectNoOverlap(calendar, lower)
  expectNoOverlap(lower, info)
  expect(calendar.height).toBeGreaterThan(top.height * 1.8)

  await page.screenshot({ path: 'tests/artifacts/dashboard-1440x2560.png', fullPage: true })
})

test('backend outage does not produce an empty page', async ({ page }) => {
  await mockAuthentication(page)
  await page.setViewportSize({ width: 1440, height: 2560 })
  await page.route('**/api/v1/dashboard', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByText(/Offline · zuletzt bekannte Ansicht/)).toBeVisible()
  await expect(page.getByText(/keine Termine an/)).toBeVisible()
  await expect(page.getByText('Projektbesprechung')).toHaveCount(0)
})
