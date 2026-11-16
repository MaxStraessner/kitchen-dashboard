import { expect, test, type Page } from '@playwright/test'
import { createFallbackDashboard } from '../src/services/fallback'

async function mockHousehold(page: Page, role: 'member' | 'admin' | null = 'member') {
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
  const dashboard = createFallbackDashboard()
  let plan: {
    id: string
    originalName: string
    width: number
    height: number
    uploadedAt: string
    imageUrl: string
    thumbnailUrl: string
  } | null = null
  let revision = 0
  let uploads = 0
  let rejectNext = false
  await page.route('**/synthetic-meal-image*', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#f4eee4"/><text x="60" y="110" font-size="60" fill="#182b29">Unser Essensplan</text></svg>',
    }),
  )
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/meal-plan') {
      if (route.request().method() === 'PUT') {
        uploads++
        if (rejectNext) {
          rejectNext = false
          return route.fulfill({
            status: 415,
            json: { detail: 'Dieses Bildformat wird nicht unterstützt.' },
          })
        }
        const id = `p${String(++revision)}`
        plan = {
          id,
          originalName: 'Familienplan.png',
          width: 1200,
          height: 600,
          uploadedAt: '2026-11-16T12:00:00Z',
          imageUrl: `/synthetic-meal-image?id=${id}`,
          thumbnailUrl: `/synthetic-meal-image?id=${id}`,
        }
      }
      if (route.request().method() === 'DELETE') {
        plan = null
        return route.fulfill({ status: 204 })
      }
      return route.fulfill({ json: { plan } })
    }
    const data: Record<string, unknown> = {
      '/api/v1/setup/status': { setupRequired: false },
      '/api/v1/auth/me': {
        id: 'u1',
        username: 'synthetic',
        displayName: 'Test',
        role,
        household: { id: 'h1', name: 'Testfamilie' },
        mustChangePassword: false,
        lastLoginAt: null,
      },
      '/api/v1/auth/csrf': { csrfToken: 'synthetic-csrf' },
      '/api/v1/dashboard': dashboard,
      '/api/v1/camera/status': {
        active: false,
        expiresAt: null,
        streamUrl: '/camera-stream/api/stream.mp4?src=tapo',
        revision: 0,
      },
      '/api/v1/tasks': { tasks: [] },
      '/api/v1/photos/gallery': { photos: [] },
      '/api/v1/bring/items': {
        items: [],
        configured: false,
        available: false,
        stale: false,
        status: 'disabled',
        revision: 0,
        last_successful_sync_at: null,
      },
    }
    return route.fulfill({
      status: !role && path === '/api/v1/auth/me' ? 401 : 200,
      json: data[path] ?? {},
    })
  })
  return {
    uploads: () => uploads,
    reject: () => {
      rejectNext = true
    },
  }
}

for (const role of ['member', 'admin'] as const) {
  test(`meal-plan settings for ${role} handle upload, replacement, failure and deletion`, async ({
    page,
  }) => {
    const mock = await mockHousehold(page, role)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/settings')
    await page.getByRole('link', { name: /Essensplan hochladen und verwalten/ }).click()
    await expect(page.getByRole('heading', { name: 'Essensplan', level: 1 })).toBeVisible()
    await expect(page.getByText('Noch kein Essensplan hinterlegt')).toBeVisible()
    await page.getByLabel('Essensplan auswählen').setInputFiles([])
    expect(mock.uploads()).toBe(0)
    const file = {
      name: 'Familienplan.png',
      mimeType: 'image/png',
      buffer: Buffer.from('synthetic-upload'),
    }
    await page.getByLabel('Essensplan auswählen').setInputFiles(file)
    const preview = page.getByAltText('Aktueller Essensplan')
    await expect(preview).toHaveAttribute('src', '/synthetic-meal-image?id=p1')
    await expect(page.getByText('1200 × 600 Pixel')).toBeVisible()
    await page.getByRole('button', { name: 'Essensplan vergrößern' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Vergrößern', exact: true }).click()
    await expect(page.getByText('150 %')).toBeVisible()
    await page.keyboard.press('Escape')
    if (role === 'member')
      await page.screenshot({
        path: 'tests/artifacts/meal-plan-settings-smartphone.png',
        fullPage: true,
      })
    await page.goto('/')
    await expect(page.getByAltText('Aktueller Essensplan')).toBeVisible()
    await expect(page.locator('.meal-plan-card input[type="file"]')).toHaveCount(0)
    await expect(
      page.locator('.meal-plan-card').getByRole('button', { name: /hochladen|ersetzen|löschen/i }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Einstellungen öffnen' }).click()
    await page.getByRole('link', { name: 'Essensplan', exact: true }).click()
    await page.getByLabel('Essensplan auswählen').setInputFiles(file)
    await expect(preview).toHaveAttribute('src', '/synthetic-meal-image?id=p2')
    mock.reject()
    await page.getByLabel('Essensplan auswählen').setInputFiles(file)
    await expect(page.getByRole('alert')).toHaveText('Dieses Bildformat wird nicht unterstützt.')
    await expect(preview).toHaveAttribute('src', '/synthetic-meal-image?id=p2')
    await page.getByRole('button', { name: 'Löschen', exact: true }).click()
    await page.getByRole('button', { name: 'Abbrechen' }).click()
    await expect(preview).toBeVisible()
    await page.getByRole('button', { name: 'Löschen', exact: true }).click()
    await page.getByRole('button', { name: 'Löschen bestätigen' }).click()
    await expect(page.getByText('Noch kein Essensplan hinterlegt')).toBeVisible()
  })
}

test('meal-plan settings require authentication', async ({ page }) => {
  await mockHousehold(page, null)
  await page.goto('/settings/meal-plan')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible()
})
