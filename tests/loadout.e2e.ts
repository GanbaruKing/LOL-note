import { test, expect, _electron as electron } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { resolve, join } from 'node:path'
import data from '../resources/loadout.json'
test('offline build and rune editing, navigation protection and collapsible picks', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'loadout-'))
  const env: Record<string, string> = Object.fromEntries(
    Object.entries({ ...process.env, NOTEBOOK_TEST_DATA_DIR: folder }).filter(
      (x): x is [string, string] => x[1] !== undefined,
    ),
  )
  delete env.ELECTRON_RUN_AS_NODE
  let app = await electron.launch({ args: [resolve('.')], env })
  try {
    let page = await app.firstWindow()
    await page.context().setOffline(true)
    const panel = page.getByRole('region', { name: 'ビルド・ルーン', exact: true })
    await panel.getByRole('button', { name: 'アイテムを選ぶ', exact: true }).click()
    const tabs = panel.getByRole('group', { name: 'アイテムの分類' })
    const grid = panel.locator('.item-grid')
    const trinity = data.items.find((x) => x.id === 3078)!,
      deathcap = data.items.find((x) => x.id === 3089)!,
      blade = data.items.find((x) => x.id === 3153)!
    await tabs.getByRole('button', { name: 'ファイター', exact: true }).click()
    await expect(grid.getByRole('button', { name: trinity.name, exact: true })).toBeVisible()
    await expect(grid.getByRole('button', { name: deathcap.name, exact: true })).toHaveCount(0)
    await expect(grid.getByRole('button', { name: blade.name, exact: true })).toBeVisible()
    await tabs.getByRole('button', { name: 'マークスマン', exact: true }).click()
    await expect(grid.getByRole('button', { name: blade.name, exact: true })).toBeVisible()
    await tabs.getByRole('button', { name: 'メイジ', exact: true }).click()
    await panel.getByLabel('アイテム検索', { exact: true }).fill(deathcap.name)
    await expect(grid.getByRole('button')).toHaveCount(1)
    await tabs.getByRole('button', { name: 'ファイター', exact: true }).click()
    await expect(grid.getByRole('button')).toHaveCount(0)
    await expect(
      panel.getByText('該当するアイテムがありません。分類や検索を変更してください。'),
    ).toBeVisible()
    await panel.getByLabel('アイテム検索', { exact: true }).fill('')
    await tabs.getByRole('button', { name: 'すべて', exact: true }).click()
    await expect(grid.getByRole('button')).toHaveCount(data.items.length)
    await expect(page.locator('.brand-symbol')).toHaveAttribute('src', './icon.png')
    expect(
      await page.locator('.brand-symbol').evaluate((img) => (img as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0)
    await panel.getByRole('button', { name: data.items[0].name, exact: true }).click()
    await panel.getByLabel('ビルドの補足').fill('先に素材を購入')
    await page
      .getByRole('button', { name: /Champions/, exact: false })
      .first()
      .click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: '編集を続ける' }).click()
    await panel.getByRole('button', { name: `メイン：${data.trees[0].name}`, exact: true }).click()
    await panel
      .getByRole('button', { name: data.trees[0].slots[0].runes[0].name, exact: true })
      .click()
    await panel.getByRole('button', { name: `サブ：${data.trees[1].name}`, exact: true }).click()
    await panel
      .getByRole('button', { name: data.trees[1].slots[1].runes[0].name, exact: true })
      .click()
    const lock = new DatabaseSync(join(folder, 'notebook.sqlite'))
    lock.exec('BEGIN IMMEDIATE')
    try {
      await panel.getByRole('button', { name: 'ビルド・ルーンを保存' }).click()
      await expect(panel.getByRole('alert')).toBeVisible({ timeout: 10000 })
      await expect(panel.getByLabel('ビルドの補足')).toHaveValue('先に素材を購入')
    } finally {
      lock.exec('ROLLBACK')
      lock.close()
    }
    await panel.getByRole('button', { name: 'ビルド・ルーンを保存' }).click()
    await expect(panel.getByRole('status', { name: 'ビルド・ルーン保存状態' })).toHaveText(
      '保存済み',
    )
    const fold = panel.locator(':scope > .collapsible')
    await fold.locator(':scope > summary').click()
    await expect(panel.getByLabel('ビルドの補足')).not.toBeVisible()
    await expect(panel.locator('.rune-columns')).not.toBeVisible()
    await fold.locator(':scope > summary').click()
    await expect(panel.getByLabel('ビルドの補足')).toHaveValue('先に素材を購入')
    const comfort = page.getByRole('region', { name: 'Comfort Picks', exact: true })
    await comfort.locator('summary').click()
    await expect(comfort.locator('.pool-empty')).not.toBeVisible()
    const recommended = page.locator('.matchup-picks .curated-counters')
    await expect(recommended).toBeVisible()
    await recommended.locator('.collapsible > summary').click()
    await expect(recommended.locator('.curated-counter').first()).not.toBeVisible()
    await page.getByRole('button', { name: 'Champions', exact: false }).first().click()
    const favorites = page.locator('.pool-panel .collapsible')
    await favorites.locator(':scope > summary').click()
    await expect(favorites).not.toHaveAttribute('open', '')
    await expect(page.getByRole('group', { name: 'プールのレーン', exact: true })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Favorite Champions', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Match up', exact: false }).first().click()
    await page.getByRole('button', { name: 'Champions', exact: false }).first().click()
    await expect(favorites).not.toHaveAttribute('open', '')
    await expect(page.getByRole('group', { name: 'プールのレーン', exact: true })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Favorite Champions', exact: true }),
    ).toBeVisible()
    await app.close()
    app = await electron.launch({ args: [resolve('.')], env })
    page = await app.firstWindow()
    await expect(page.getByLabel('ビルドの補足')).toHaveValue('先に素材を購入')
    await expect(page.locator('.rune-columns button[aria-pressed=true]')).toHaveCount(4)
    await page.getByLabel('ビルドの補足').fill('破棄する変更')
    await page.getByLabel('ROLE', { exact: true }).selectOption('MID')
    await page.getByRole('button', { name: '変更を破棄して移動' }).click()
    await expect(page.getByLabel('ビルドの補足')).toHaveValue('')
    await page.getByLabel('ROLE', { exact: true }).selectOption('TOP')
    await expect(page.getByLabel('ビルドの補足')).toHaveValue('先に素材を購入')
    await page.setViewportSize({ width: 1000, height: 720 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const left = await page.locator('.rune-primary').boundingBox(),
      right = await page.locator('.rune-secondary').boundingBox()
    expect(right!.x).toBeGreaterThan(left!.x)
    expect(Math.abs(right!.y - left!.y)).toBeLessThan(2)
    await page.screenshot({ path: 'test-results/loadout.png', fullPage: true })
    await expect(page.locator('.loadout-editor img')).not.toHaveCount(0)
    expect(
      await page
        .locator('.loadout-editor img')
        .evaluateAll((images) =>
          images.every(
            (img) =>
              (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    ).toBe(true)
    await page.screenshot({ path: 'test-results/rune-picker.png', fullPage: true })
  } finally {
    await app.close()
  }
})
