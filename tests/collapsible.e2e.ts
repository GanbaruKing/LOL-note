import { test, expect, _electron as electron } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { resolve } from 'node:path'

test('panel folding persists independently across application restarts', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'folding-'))
  const env: Record<string, string> = Object.fromEntries(
    Object.entries({ ...process.env, NOTEBOOK_TEST_DATA_DIR: folder }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  delete env.ELECTRON_RUN_AS_NODE
  let app = await electron.launch({ args: [resolve('.')], env })
  try {
    let page = await app.firstWindow()
    await expect(page.locator('details.collapsible')).toHaveCount(4)
    for (const panel of await page.locator('details.collapsible').all()) {
      await expect(panel).toHaveAttribute('open', '')
      await panel.locator(':scope > summary').click()
      await expect(panel).not.toHaveAttribute('open', '')
    }
    await page.getByRole('button', { name: /Library/ }).click()
    await page.locator('.pool-panel details > summary').click()
    await app.close()
    app = await electron.launch({ args: [resolve('.')], env })
    page = await app.firstWindow()
    await expect(page.locator('details.collapsible')).toHaveCount(4)
    await expect(page.locator('details.collapsible[open]')).toHaveCount(0)
    await page.getByRole('button', { name: /Library/ }).click()
    await expect(page.locator('.pool-panel details')).not.toHaveAttribute('open', '')
    await page.getByRole('button', { name: /Match up/ }).click()
    await page.locator('.loadout-editor details > summary').click()
    await expect(page.locator('.loadout-editor details')).toHaveAttribute('open', '')
    await app.close()
    app = await electron.launch({ args: [resolve('.')], env })
    page = await app.firstWindow()
    await expect(page.locator('details.collapsible')).toHaveCount(4)
    await expect(page.locator('details.collapsible[open]')).toHaveCount(1)
    await expect(page.locator('.loadout-editor details')).toHaveAttribute('open', '')
  } finally {
    await app.close()
  }
})
