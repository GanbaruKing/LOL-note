import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { NotebookRepository } from '../src/main/repository'
import catalog from '../resources/champions.json'

test('settings exports, cancels, rejects invalid backups and restores with a safety copy', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'backup-'))
  const backupPath = join(folder, 'export.json')
  const repo = new NotebookRepository(join(folder, 'notebook.sqlite'), catalog.champions)
  repo.saveChampionCounter({ championId: 122, body: '復元する対策' })
  repo.savePool({ championId: 86, role: 'TOP', confidence: 5 })
  repo.close()
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = folder
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: /Settings/ }).click()
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
    }, backupPath)
    await page.getByRole('button', { name: 'バックアップを保存', exact: true }).click()
    await expect(page.getByRole('status', { name: 'バックアップ処理結果' })).toContainText(
      '保存しました',
    )
    const saved = JSON.parse(readFileSync(backupPath, 'utf8'))
    expect(saved.tables.champion_counters[0].body).toBe('復元する対策')
    await page.evaluate(async () => {
      await window.notebook.saveChampionCounter({ championId: 122, body: '復元前の対策' })
      await window.notebook.removePool({ championId: 86, role: 'TOP' })
    })
    await page.getByRole('button', { name: 'バックアップから復元', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'バックアップから復元', exact: true }),
    ).toBeEnabled()
    expect(await page.evaluate(() => window.notebook.getChampionCounter(122))).toEqual({
      ok: true,
      data: '復元前の対策',
    })
    writeFileSync(backupPath, '{bad json')
    await page.getByRole('button', { name: 'バックアップから復元', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('有効なLOL Note')
    writeFileSync(backupPath, JSON.stringify(saved))
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    })
    // A safety-copy failure must prevent replacement of the current notebook.
    writeFileSync(join(folder, 'backups'), 'blocked directory')
    await page.getByRole('button', { name: 'バックアップから復元', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('データを読み書きできませんでした')
    expect(await page.evaluate(() => window.notebook.getChampionCounter(122))).toEqual({
      ok: true,
      data: '復元前の対策',
    })
    unlinkSync(join(folder, 'backups'))
    await page.getByRole('button', { name: 'バックアップから復元', exact: true }).click()
    await expect(page.getByRole('status', { name: 'バックアップ処理結果' })).toContainText(
      '復元しました',
    )
    const safetyPath = (
      await page.getByRole('status', { name: 'バックアップ処理結果' }).innerText()
    )
      .split('バックアップ：')[1]
      .trim()
    expect(JSON.parse(readFileSync(safetyPath, 'utf8')).tables.champion_counters[0].body).toBe(
      '復元前の対策',
    )
    // Documentation fixture: hide machine-specific paths without changing stored data.
    await page.locator('code').evaluate((node) => {
      node.textContent = '%APPDATA%/lol-matchup-companion/notebook.sqlite'
    })
    await page.getByRole('status', { name: 'バックアップ処理結果' }).evaluate((node) => {
      node.textContent =
        '復元しました。復元前のバックアップ：%APPDATA%/lol-matchup-companion/backups/before-restore-example.json'
    })
    await page.screenshot({ path: 'docs/screenshots/backup.png', fullPage: true })
    await page.getByRole('button', { name: /Match up/ }).click()
    await expect(page.getByText('復元する対策', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Garenを自分のチャンピオンに選択' }),
    ).toBeVisible()
  } finally {
    await app.close()
  }
})
