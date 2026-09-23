import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { NotebookRepository } from '../src/main/repository'
import catalog from '../resources/champions.json'

test('matchup pool replaces statistics and selects own picks by lane without losing drafts', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'matchup-pool-'))
  const repo = new NotebookRepository(join(folder, 'notebook.sqlite'), catalog.champions)
  repo.savePool({ championId: 266, role: 'TOP', confidence: 3 })
  repo.savePool({ championId: 86, role: 'TOP', confidence: 5 })
  repo.savePool({ championId: 103, role: 'MID', confidence: 4 })
  repo.close()
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = folder
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    await expect(page).toHaveTitle('RiftNote')
    expect(await app.evaluate(({ app }) => app.getName())).toBe('RiftNote')
    const panel = page.getByRole('region', { name: 'Match upのFavorite Champions' })
    await expect(panel.locator('.matchup-pool-pick')).toHaveCount(2)
    await expect(panel.locator('.matchup-pool-pick').first()).toContainText('Garen')
    await expect(page.getByRole('heading', { name: 'Top Matchup Picks' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Statistics', exact: true })).toHaveCount(0)
    const editor = page.getByLabel('新しいメモ', { exact: true })
    await editor.fill('未保存の対面メモ')
    await panel.getByRole('button', { name: 'Garenを自分のチャンピオンに選択' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: '編集を続ける', exact: true }).click()
    await expect(editor).toHaveValue('未保存の対面メモ')
    await panel.getByRole('button', { name: 'Garenを自分のチャンピオンに選択' }).click()
    await page.getByRole('button', { name: '変更を破棄して移動' }).click()
    await expect(page.getByRole('button', { name: '自分のチャンピオンを選択' })).toContainText(
      'Garen',
    )
    await expect(page.getByRole('button', { name: '相手のチャンピオンを選択' })).toContainText(
      'Darius',
    )
    await expect(page.getByLabel('ROLE', { exact: true })).toHaveValue('TOP')
    await expect(
      panel.getByRole('button', { name: 'Garenを自分のチャンピオンに選択' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'docs/screenshots/matchup-pool.png', fullPage: true })
    await page.getByLabel('ROLE', { exact: true }).selectOption('MID')
    await expect(panel.locator('.matchup-pool-pick')).toHaveCount(1)
    await panel.getByRole('button', { name: 'Ahriを自分のチャンピオンに選択' }).click()
    await expect(page.getByRole('button', { name: '自分のチャンピオンを選択' })).toContainText(
      'Ahri',
    )
    await page.getByRole('button', { name: 'プールを編集 →' }).click()
    await expect(
      page.getByRole('group', { name: 'プールのレーン' }).getByRole('button', { name: /MID/ }),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'AhriをMIDから解除' }).click()
    await page.getByRole('button', { name: /Match up/ }).click()
    await expect(panel).toContainText('MIDのチャンピオンはまだ登録されていません')
  } finally {
    await app.close()
  }
})

test('Comfort Picks refreshes externally added personal picks when window regains focus', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'comfort-refresh-'))
  const repo = new NotebookRepository(join(folder, 'notebook.sqlite'), catalog.champions)
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = folder
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    const picks = page.getByRole('region', { name: 'Comfort Picks', exact: true })
    await expect(picks).toContainText('得意なピックを追加しましょう')
    repo.saveMyPick({ myChampionId: 2, enemyChampionId: 122, role: 'TOP' })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(picks).toContainText('Olaf')
    await expect(page.locator('.quick-note-bar')).toHaveCount(0)
  } finally {
    await app.close()
    repo.close()
  }
})
