import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { NotebookRepository } from '../src/main/repository'
import catalog from '../resources/champions.json'
import { createMockLcu } from './mock-lcu'

test('Phase 2 knowledge flows into a read-only live Champ Select session', async () => {
  test.setTimeout(90000)
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'phase23-'))
  const mock = await createMockLcu(join(folder, 'league'))
  const repo = new NotebookRepository(join(folder, 'notebook.sqlite'), catalog.champions)
  repo.setLeagueFolder(join(folder, 'league'))
  repo.addChampionNote({ championId: 266, category: 'General', body: 'パッシブを意識する' })
  repo.close()
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = folder
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('.lcu-banner')).toContainText('接続中', { timeout: 10000 })
    await page.getByLabel('新しいメモ', { exact: true }).fill('Ghost中は距離を取る')
    await page.getByRole('button', { name: '＋ メモを保存', exact: true }).click()
    await page.getByRole('button', { name: /メモ\d+をPin/ }).click()
    await expect(page.getByRole('button', { name: /メモ\d+をPin/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByLabel('My Picksのチャンピオン').selectOption('86')
    await page.getByLabel('My Picksの優先順位').fill('1')
    await page.getByLabel('My Picksの自信度').selectOption('4')
    await page.getByRole('button', { name: '候補を保存', exact: true }).click()
    await expect(page.locator('.pick-row')).toContainText('Garen')
    await page.getByRole('button', { name: /Search/, exact: false }).click()
    await page.getByLabel('メモ横断検索').fill('Darius Ghost')
    await page.getByLabel('Pinのみ').check()
    await expect(page.locator('.search-hit')).toHaveCount(1)
    await page.getByLabel('検索レーン').selectOption('MID')
    await expect(page.locator('.search-hit')).toHaveCount(0)
    await page.getByLabel('検索レーン').selectOption('TOP')
    await expect(page.locator('.search-hit')).toHaveCount(1)
    await page.getByRole('button', { name: 'ノートを開く →' }).click()
    await expect(page.locator('.note-body')).toHaveText('Ghost中は距離を取る')
    await page.getByLabel('新しいメモ', { exact: true }).fill('未保存の振り返り')
    mock.scenario.phase = 'ChampSelect'
    await expect(page.locator('.lcu-banner')).toContainText('Champion Select Active', {
      timeout: 10000,
    })
    await expect(page.getByRole('heading', { name: 'Match up', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Champ Selectを開く →' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: '編集を続ける' }).click()
    await expect(page.getByLabel('新しいメモ', { exact: true })).toHaveValue('未保存の振り返り')
    await page.getByRole('button', { name: 'Champ Selectを開く →' }).click()
    await page.getByRole('button', { name: '変更を破棄して移動' }).click()
    await expect(page.getByLabel('Champ Selectのレーン')).toHaveValue('TOP')
    await expect(page.locator('.select-notes')).toHaveCount(0)
    await page.locator('.enemy-picks').getByRole('button', { name: 'Darius', exact: true }).click()
    await expect(page.locator('.select-notes')).toContainText('Ghost中は距離を取る')
    await expect(page.locator('.select-notes')).toContainText('★ PIN')
    await expect(page.locator('.select-notes')).toContainText('パッシブを意識する')
    await expect(page.locator('.pick-row')).toContainText('Garen')
    await page.locator('.pick-row').getByRole('button').click()
    await expect(page.getByLabel('Champ Selectの自分Pick')).toHaveValue('86')
    await expect(page.locator('.select-notes')).not.toContainText('Ghost中は距離を取る')
    await page.getByRole('button', { name: 'LCUの選択へ戻す' }).click()
    await expect(page.locator('.select-notes')).toContainText('Ghost中は距離を取る')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'docs/screenshots/champ-select.png', fullPage: true })
    mock.scenario.own = 0
    mock.scenario.intent = 86
    await expect(page.getByLabel('Champ Selectの自分Pick')).toHaveValue('86', { timeout: 10000 })
    await expect(page.locator('.select-notes')).not.toContainText('Ghost中は距離を取る')
    mock.scenario.intent = 266
    await expect(page.getByLabel('Champ Selectの自分Pick')).toHaveValue('266', { timeout: 10000 })
    await expect(page.locator('.select-notes')).toContainText('Ghost中は距離を取る')
    mock.scenario.intent = 0
    await expect(page.getByLabel('Champ Selectの自分Pick')).toHaveValue('', { timeout: 10000 })
    await expect(page.locator('.select-notes')).toHaveCount(0)
    mock.scenario.enemies = [86]
    await expect(
      page.locator('.enemy-picks').getByRole('button', { name: 'Darius', exact: true }),
    ).toHaveCount(0, { timeout: 10000 })
    await expect(page.locator('.select-notes')).toHaveCount(0)
    mock.scenario.broken = true
    await expect(page.locator('.lcu-banner')).toContainText('再接続', { timeout: 10000 })
    await expect(page.locator('.enemy-picks')).toHaveCount(0)
    mock.scenario.broken = false
    mock.scenario.enemies = [122]
    await expect(page.locator('.lcu-banner')).toContainText('Champion Select Active', {
      timeout: 10000,
    })
    await expect(page.locator('.select-notes')).toHaveCount(0)
    mock.scenario.phase = 'Lobby'
    await expect(page.locator('.lcu-banner')).toContainText('Lobby', { timeout: 10000 })
    expect(
      mock.paths.every(
        (path) =>
          path.startsWith('GET ') &&
          (path.endsWith('/lol-gameflow/v1/gameflow-phase') ||
            path.endsWith('/lol-champ-select/v1/session')),
      ),
    ).toBe(true)
  } finally {
    await app.close()
    await mock.close()
  }
})
