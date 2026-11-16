import { expect, test, type Page } from '@playwright/test'

import { createFallbackDashboard } from '../src/services/fallback'

async function mockAuthentication(page: Page, cameraActive = false) {
  await page.clock.install({ time: new Date('2026-07-15T10:00:00+02:00') })
  await page.route('**/api/v1/meal-plan', (route) => route.fulfill({ json: { plan: null } }))
  await page.route('**/api/v1/tasks', (route) => route.fulfill({ json: { tasks: [] } }))
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
  await expect(page.getByText('Aufgaben', { exact: true })).toBeHidden()
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
  await expect(page.getByText('Aufgaben', { exact: true })).toBeVisible()
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
  const meal = await page.locator('.meal-plan-card').boundingBox()
  expect(meal).not.toBeNull()
  const lower = await page.getByTestId('lower-grid').boundingBox()
  const info = await page.locator('.info-grid').boundingBox()
  expect(top).not.toBeNull()
  expect(calendar).not.toBeNull()
  expect(lower).not.toBeNull()
  expect(info).not.toBeNull()
  if (!top || !calendar || !lower || !info) throw new Error('A dashboard region is missing')
  expectNoOverlap(top, calendar)
  if (!meal) throw new Error('Meal plan missing')
  expectNoOverlap(calendar, meal)
  expectNoOverlap(meal, lower)
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
        meal: bounds('.meal-plan-card'),
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
    expect(layout.agendaOverflowY).toBe('hidden')
    expect(layout.agendaScrollHeight).toBeLessThanOrEqual(layout.agendaClientHeight + 1)
    expect(layout.month.top).toBeGreaterThanOrEqual(layout.calendar.top)
    expect(layout.month.bottom).toBeLessThanOrEqual(layout.calendar.bottom)
    expect(layout.meal.top - layout.calendar.bottom).toBeLessThan(50)
    expect(layout.lower.top - layout.meal.bottom).toBeLessThan(50)
    expect(layout.info.top - layout.lower.bottom).toBeLessThan(50)
    expect(layout.scrollHeight).toBeLessThan(3200)
    expect(layout.scrollWidth).toBe(layout.clientWidth)

    for (const region of [
      page.getByText('Aufgaben', { exact: true }),
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
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(2560)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
})

test('dense calendars, long lists and meal images fit the kiosk including zoom-equivalent viewports', async ({
  page,
}) => {
  await mockAuthentication(page)
  const now = new Date('2026-07-15T10:00:00+02:00')
  const dashboard = createFallbackDashboard(now)
  const counts = [0, 1, 10, 50, 3, 0, 12]
  dashboard.calendar.events = counts.flatMap((count, offset) =>
    Array.from({ length: count }, (_, index) => ({
      id: `event-${String(offset)}-${String(index)}`,
      calendarId: 'family',
      calendarName: 'Familie',
      title: `Familientermin ${String(offset)}-${String(index)} mit einem sehr langen vollständigen Titel`,
      start: `2026-07-${String(15 + offset)}T${String(8 + (index % 12)).padStart(2, '0')}:00:00+02:00`,
      end: `2026-07-${String(15 + offset)}T22:00:00+02:00`,
      allDay: false,
      location: 'Unna',
      description: 'Vollständige Termindetails',
      color: '#62d68b',
      source: 'test',
      lastModified: null,
      cancelled: false,
      stale: false,
    })),
  )
  await page.route('**/api/v1/dashboard', (route) => route.fulfill({ json: dashboard }))
  await page.route('**/api/v1/tasks', (route) =>
    route.fulfill({
      json: {
        tasks: Array.from({ length: 50 }, (_, index) => ({
          id: `task-${String(index)}`,
          title: `Familienaufgabe ${String(index)}`,
          completed: false,
          createdAt: '',
          updatedAt: '',
          completedAt: null,
          sortOrder: index,
        })),
      },
    }),
  )
  const items = Array.from({ length: 60 }, (_, index) => ({
    id: `item-${String(index)}`,
    name: `Artikel ${String(index)}`,
    specification: '2 Packungen',
    position: index,
  }))
  await page.route('**/api/v1/bring/items', (route) =>
    route.fulfill({
      json: {
        items,
        configured: true,
        available: true,
        stale: false,
        status: 'ok',
        revision: 1,
        last_successful_sync_at: now.toISOString(),
      },
    }),
  )
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="700"><rect width="1400" height="700" fill="#f4eee4"/><text x="60" y="110" font-size="60" fill="#182b29">Unser Essensplan</text><text x="60" y="220" font-size="36" fill="#182b29">Montag: Nudeln · Dienstag: Gemüse · Mittwoch: Suppe</text></svg>'
  await page.route('**/test-meal-image', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: svg }),
  )
  await page.route('**/api/v1/meal-plan', (route) =>
    route.fulfill({
      json: {
        plan: {
          id: 'p1',
          originalName: 'plan.png',
          width: 1400,
          height: 700,
          uploadedAt: now.toISOString(),
          imageUrl: '/test-meal-image',
          thumbnailUrl: '/test-meal-image',
        },
      },
    }),
  )
  for (const viewport of [
    { width: 1440, height: 2560 },
    { width: 1600, height: 2844 },
    { width: 1309, height: 2327 },
    { width: 1152, height: 2048 },
    { width: 1440, height: 2400 },
    { width: 900, height: 1500 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByAltText('Aktueller Essensplan')).toBeVisible()
    await expect(page.locator('.agenda-day')).toHaveCount(7)
    await expect(page.locator('.lower-grid .count-badge').first()).toHaveText('50 offen')
    await expect(page.locator('.task-list .preview-more')).toBeVisible()
    await expect(page.locator('.shopping-grid .preview-more')).toBeVisible()
    const layout = await page.evaluate(() => {
      const bounds = (node: Element) => {
        const r = node.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, height: r.height, right: r.right, left: r.left }
      }
      const bands = [
        ...document.querySelectorAll(
          '.top-grid,.calendar-card,.meal-plan-card,.lower-grid,.info-grid',
        ),
      ].map(bounds)
      const days = [...document.querySelectorAll('.agenda-day')].map(bounds)
      const clipped = [
        ...document.querySelectorAll(
          '.agenda-event,.agenda-copy,.preview-more,.meal-plan-header,.quiet-add,.clock-time,.clock-date,.weather-main,.weather-details,.task-row--display,.agenda-date-button,.agenda-weather',
        ),
      ]
        .filter((node) => {
          const r = bounds(node)
          const parent =
            node.closest('.agenda-events,.task-list,.shopping-grid,.agenda-day') ??
            node.closest('.card')
          if (!parent) return false
          const p = bounds(parent)
          return (
            r.top < p.top - 1 ||
            r.bottom > p.bottom + 1 ||
            r.left < p.left - 1 ||
            r.right > p.right + 1
          )
        })
        .map((node) => node.className)
      return {
        bands,
        days,
        clipped,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        width: innerWidth,
        height: innerHeight,
      }
    })
    expect(layout.scrollWidth).toBe(layout.width)
    expect(layout.scrollHeight).toBe(layout.height)
    expect(layout.clipped, JSON.stringify(viewport)).toEqual([])
    for (const band of layout.bands) {
      expect(band.top).toBeGreaterThanOrEqual(0)
      expect(band.bottom).toBeLessThanOrEqual(viewport.height)
    }
    for (let i = 1; i < layout.bands.length; i++)
      expect(layout.bands[i]?.top ?? 0).toBeGreaterThanOrEqual(layout.bands[i - 1]?.bottom ?? 0)
    expect(
      Math.max(...layout.days.map((d) => d.height)) - Math.min(...layout.days.map((d) => d.height)),
    ).toBeLessThanOrEqual(1)
    if (viewport.width === 1440 && viewport.height === 2560) {
      await expect(page.locator('[data-date="2026-07-21"] .agenda-event')).toHaveCount(12)
      await expect(page.locator('[data-date="2026-07-21"] .agenda-overflow-label')).toHaveCount(0)
      await expect(page.locator('[data-date="2026-07-17"] .agenda-event')).toHaveCount(10)
      await expect(page.locator('[data-date="2026-07-18"] .agenda-event')).toHaveCount(12)
      await expect(page.locator('[data-date="2026-07-18"] .agenda-overflow-label')).toHaveText(
        '+ 38 weitere',
      )
    }
    const busyDay = page.locator('[data-date="2026-07-18"]')
    const visible = await busyDay.locator('.agenda-event').count()
    await expect(
      busyDay
        .locator('.agenda-overflow-label')
        .filter({ hasText: `+ ${String(50 - visible)} weitere` }),
    ).toBeVisible()
  }
  await page.setViewportSize({ width: 1440, height: 2560 })
  await page.screenshot({
    path: 'tests/artifacts/dashboard-meal-plan-1440x2560.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Termine für 2026-07-18 anzeigen' }).click()
  await expect(page.getByRole('dialog').getByRole('article')).toHaveCount(50)
  await page.keyboard.press('Escape')
  await page.locator('.shopping-grid .preview-more').click()
  await expect(page.getByRole('dialog').locator('.shopping-item')).toHaveCount(60)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Essensplan vergrößern' }).click()
  await expect(page.getByRole('dialog').getByAltText('Essensplan in Großansicht')).toBeVisible()
  await page.getByRole('button', { name: 'Vergrößern', exact: true }).click()
  await expect(page.getByText('150 %')).toBeVisible()
})

