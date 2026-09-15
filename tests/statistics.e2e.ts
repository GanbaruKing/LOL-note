import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createMockLcu } from './mock-lcu'
import { NotebookRepository } from '../src/main/repository'
import catalog from '../resources/champions.json'

test('Champ Select statistics stay separate from personal picks, import and persist', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'statistics-'))
  const mock = await createMockLcu(join(folder, 'league'))
  mock.scenario.phase = 'ChampSelect'
  const repo = new NotebookRepository(join(folder, 'notebook.sqlite'), catalog.champions)
  repo.setLeagueFolder(join(folder, 'league'))
  repo.close()
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  env.NOTEBOOK_TEST_DATA_DIR = folder
  delete env.ELECTRON_RUN_AS_NODE
  let app = await electron.launch({ args: [resolve('.')], env })
  try {
    let page = await app.firstWindow()
    await page.context().setOffline(true)
    await page.getByRole('button', { name: 'Champ Selectを開く →' }).click()
    await page.locator('.enemy-picks').getByRole('button', { name: 'Darius', exact: true }).click()
    const panel = page.getByRole('region', { name: 'Statistics', exact: true })
    await expect(panel).toContainText('未接続')
    await panel.getByText('データ設定・サンプル', { exact: true }).click()
    await panel.getByRole('button', { name: 'サンプルを見る' }).click()
    await expect(panel).toContainText('架空データです')
    await expect(panel.locator('.statistics-row')).toHaveCount(3)
    await expect(panel.locator('.statistics-row').first()).toContainText('53.4%')
    await expect(page.locator('.pick-row')).toHaveCount(0)
    await page.getByLabel('統計の最低試合数').fill('1')
    await panel.getByRole('button', { name: '条件を適用' }).click()
    await expect(panel.locator('.statistics-row')).toHaveCount(4)
    await expect(panel.locator('.statistics-row').first()).toContainText('Jax')
    await page.getByLabel('統計の地域').selectOption('KR')
    await panel.getByRole('button', { name: '条件を適用' }).click()
    await expect(panel).toContainText('未接続')
    await expect(panel.locator('.statistics-row')).toHaveCount(0)
    await page.getByLabel('統計の地域').selectOption('JP1')
    await page.getByLabel('統計の最低試合数').fill('100')
    await panel.getByRole('button', { name: '条件を適用' }).click()
    await expect(panel.locator('.statistics-row')).toHaveCount(3)
    await panel.locator('.statistics-row').first().click()
    await expect(page.getByLabel('Champ Selectの自分Pick')).toHaveValue('164')
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    }, resolve('resources/statistics-sample.json'))
    await panel.getByRole('button', { name: '統計JSONを取り込む' }).click()
    await expect(panel.getByRole('button', { name: 'サンプルを見る' })).toBeVisible()
    await expect(panel.locator('.statistics-row')).toHaveCount(3)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'docs/screenshots/statistics.png', fullPage: true })
    await app.close()
    app = await electron.launch({ args: [resolve('.')], env })
    page = await app.firstWindow()
    await page.getByRole('button', { name: 'Champ Selectを開く →' }).click()
    await page.locator('.enemy-picks').getByRole('button', { name: 'Darius', exact: true }).click()
    await expect(page.locator('.statistics-row')).toHaveCount(3)
    await page.getByLabel('Champ Selectのレーン', { exact: true }).selectOption('MID')
    await expect(page.locator('.statistics-row')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Statistics' })).toContainText(
      '条件を満たすデータはありません',
    )
  } finally {
    await app.close()
    await mock.close()
  }
})
