import { test, expect, _electron as electron } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { NotebookRepository } from '../src/main/repository'
import catalog from '../resources/champions.json'
import { emptyLoadout } from '../src/shared/loadout'
import { createMockLcu } from './mock-lcu'
const key = { myChampionId: 266, enemyChampionId: 122, role: 'TOP' as const }
function setup() {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'improvements-'))
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = folder
  return { folder, env }
}
test('all-store search opens the correct article, counter and build; delete can be undone', async () => {
  const { folder, env } = setup()
  const r = new NotebookRepository(join(folder, 'notebook.sqlite'), catalog.champions)
  r.saveChampionCounter({ championId: 122, body: '共通対策の識別子' })
  r.saveKnowledgeBook({
    chapters: [],
    articles: [
      {
        id: 'unrelated',
        chapterId: null,
        title: '別の記事',
        body: '別本文',
        favorite: false,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'target',
        chapterId: null,
        title: 'ウェーブの目標',
        body: '検索から直接開く本文',
        favorite: false,
        updatedAt: new Date().toISOString(),
      },
    ],
  })
  r.saveLoadout({ key, loadout: { ...emptyLoadout(), buildNotes: '購入判断の識別子' } })
  r.addNote({ key, category: 'General', body: '削除して復元する記録', verifiedPatch: '16.18' })
  r.close()
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: /Search/ }).click()
    await page.getByLabel('メモ横断検索').fill('うぇーぶ')
    await expect(page.locator('.search-hit')).toHaveCount(1)
    await page.getByRole('button', { name: 'ノートを開く →' }).click()
    await expect(page.getByLabel('記事のタイトル')).toHaveValue('ウェーブの目標')
    await expect(page.getByLabel('記事の本文')).toHaveValue('検索から直接開く本文')
    await page.getByRole('button', { name: /Search/ }).click()
    await page.getByLabel('メモ横断検索').fill('共通対策の識別子')
    await page.getByRole('button', { name: 'ノートを開く →' }).click()
    await expect(page.locator('#counter-body')).toHaveValue('共通対策の識別子')
    await page.getByRole('button', { name: /Search/ }).click()
    await page.getByLabel('メモ横断検索').fill('購入判断')
    await page.getByRole('button', { name: 'ノートを開く →' }).click()
    await expect(page.getByLabel('ビルドの補足')).toHaveValue('購入判断の識別子')
    await expect(page.locator('.verified-patch')).toContainText('16.18')
    await page.getByRole('button', { name: /メモ\d+を削除/ }).click()
    await page.getByRole('button', { name: '削除する', exact: true }).click()
    await expect(page.locator('.note-card')).toHaveCount(0)
    await page.getByRole('button', { name: '削除を取り消す', exact: true }).click()
    await expect(page.locator('.note-card')).toContainText('削除して復元する記録')
    await page.setViewportSize({ width: 1000, height: 720 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'docs/screenshots/improvements.png', fullPage: true })
  } finally {
    await app.close()
  }
})
test('templates copy explicitly and unsaved notes and builds survive restarting Electron', async () => {
  const { env } = setup()
  let app = await electron.launch({ args: [resolve('.')], env })
  try {
    let page = await app.firstWindow()
    await page.getByLabel('ビルドの補足').fill('雛形の内容')
    await page.getByRole('button', { name: '現在の内容を共通の雛形に保存' }).click()
    await page.getByRole('button', { name: '実行する', exact: true }).click()
    await expect(page.getByRole('button', { name: '共通の雛形からコピー' })).toBeEnabled()
    await page.getByLabel('ビルドの補足').fill('置換前')
    await page.getByRole('button', { name: '共通の雛形からコピー' }).click()
    await page.getByRole('button', { name: '実行する', exact: true }).click()
    await expect(page.getByLabel('ビルドの補足')).toHaveValue('雛形の内容')
    await page.getByLabel('新しいメモ', { exact: true }).fill('再起動後に復元する下書き')
    await page.getByLabel('確認パッチ', { exact: true }).fill('16.18')
    await expect
      .poll(() =>
        page.evaluate(
          () => Object.keys(localStorage).filter((k) => k.startsWith('riftnote:draft:')).length,
        ),
      )
      .toBe(2)
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      w.webContents.session.flushStorageData()
      w.destroy()
    })
    await app.close()
    app = await electron.launch({ args: [resolve('.')], env })
    page = await app.firstWindow()
    await page.getByRole('button', { name: '下書きを復元', exact: true }).click()
    await page.getByRole('button', { name: 'ビルドの下書きを復元', exact: true }).click()
    await expect(page.getByLabel('新しいメモ', { exact: true })).toHaveValue(
      '再起動後に復元する下書き',
    )
    await expect(page.getByLabel('確認パッチ', { exact: true })).toHaveValue('16.18')
    await expect(page.getByLabel('ビルドの補足')).toHaveValue('雛形の内容')
    await page.getByRole('button', { name: 'ページの変更を保存', exact: true }).click()
    await expect(page.locator('.note-card')).toContainText('再起動後に復元する下書き')
    await expect
      .poll(() =>
        page.evaluate(
          () => Object.keys(localStorage).filter((k) => k.startsWith('riftnote:draft:')).length,
        ),
      )
      .toBe(0)
  } finally {
    await app.close()
  }
})
test('live selection prioritizes saved knowledge, and history links to recorded reviews', async () => {
  const { folder, env } = setup()
  const mock = await createMockLcu(join(folder, 'league'))
  mock.scenario.phase = 'ChampSelect'
  const r = new NotebookRepository(join(folder, 'notebook.sqlite'), catalog.champions)
  r.setLeagueFolder(join(folder, 'league'))
  r.saveChampionCounter({ championId: 122, body: '読みたい共通対策' })
  r.saveLoadout({ key, loadout: { ...emptyLoadout(), buildNotes: '試合前ビルド' } })
  r.addNote({
    key,
    category: '振り返り',
    body: '日付：2026/10/12\nゲームID：12345\n\nこの試合の記録',
  })
  r.close()
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Champ Selectを開く →' }).click()
    await page.getByRole('button', { name: 'Darius', exact: true }).click()
    await expect(page.locator('.select-notes')).toContainText('読みたい共通対策')
    await expect(page.locator('.select-notes')).toContainText('試合前ビルド')
    const notes = await page.locator('.select-notes').boundingBox()
    const picks = await page.locator('.my-picks').boundingBox()
    if (picks) expect(notes!.y).toBeLessThan(picks.y)
    await page.getByRole('button', { name: /Match History/ }).click()
    await expect(page.locator('.history-row').first()).toContainText('記入済み')
    await page.locator('.history-row').first().click()
    await page.getByRole('button', { name: 'この試合の既存メモを開く' }).click()
    await expect(page.locator('.note-card')).toContainText('この試合の記録')
    await expect(page.getByLabel('新しいメモ', { exact: true })).toHaveValue('')
  } finally {
    await app.close()
    await mock.close()
  }
})