test('all twelve daily events are visible across all seven equal-height days', async ({ page }) => {
  await mockAuthentication(page)
  await page.setViewportSize({ width: 1440, height: 2560 })
  const dashboard = createFallbackDashboard(new Date('2026-07-15T10:00:00+02:00'))
  dashboard.calendar.events = Array.from({ length: 84 }, (_, index) => ({
    id: `daily-${String(index)}`,
    calendarId: 'family',
    calendarName: 'Familie',
    title: `Termin ${String((index % 12) + 1)}`,
    start: `2026-07-${String(15 + Math.floor(index / 12))}T${String(8 + (index % 12)).padStart(2, '0')}:00:00+02:00`,
    end: `2026-07-${String(15 + Math.floor(index / 12))}T22:00:00+02:00`,
    allDay: false,
    location: null,
    description: null,
    color: '#62d68b',
    source: 'test',
    lastModified: null,
    cancelled: false,
    stale: false,
  }))
  await page.route('**/api/v1/dashboard', (route) => route.fulfill({ json: dashboard }))
  await page.goto('/')
  await expect(page.locator('.agenda-event')).toHaveCount(84)
  await expect(page.locator('.agenda-overflow-label')).toHaveCount(0)
  await expect(page.getByLabel('Monatskalender')).toBeVisible()
  for (const event of await page.locator('.agenda-event').all())
    await expect(event).toBeInViewport({ ratio: 1 })
  const contained = await page.locator('.agenda-event').evaluateAll((nodes) =>
    nodes.every((node) => {
      const r = node.getBoundingClientRect()
      const p = node.closest('.agenda-events')?.getBoundingClientRect()
      return p && r.top >= p.top && r.bottom <= p.bottom && r.left >= p.left && r.right <= p.right
    }),
  )
  expect(contained).toBeTruthy()
  await page.screenshot({
    path: 'tests/artifacts/calendar-twelve-events-per-day.png',
    fullPage: true,
  })
})
