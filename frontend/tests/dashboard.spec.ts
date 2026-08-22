import { expect, test, type Page } from '@playwright/test'

import { createFallbackDashboard } from '../src/services/fallback'

async function mockAuthentication(page: Page, cameraActive = false) {
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
  await page.route('**/api/v1/camera/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        active: cameraActive,
        expiresAt: cameraActive ? '2026-08-22T12:15:00Z' : null,
        streamUrl: '/camera-stream/api/stream.mp4?src=tapo',
        revision: cameraActive ? 1 : 0,
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
  await page.route('**/api/v1/photos/gallery', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"photos":[]}',
    }),
  )
}

test('camera mode keeps the calendar and replaces the complete lower region', async ({ page }) => {
  await mockAuthentication(page, true)
  await page.setViewportSize({ width: 1440, height: 2560 })
  const dashboard = createFallbackDashboard(new Date('2026-08-22T12:00:00+02:00'))
  await page.route('**/api/v1/dashboard', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dashboard),
    }),
  )
  await page.route('**/camera-stream/**', (route) =>
    route.fulfill({ status: 503, contentType: 'text/plain', body: 'offline' }),
  )

  await page.goto('/')
  const calendar = page.locator('.calendar-card')
  const camera = page.getByLabel('Tapo Live Stream')
  await expect(calendar).toBeVisible()
  await expect(camera).toBeVisible()
  await expect(page.getByText('Kamera momentan nicht erreichbar')).toBeVisible()
  await expect(page.getByText('Aufgaben')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Einkaufsliste' })).toBeHidden()
  await expect(page.getByText('Spruch des Tages')).toBeHidden()
  await expect(camera.locator('video')).not.toHaveAttribute('controls', '')

  const calendarBox = await calendar.boundingBox()
  const cameraBox = await camera.boundingBox()
  expect(calendarBox).not.toBeNull()
  expect(cameraBox).not.toBeNull()
  if (!calendarBox || !cameraBox) throw new Error('Camera layout regions are missing')
  expect(cameraBox.y).toBeGreaterThanOrEqual(calendarBox.y + calendarBox.height)
  expect(cameraBox.width).toBeGreaterThan(calendarBox.width * 0.95)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)

  await page.screenshot({ path: 'tests/artifacts/camera-mode-1440x2560.png', fullPage: true })
})

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
  await expect(page.getByRole('heading', { name: 'Einkaufsliste' })).toBeVisible()
  await expect(page.getByText('WLAN Gastzugang')).toBeVisible()
  await expect(page.getByAltText('QR-Code für den WLAN-Gastzugang')).toBeVisible()
  await expect(page.getByLabel('Geburtstags-Countdown für Hannah')).toBeVisible()
  await expect(page.getByLabel('Geburtstags-Countdown für Gabriel')).toBeVisible()
  await expect(page.getByText('Zusammen ist unser Lieblingsort.')).toBeVisible()
  await expect(page.getByText('Wasser')).toHaveCount(0)
  await expect(page.getByText('Raumtemperatur')).toHaveCount(0)

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

