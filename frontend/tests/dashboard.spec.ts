import { expect, test, type Page } from '@playwright/test'

import { createFallbackDashboard } from '../src/services/fallback'

async function mockAuthentication(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'EventSource', {
      configurable: true,
      value: class {
        onerror = null
        addEventListener() {}
        close() {}
      },
    })
  })
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
  await page.route('**/api/v1/bring/items', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [],
        configured: true,
        available: true,
        stale: false,
        status: 'ok',
        last_successful_sync_at: '2026-07-16T08:00:00Z',
        revision: 1,
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
  await expect(page.getByText('Keine Termine').first()).toBeVisible()
  await expect(page.getByText('Projektbesprechung')).toHaveCount(0)
})

test('shopping list remains usable on smartphone, tablet and long kiosk layouts', async ({
  page,
}) => {
  await mockAuthentication(page)
  const dashboard = createFallbackDashboard(new Date('2026-07-16T12:00:00+02:00'))
  await page.route('**/api/v1/dashboard', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dashboard),
    }),
  )
  const items = Array.from({ length: 60 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name: `Sehr langer gut umbrechender Einkaufsartikel Nummer ${String(index + 1)}`,
    specification: index % 2 === 0 ? '2 große Packungen' : '',
    position: index,
  }))
  await page.unroute('**/api/v1/bring/items')
  await page.route('**/api/v1/bring/items', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items,
        configured: true,
        available: true,
        stale: false,
        status: 'ok',
        last_successful_sync_at: '2026-07-16T08:00:00Z',
        revision: 2,
      }),
    }),
  )

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByText('60 offen')).toBeVisible()
  expect(
    await page
      .locator('.shopping-grid')
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
  ).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.getByRole('button', { name: 'Artikel hinzufügen' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('Artikelname')).toBeFocused()
  await page.getByRole('button', { name: 'Dialog schließen' }).click()

  await page.setViewportSize({ width: 1024, height: 1366 })
  expect(
    await page
      .locator('.shopping-grid')
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
  ).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024)

  await page.setViewportSize({ width: 1440, height: 2560 })
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(2560)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
})
