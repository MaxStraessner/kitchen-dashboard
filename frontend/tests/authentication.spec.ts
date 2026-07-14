import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })
test.setTimeout(60_000)

const maxPassword = 'Max sichere Familienpassphrase 2026'
const temporaryPassword = 'Jessica vorläufig sicher 2026'
const jessicaPassword = 'Jessica dauerhaft sicher 2026'

test('fresh household setup and complete administrator/member lifecycle', async ({ page }) => {
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
})
