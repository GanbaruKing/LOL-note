import { test, expect, _electron as electron } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { resolve } from 'node:path'

test('enemy cooldowns follow the opponent and fit both window sizes', async () => {
  mkdirSync('.test-data', { recursive: true })
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = mkdtempSync(resolve('.test-data', 'cooldowns-'))
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    const panel = page.getByRole('region', { name: 'DariusのスキルCD' })
    await expect(panel).toContainText('9 / 8 / 7 / 6 / 5')
    await expect(panel).toContainText('120 / 100 / 80')
    await expect(panel.locator('tbody tr')).toHaveCount(4)
    const heading = await page.locator('.opponent-heading').boundingBox()
    const table = await panel.boundingBox()
    expect(table!.x).toBeGreaterThan(heading!.x)
    await page.screenshot({ path: 'docs/screenshots/skill-cooldowns.png' })
    await page.getByRole('button', { name: '相手のチャンピオンを選択' }).click()
    await page.getByLabel('相手のチャンピオンを検索').fill('Ahri')
    await page.getByLabel('相手のチャンピオンを検索').press('Enter')
    await expect(page.getByRole('region', { name: 'AhriのスキルCD' })).toBeVisible()
    await expect(panel).toHaveCount(0)
    await page.setViewportSize({ width: 1000, height: 720 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await app.close()
  }
})
