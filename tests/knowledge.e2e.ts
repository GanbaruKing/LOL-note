import { test, expect, _electron as electron } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

test('notebook creates chapters, autosaves articles, protects failed writes and survives restart', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'book-'))
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = folder
  let app = await electron.launch({ args: [resolve('.')], env })
  try {
    let page = await app.firstWindow()
    await page.context().setOffline(true)
    await page.getByRole('button', { name: /Notebook/, exact: false }).click()
    await expect(page.getByText('自分だけの、LoLの教科書。')).toHaveCount(0)
    await page.getByRole('button', { name: '＋ 章を作成' }).click()
    await page.getByLabel('章の名前').fill('レーン戦の基礎')
    await page.getByRole('button', { name: '決定', exact: true }).click()
    await page.getByRole('button', { name: '＋ 記事', exact: true }).click()
    await page.getByLabel('記事のタイトル').fill('ウェーブ管理の考え方')
    const body =
      '## リコール前に確認すること\n- 次のウェーブの位置\n- 相手が戻ってくる時間\n\n> 目的を決めてから、ウェーブを触る。\n\n## 次の試合で意識すること\n- [ ] 味方ジャングラーの位置を見る\n- [x] 体力とマナを確認する\n\n<script>window.unsafe = true</script>'
    await page.getByLabel('記事の本文').fill(body)
    await page.getByRole('button', { name: '☆ お気に入り', exact: true }).click()
    await expect(page.getByRole('status', { name: 'Notebook保存状態' })).toHaveText(
      'すべて保存済み',
    )
    await page.getByRole('button', { name: '読む', exact: true }).click()
    await expect(page.locator('.book-prose h3').first()).toHaveText('リコール前に確認すること')
    await expect(page.locator('.book-prose')).toContainText('<script>')
    expect(await page.evaluate(() => 'unsafe' in window)).toBe(false)
    await page.getByRole('button', { name: '編集', exact: true }).click()
    await page.getByLabel('記事の本文').fill(body.split('\n\n<script>')[0])
    await expect(page.getByRole('status', { name: 'Notebook保存状態' })).toHaveText(
      'すべて保存済み',
    )
    await page.getByRole('button', { name: '読む', exact: true }).click()
    await page.screenshot({ path: 'docs/screenshots/knowledge-book.png', fullPage: true })
    await page.getByLabel('Notebookを検索').fill('リコール')
    await expect(
      page.getByRole('button', { name: 'ウェーブ管理の考え方を開く', exact: true }),
    ).toBeVisible()
    await page.getByLabel('Notebookを検索').fill('見つからない言葉')
    await expect(page.getByText('一致する記事はありません。')).toBeVisible()
    await page.getByLabel('Notebookを検索').fill('')
    await page.getByRole('button', { name: '編集', exact: true }).click()
    // SQLite lock causes a real failure. The draft remains available for retry.
    const lock = new DatabaseSync(join(folder, 'notebook.sqlite'))
    lock.exec('BEGIN IMMEDIATE')
    try {
      await page.getByLabel('記事の本文').fill('失敗しても保持する本文')
      await page.getByRole('button', { name: '今すぐ保存' }).click()
      await expect(page.getByRole('alert')).toContainText('入力はこの画面に残っています', {
        timeout: 10000,
      })
      await expect(page.getByLabel('記事の本文')).toHaveValue('失敗しても保持する本文')
      await page.getByRole('button', { name: /Match up/ }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await page.getByRole('button', { name: '編集を続ける' }).click()
    } finally {
      lock.exec('ROLLBACK')
      lock.close()
    }
    await page.getByRole('button', { name: '今すぐ保存' }).click()
    await expect(page.getByRole('status', { name: 'Notebook保存状態' })).toHaveText(
      'すべて保存済み',
    )
    await app.close()
    app = await electron.launch({ args: [resolve('.')], env })
    page = await app.firstWindow()
    await page.getByRole('button', { name: /Notebook/, exact: false }).click()
    await expect(page.getByLabel('記事の本文')).toHaveValue('失敗しても保持する本文')
    await page.getByRole('button', { name: /レーン戦の基礎/ }).click()
    await page.getByRole('button', { name: '章を削除', exact: true }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: '削除する', exact: true })
      .click()
    await expect(page.getByLabel('記事の章')).toHaveValue('')
    await expect(page.getByRole('status', { name: 'Notebook保存状態' })).toHaveText(
      'すべて保存済み',
    )
    await page.setViewportSize({ width: 1000, height: 720 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'docs/screenshots/knowledge-book-compact.png', fullPage: true })
  } finally {
    await app.close()
  }
})
