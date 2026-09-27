import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

test('champion page saves notes and counters together and shares counters across matchups', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'counters-'))
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = folder
  let app = await electron.launch({ args: [resolve('.')], env })
  try {
    let page = await app.firstWindow()
    await page.context().setOffline(true)
    await page.getByRole('button', { name: /Champions/ }).click()
    await page.getByRole('button', { name: 'Dariusの詳細を開く', exact: true }).click()
    const counter = page.getByLabel('Darius対策の内容', { exact: true })
    await counter.fill('Qの外側に当たらない。\nパッシブが溜まったら離れる。')
    await page.getByLabel('新しいメモ', { exact: true }).fill('Darius自身のコンボ')
    await page.getByRole('button', { name: '＋ メモを保存', exact: true }).click()
    await expect(counter).toHaveValue(/パッシブ/)
    await expect(
      page.getByRole('button', { name: 'ページの変更を保存', exact: true }),
    ).toBeDisabled()
    await counter.fill('Qの外側に当たらない。追加')
    await page.getByLabel('新しいメモ', { exact: true }).fill('ページ単位で追加したメモ')
    await page.getByRole('button', { name: 'ページの変更を保存', exact: true }).click()
    await expect(page.getByLabel('新しいメモ', { exact: true })).toHaveValue('')
    await expect(page.locator('.note-body')).toContainText([
      'ページ単位で追加したメモ',
      'Darius自身のコンボ',
    ])
    // Failed writes retain counter input and can be retried after the DB lock is released.
    await counter.fill('Qの外側に当たらない。\n5スタックになったら離れる。')
    const lock = new DatabaseSync(join(folder, 'notebook.sqlite'))
    lock.exec('BEGIN IMMEDIATE')
    try {
      await page.getByRole('button', { name: '対策を保存', exact: true }).click()
      await expect(page.getByRole('alert')).toContainText('データを読み書きできませんでした', {
        timeout: 10000,
      })
      await expect(counter).toHaveValue(/5スタック/)
    } finally {
      lock.exec('ROLLBACK')
      lock.close()
    }
    await page.getByRole('button', { name: '対策を保存', exact: true }).click()
    await expect(page.getByLabel('チャンピオン対策の編集')).toContainText('保存済み')
    await counter.fill('破棄する変更')
    await page.getByRole('button', { name: '← チャンピオン一覧に戻る' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: '編集を続ける', exact: true }).click()
    await expect(counter).toHaveValue('破棄する変更')
    await page.getByRole('button', { name: '← チャンピオン一覧に戻る' }).click()
    await page.getByRole('button', { name: '変更を破棄して移動', exact: true }).click()
    await page.getByRole('button', { name: 'Dariusの詳細を開く', exact: true }).click()
    await expect(counter).toHaveValue(/5スタック/)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'docs/screenshots/champion-counters.png', fullPage: true })
    await page.getByRole('button', { name: /Match up/ }).click()
    const shared = page.getByLabel('敵チャンピオンの対策')
    await expect(shared).toContainText('5スタック')
    await expect(shared).not.toContainText('Darius自身のコンボ')
    await page.getByRole('button', { name: '自分のチャンピオンを選択' }).click()
    await page.getByLabel('自分のチャンピオンを検索').fill('Garen')
    await page.locator('.picker-results').getByRole('button', { name: /Garen/ }).click()
    await page.getByLabel('ROLE', { exact: true }).selectOption('MID')
    await expect(shared).toContainText('5スタック')
    await page.screenshot({ path: 'docs/screenshots/matchup-counters.png', fullPage: true })
    await page.getByRole('button', { name: '相手のチャンピオンを選択' }).click()
    await page.getByLabel('相手のチャンピオンを検索').fill('Ahri')
    await page.locator('.picker-results').getByRole('button', { name: /Ahri/ }).click()
    await expect(shared).toContainText('Ahri対策')
    await expect(shared).not.toContainText('5スタック')
    await app.close()
    app = await electron.launch({ args: [resolve('.')], env })
    page = await app.firstWindow()
    await expect(page.getByLabel('敵チャンピオンの対策')).toContainText('5スタック')
    await page.getByRole('button', { name: /Champions/ }).click()
    await page.getByRole('button', { name: 'Dariusの詳細を開く', exact: true }).click()
    await page.getByLabel('Darius対策の内容').fill('')
    await page.getByRole('button', { name: '対策を保存', exact: true }).click()
    await expect(page.getByLabel('チャンピオン対策の編集')).toContainText('保存済み')
    await expect(page.locator('.note-body')).toContainText([
      'ページ単位で追加したメモ',
      'Darius自身のコンボ',
    ])
    await page.getByRole('button', { name: /Match up/ }).click()
    await expect(page.getByLabel('敵チャンピオンの対策')).toContainText('対策はまだありません')
  } finally {
    await app.close()
  }
})
