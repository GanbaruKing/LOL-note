import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { NotebookRepository } from '../src/main/repository'
import catalog from '../resources/champions.json'
import { createMockLcu } from './mock-lcu'

test('history automatically finds a matchup, preserves drafts, saves and reopens notes', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'history-'))
  const mock = await createMockLcu(join(folder, 'league'))
  // Reproduce live LCU's missing lane metadata; position samples must recover it.
  for (const p of mock.scenario.historyDetail.participants)
    p.timeline = { lane: 'NONE', role: 'SUPPORT' }
  const repo = new NotebookRepository(join(folder, 'notebook.sqlite'), catalog.champions)
  repo.setLeagueFolder(join(folder, 'league'))
  repo.close()
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = folder
  let app = await electron.launch({ args: [resolve('.')], env })
  try {
    let page = await app.firstWindow()
    await page.getByRole('button', { name: /Match History/ }).click()
    await expect(page.locator('.history-row')).toHaveCount(2)
    await page.locator('.history-row').first().click()
    await expect(page.getByLabel('振り返りのRole')).toHaveValue('TOP')
    await expect(page.getByRole('button', { name: 'Darius TOP' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.screenshot({ path: 'docs/screenshots/match-history.png', fullPage: true })
    // Manual correction remains possible; changing Role recalculates the opposing role.
    await page.getByLabel('振り返りのRole').selectOption('MID')
    await expect(page.getByRole('button', { name: 'Ahri MID' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.getByLabel('振り返りのRole').selectOption('TOP')
    await page.getByRole('button', { name: 'この対面のメモを書く →' }).click()
    const editor = page.getByLabel('新しいメモ', { exact: true })
    await expect(editor).toHaveValue(/Aatrox vs Darius · TOP/)
    await editor.fill((await editor.inputValue()) + '相手のQの内側に入る')
    await page.getByRole('button', { name: /Match History/ }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: '編集を続ける' }).click()
    await expect(editor).toHaveValue(/相手のQの内側に入る/)
    await page.getByRole('button', { name: '＋ メモを保存', exact: true }).click()
    await expect(page.locator('.note-body')).toContainText('相手のQの内側に入る')
    await app.close()
    app = await electron.launch({ args: [resolve('.')], env })
    page = await app.firstWindow()
    await expect(page.locator('.note-body')).toContainText('相手のQの内側に入る')
    await page.getByRole('button', { name: /Match History/ }).click()
    await expect(page.locator('.history-row')).toHaveCount(2)
    // A response from a superseded selection must not replace the later selection.
    mock.scenario.historyDelay = 250
    await page.locator('.history-row').first().click()
    await page.locator('.history-row').nth(1).click()
    await expect(page.locator('.history-row').nth(1)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('振り返りのRole')).toHaveValue('TOP')
    await page.getByRole('button', { name: 'この対面のメモを書く →' }).click()
    await expect(page.getByLabel('新しいメモ', { exact: true })).toHaveValue(/試合ID 12346/)
    await page.getByRole('button', { name: /Match History/ }).click()
    await page.getByRole('button', { name: '変更を破棄して移動' }).click()
    await expect(page.locator('.history-row')).toHaveCount(2)
    mock.scenario.historyDelay = 0
    mock.scenario.historyBroken = true
    await page.getByRole('button', { name: '履歴を更新', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('試合履歴を取得できませんでした')
    await expect(page.locator('.history-row')).toHaveCount(0)
    mock.scenario.historyBroken = false
    mock.scenario.history.games.games = []
    await page.getByRole('button', { name: '履歴を更新', exact: true }).click()
    await expect(
      page.getByText('表示できる試合がありません。試合終了後に履歴を更新してください。'),
    ).toBeVisible()
    expect(mock.paths.every((path) => path.startsWith('GET '))).toBe(true)
  } finally {
    await app.close()
    await mock.close()
  }
})