test('notebook deletion restores one article and pending drafts survive renderer loss', async () => {
  const { folder, env } = setup()
  const r = new NotebookRepository(join(folder, 'notebook.sqlite'), catalog.champions)
  r.saveKnowledgeBook({
    chapters: [],
    articles: [
      {
        id: 'recoverable',
        chapterId: null,
        title: '復元対象の記事',
        body: '保存済みの本文',
        favorite: false,
        updatedAt: new Date().toISOString(),
      },
    ],
  })
  r.close()
  let app = await electron.launch({ args: [resolve('.')], env })
  try {
    let page = await app.firstWindow()
    await page.getByRole('button', { name: /Notebook/ }).click()
    await expect(page.getByLabel('記事の本文')).toHaveValue('保存済みの本文')
    await page.getByRole('button', { name: '記事を削除', exact: true }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: '削除する', exact: true })
      .click()
    await expect(page.getByRole('status', { name: 'Notebook保存状態' })).toHaveText(
      'すべて保存済み',
    )
    await page.locator('.book-trash summary').click()
    await page.getByRole('button', { name: '記事を復元', exact: true }).click()
    await expect(page.getByLabel('記事の本文')).toHaveValue('保存済みの本文')
    // Pause auto-save by failing the write, then verify the independent recovery copy.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('notebook:saveKnowledgeBook')
      ipcMain.handle('notebook:saveKnowledgeBook', () => ({ ok: false, error: '保存失敗のテスト' }))
    })
    await page.getByLabel('記事の本文').fill('退避した記事本文')
    await page.getByRole('button', { name: '今すぐ保存', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('保存失敗のテスト')
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      w.webContents.session.flushStorageData()
      w.destroy()
    })
    await app.close()
    app = await electron.launch({ args: [resolve('.')], env })
    page = await app.firstWindow()
    await page.getByRole('button', { name: 'Notebookの下書きを開く', exact: true }).click()
    await page.getByRole('button', { name: 'Notebookの下書きを復元', exact: true }).click()
    await expect(page.getByLabel('記事の本文')).toHaveValue('退避した記事本文')
    await expect(page.getByRole('status', { name: 'Notebook保存状態' })).toHaveText(
      'すべて保存済み',
    )
  } finally {
    await app.close()
  }
})

test('recovering an old edit does not overwrite a note changed since the draft', async () => {
  const { folder, env } = setup()
  const r = new NotebookRepository(join(folder, 'notebook.sqlite'), catalog.champions)
  r.addNote({ key, category: 'General', body: '新しい保存内容' })
  r.close()
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('.note-card')).toContainText('新しい保存内容')
    await page.evaluate(() =>
      localStorage.setItem(
        'riftnote:draft:v1:note:266:122:TOP',
        JSON.stringify({
          value: {
            body: '古い編集の下書き',
            category: 'General',
            reviewInfo: null,
            verifiedPatch: '',
            editingId: 1,
            editingUpdatedAt: '2020-01-01T00:00:00Z',
            editingBody: '古い保存内容',
          },
          updatedAt: new Date().toISOString(),
        }),
      ),
    )
    await page.reload()
    await page.getByRole('button', { name: '下書きを復元', exact: true }).click()
    await page.getByRole('button', { name: '＋ メモを保存', exact: true }).click()
    await expect(page.locator('.note-card')).toHaveCount(2)
    await expect(page.locator('.notes-content')).toContainText('新しい保存内容')
    await expect(page.locator('.notes-content')).toContainText('古い編集の下書き')
  } finally {
    await app.close()
  }
})
