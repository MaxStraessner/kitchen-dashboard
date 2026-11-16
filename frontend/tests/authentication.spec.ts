import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })
test.setTimeout(60_000)

const maxPassword = 'Max sichere Familienpassphrase 2026'
const temporaryPassword = 'Jessica vorläufig sicher 2026'
const jessicaPassword = 'Jessica dauerhaft sicher 2026'

test('fresh household setup and complete administrator/member lifecycle', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.getByRole('heading', { name: 'Willkommen' })).toBeVisible()
  await page.screenshot({ path: 'tests/artifacts/setup-smartphone.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 2560 })
  await page.screenshot({ path: 'tests/artifacts/setup-1440x2560.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })

  await page.getByLabel('Anzeigename').fill('Max')
  await page.getByLabel('Benutzername').fill('Max')
  await page.getByLabel('Passwort', { exact: true }).fill(maxPassword)
  await page.getByLabel('Passwort bestätigen').fill(maxPassword)
  await page.getByRole('button', { name: 'Familie einrichten' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Familienkalender')).toBeVisible()

  await page.getByLabel('Einstellungen öffnen').click()
  await page.getByRole('link', { name: 'Benutzerverwaltung' }).click()
  await expect(page).toHaveURL(/\/settings\/users$/)
  await page.getByRole('button', { name: 'Benutzer hinzufügen' }).click()
  await page.getByLabel('Anzeigename').fill('Jessica')
  await page.getByLabel('Benutzername').fill('Jessica')
  await page.getByLabel('Rolle').selectOption('member')
  await page.getByLabel('Vorläufiges Passwort').fill(temporaryPassword)
  await page.getByLabel('Passwort bestätigen').fill(temporaryPassword)
  await page.getByRole('button', { name: 'Benutzer speichern' }).click()
  await expect(page.getByRole('heading', { name: 'Jessica' })).toBeVisible()

  await page.goto('/settings')
  await expect(page.getByText('Kamera nicht aktiv')).toBeVisible()
  await page.screenshot({ path: 'tests/artifacts/settings-smartphone.png', fullPage: true })
  await page.getByRole('button', { name: /Abmelden/ }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.screenshot({ path: 'tests/artifacts/login-smartphone.png', fullPage: true })

  await page.getByLabel('Benutzername').fill('Jessica')
  await page.getByLabel('Passwort').fill(temporaryPassword)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByText('Bitte ändere zuerst dein vorläufiges Passwort.')).toBeVisible()
  await page.getByLabel('Aktuelles Passwort').fill(temporaryPassword)
  await page.getByLabel('Neues Passwort').fill(jessicaPassword)
  await page.getByLabel('Passwort bestätigen').fill(jessicaPassword)
  await page.getByRole('button', { name: 'Passwort ändern' }).click()
  await expect(page.getByText('Passwort sicher geändert.')).toBeVisible()
  await page.goto('/')
  await expect(page.getByText('Familienkalender')).toBeVisible()
  await page.getByLabel('Einstellungen öffnen').click()
  await expect(page.getByRole('link', { name: 'Benutzerverwaltung' })).toHaveCount(0)
  await page.goto('/settings/users')
  await expect(page).toHaveURL(/\/settings$/)

  await page.getByRole('button', { name: /Abmelden/ }).click()
  await page.getByLabel('Benutzername').fill('Max')
  await page.getByLabel('Passwort').fill(maxPassword)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/settings/users')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: 'tests/artifacts/users-desktop.png', fullPage: true })
  const jessicaCard = page.locator('.user-card').filter({ hasText: 'Jessica' })
  page.once('dialog', (dialog) => dialog.accept())
  await jessicaCard.getByRole('button', { name: 'Deaktivieren' }).click()
  await expect(jessicaCard.getByText('Deaktiviert')).toBeVisible()

  await page.goto('/settings')
  await page.getByRole('button', { name: /Abmelden/ }).click()
  await page.getByLabel('Benutzername').fill('Jessica')
  await page.getByLabel('Passwort').fill(jessicaPassword)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByText('Benutzername oder Passwort ist nicht korrekt.')).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 2560 })
  await page.goto('/login')
  await page.screenshot({ path: 'tests/artifacts/login-1440x2560.png', fullPage: true })
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth)

  // Real multipart upload, household visibility and eight-second refresh on a second device.
  await page.getByLabel('Benutzername').fill('Max')
  await page.getByLabel('Passwort').fill(maxPassword)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.setViewportSize({ width: 390, height: 844 })
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1400
    canvas.height = 700
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    context.fillStyle = '#f4eee4'
    context.fillRect(0, 0, 1400, 700)
    context.fillStyle = '#182b29'
    context.font = '60px sans-serif'
    context.fillText('Unser Essensplan', 60, 110)
    context.font = '36px sans-serif'
    context.fillText('Montag: Nudeln · Dienstag: Gemüse · Mittwoch: Suppe', 60, 220)
    return canvas.toDataURL('image/png').split(',')[1] ?? ''
  })
  await page.getByLabel('Essensplan auswählen').setInputFiles({
    name: 'Essensplan.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  })
  const preview = page.getByAltText('Aktueller Essensplan')
  await expect(preview).toBeVisible()
  await expect
    .poll(() => preview.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  const originalSrc = await preview.getAttribute('src')
  await page.reload()
  await expect(preview).toHaveAttribute('src', originalSrc ?? '')

  const secondContext = await browser.newContext({ viewport: { width: 1440, height: 2560 } })
  try {
    const second = await secondContext.newPage()
    await second.goto('/')
    await second.getByLabel('Benutzername').fill('Max')
    await second.getByLabel('Passwort').fill(maxPassword)
    await second.getByRole('button', { name: 'Anmelden' }).click()
    const otherPreview = second.getByAltText('Aktueller Essensplan')
    await expect(otherPreview).toHaveAttribute('src', originalSrc ?? '')
    await page.getByLabel('Essensplan auswählen').setInputFiles({
      name: 'Neuer Plan.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    })
    await expect(preview).not.toHaveAttribute('src', originalSrc ?? '')
    const replacementSrc = await preview.getAttribute('src')
    await expect(otherPreview).toHaveAttribute('src', replacementSrc ?? '', { timeout: 12000 })
    await page.getByLabel('Essensplan auswählen').setInputFiles({
      name: 'Defekt.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not an image'),
    })
    await expect(page.getByRole('status').filter({ hasText: 'gültiges Bild' })).toBeVisible()
    await expect(preview).toHaveAttribute('src', replacementSrc ?? '')
    await page.getByRole('button', { name: 'Löschen', exact: true }).click()
    await page.getByRole('button', { name: 'Löschen bestätigen' }).click()
    await expect(page.getByText('Noch kein Essensplan hinterlegt')).toBeVisible()
    await expect(second.getByText('Noch kein Essensplan hinterlegt')).toBeVisible({
      timeout: 12000,
    })
  } finally {
    await secondContext.close()
  }
})