test('landscape calendar stays bounded and keeps following dashboard sections reachable', async ({
  page,
}) => {
  await mockAuthentication(page)
  const dashboard = createFallbackDashboard(new Date('2026-08-10T12:00:00+02:00'))
  const busyForecast = dashboard.weather.data.forecast[1]
  if (!busyForecast) throw new Error('Landscape test requires a second forecast day')
  const busyDate = busyForecast.date
  dashboard.calendar.events = Array.from({ length: 30 }, (_, index) => ({
    id: `landscape-event-${String(index)}`,
    calendarId: 'family',
    calendarName: 'Familie',
    title: `Landscape Termin ${String(index + 1)}`,
    start: `${busyDate}T10:00:00+02:00`,
    end: `${busyDate}T11:00:00+02:00`,
    allDay: false,
    location: null,
    description: null,
    color: '#5fa8ff',
    source: 'test',
    lastModified: null,
    cancelled: false,
    stale: false,
  }))
  await page.route('**/api/v1/dashboard', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dashboard),
    }),
  )

  for (const viewport of [
    { width: 2039, height: 986 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByText('Familienkalender')).toBeVisible()

    const layout = await page.evaluate(() => {
      const bounds = (selector: string) => {
        const node = document.querySelector<HTMLElement>(selector)
        if (!node) throw new Error(`Missing dashboard region: ${selector}`)
        const rect = node.getBoundingClientRect()
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }
      }
      const agenda = document.querySelector<HTMLElement>('.agenda-list')
      if (!agenda) throw new Error('Missing calendar agenda')

      return {
        calendar: bounds('.calendar-card'),
        month: bounds('.month-calendar'),
        lower: bounds('.lower-grid'),
        info: bounds('.info-grid'),
        agendaClientHeight: agenda.clientHeight,
        agendaScrollHeight: agenda.scrollHeight,
        agendaOverflowY: getComputedStyle(agenda).overflowY,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
      }
    })

    expect(layout.calendar.height).toBeGreaterThanOrEqual(649)
    expect(layout.calendar.height).toBeLessThanOrEqual(901)
    expect(layout.agendaOverflowY).toBe('auto')
    expect(layout.agendaScrollHeight).toBeGreaterThan(layout.agendaClientHeight)
    expect(layout.month.top).toBeGreaterThanOrEqual(layout.calendar.top)
    expect(layout.month.bottom).toBeLessThanOrEqual(layout.calendar.bottom)
    expect(layout.lower.top - layout.calendar.bottom).toBeLessThan(50)
    expect(layout.info.top - layout.lower.bottom).toBeLessThan(50)
    expect(layout.scrollHeight).toBeLessThan(3200)
    expect(layout.scrollWidth).toBe(layout.clientWidth)

    for (const region of [
      page.getByText('Aufgaben'),
      page.getByRole('heading', { name: 'Einkaufsliste' }),
      page.getByLabel('Geburtstags-Countdown für Hannah'),
      page.getByLabel('Geburtstags-Countdown für Gabriel'),
      page.getByText('WLAN Gastzugang'),
      page.getByText('Spruch des Tages'),
    ]) {
      await region.scrollIntoViewIfNeeded()
      await expect(region).toBeInViewport()
    }
  }
})

test('info cards and guest wifi QR remain responsive on smartphone, tablet and kiosk', async ({
  page,
}) => {
  await mockAuthentication(page)
  const dashboard = createFallbackDashboard(new Date('2026-08-10T12:00:00+02:00'))
  await page.route('**/api/v1/dashboard', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dashboard),
    }),
  )

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByLabel('Geburtstags-Countdown für Hannah')).toBeVisible()
  await expect(page.getByLabel('Geburtstags-Countdown für Gabriel')).toBeVisible()
  const qrCode = page.getByAltText('QR-Code für den WLAN-Gastzugang')
  await expect(qrCode).toBeVisible()

  const expectQrCodeIsContained = async () => {
    const result = await qrCode.evaluate((node) => {
      const image = node as HTMLImageElement
      const qr = image.getBoundingClientRect()
      const card = image.closest('.guest-wifi-card')?.getBoundingClientRect()
      const style = getComputedStyle(image)
      const contained = card
        ? qr.left >= card.left &&
          qr.right <= card.right &&
          qr.top >= card.top &&
          qr.bottom <= card.bottom
        : false
      return {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        ratio: qr.width / qr.height,
        contained,
        filter: style.filter,
        opacity: style.opacity,
        objectFit: style.objectFit,
      }
    })
    expect(result).toMatchObject({
      naturalWidth: 141,
      naturalHeight: 141,
      contained: true,
      filter: 'none',
      opacity: '1',
      objectFit: 'contain',
    })
    expect(result.ratio).toBeCloseTo(1, 2)
  }

  await expectQrCodeIsContained()
  expect(
    await page
      .locator('.info-grid')
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
  ).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)

  await page.setViewportSize({ width: 1024, height: 1366 })
  expect(
    await page
      .locator('.info-grid')
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
  ).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024)
  await expectQrCodeIsContained()

  await page.setViewportSize({ width: 1440, height: 2560 })
  expect(
    await page
      .locator('.info-grid')
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
  ).toBe(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  await expectQrCodeIsContained()
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
