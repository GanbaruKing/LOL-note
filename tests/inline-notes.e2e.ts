import { test, expect, _electron as electron } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

test('notes edit in place and cancel only their own draft on matchup and champion pages', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'inline-notes-'))
  const env: Record<string, string> = Object.fromEntries(
    Object.entries({ ...process.env, NOTEBOOK_TEST_DATA_DIR: folder }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    await page.context().setOffline(true)
    for (const scope of ['matchup', 'champion']) {
      if (scope === 'champion') {
        await page.getByRole('button', { name: /Champions/ }).click()
        await page.getByRole('button', { name: 'Dariusの詳細を開く', exact: true }).click()
      }
      const notes = page.locator('#personal-notes')
      const otherDraft =
        scope === 'matchup'
          ? page.getByLabel('ビルドの補足')
          : page.getByLabel('Darius対策の内容', { exact: true })
      await notes.getByLabel('新しいメモ', { exact: true }).fill('元のメモ')
      await notes.getByRole('button', { name: '＋ メモを保存', exact: true }).click()
      const card = notes.locator('.note-card').first()
      await expect(card.locator('.note-body')).toHaveText('元のメモ')
      await otherDraft.fill('他の欄の未保存入力')
      await notes.getByLabel('新しいメモ', { exact: true }).fill('キャンセルする新規メモ')
      await notes.getByRole('button', { name: 'キャンセル', exact: true }).click()
      await expect(notes.getByLabel('新しいメモ', { exact: true })).toHaveValue('')
      await expect(otherDraft).toHaveValue('他の欄の未保存入力')
      await card.getByRole('button', { name: /メモ\d+を編集/ }).click()
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      await expect(card.getByLabel('メモを編集', { exact: true })).toHaveValue('元のメモ')
      await expect(notes.locator(':scope > .note-editor')).toHaveCount(0)
      await card.getByLabel('メモを編集', { exact: true }).fill('取り消す編集')
      await card.getByRole('button', { name: 'キャンセル', exact: true }).click()
      await expect(card.locator('.note-body')).toHaveText('元のメモ')
      await expect(otherDraft).toHaveValue('他の欄の未保存入力')
      await notes.getByLabel('新しいメモ', { exact: true }).fill('切り替え前の入力')
      await card.getByRole('button', { name: /メモ\d+を編集/ }).click()
      await page.getByRole('button', { name: '入力を続ける', exact: true }).click()
      await expect(notes.getByLabel('新しいメモ', { exact: true })).toHaveValue('切り替え前の入力')
      await card.getByRole('button', { name: /メモ\d+を編集/ }).click()
      await page.getByRole('button', { name: 'メモを破棄して編集', exact: true }).click()
      await expect(otherDraft).toHaveValue('他の欄の未保存入力')
      await card.getByLabel('メモを編集', { exact: true }).fill('その場で編集して保存')
      const lock = new DatabaseSync(join(folder, 'notebook.sqlite'))
      lock.exec('BEGIN IMMEDIATE')
      try {
        await card.getByRole('button', { name: '変更を保存', exact: true }).click()
        await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 })
        await expect(card.getByLabel('メモを編集', { exact: true })).toHaveValue(
          'その場で編集して保存',
        )
      } finally {
        lock.exec('ROLLBACK')
        lock.close()
      }
      await page.keyboard.press('Control+s')
      await expect(card.locator('.note-body')).toHaveText('その場で編集して保存')
      await expect(notes.locator('.note-card')).toHaveCount(1)
      await expect(
        page.getByRole('button', { name: 'ページの変更を保存', exact: true }),
      ).toBeDisabled()
      await card.getByRole('button', { name: /メモ\d+を編集/ }).click()
      await card.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `test-results/inline-${scope}.png` })
      await card.getByRole('button', { name: 'キャンセル', exact: true }).click()
    }
  } finally {
    await app.close()
  }
})
