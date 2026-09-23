import { test, expect, _electron as electron } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { resolve } from 'node:path'

test('search, return navigation and counter shortcuts preserve the writing flow', async () => {
  mkdirSync('.test-data', { recursive: true })
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = mkdtempSync(resolve('.test-data', 'usability-'))
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('.opponent-heading')).toContainText('vs Darius')
    await expect(page.locator('.own-pick-context button')).toHaveCount(0)
    await expect(page.locator('#difficulty')).toHaveCount(0)
    await expect(page.locator('.nav-count')).toHaveCount(0)
    await page.getByRole('button', { name: '自分のチャンピオンを選択' }).click()
    const search = page.getByLabel('自分のチャンピオンを検索')
    await search.fill('がれん')
    await search.press('Enter')
    await expect(page.getByRole('button', { name: '自分のチャンピオンを選択' })).toContainText(
      'Garen',
    )
    await page.getByRole('button', { name: '自分のチャンピオンを選択' }).click()
    await search.fill('Ａ')
    const second = await page.locator('.picker-results button').nth(1).innerText()
    await search.press('ArrowDown')
    await search.press('Enter')
    await expect(page.getByRole('button', { name: '自分のチャンピオンを選択' })).toContainText(
      second.split('\n')[0],
    )
    await page.getByRole('button', { name: /Champions/ }).click()
    await page.getByLabel('チャンピオン一覧を検索').fill('だりうす')
    await page
      .getByRole('group', { name: '一覧のレーン' })
      .getByRole('button', { name: 'TOP', exact: true })
      .click()
    await page.getByRole('button', { name: 'Dariusの詳細を開く', exact: true }).click()
    await page.getByRole('button', { name: '← チャンピオン一覧に戻る' }).click()
    await expect(page.getByLabel('チャンピオン一覧を検索')).toHaveValue('だりうす')
    await expect(
      page
        .getByRole('group', { name: '一覧のレーン' })
        .getByRole('button', { name: 'TOP', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Dariusの詳細を開く', exact: true }).click()
    await expect(page.getByRole('region', { name: '初期カウンターメモ' })).toHaveCount(0)
    await page.getByRole('button', { name: /Match up/ }).click()
    const editor = page.getByLabel('新しいメモ', { exact: true })
    await editor.click()
    await editor.fill('途中のメモを保持')
    await page.getByRole('button', { name: 'Dr. Mundoで対面メモを開く' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: '編集を続ける', exact: true }).click()
    await expect(editor).toHaveValue('途中のメモを保持')
    await editor.press('Control+Enter')
    await expect(page.locator('.note-body')).toHaveText('途中のメモを保持')
    await page.getByRole('button', { name: 'Dr. Mundoで対面メモを開く' }).click()
    await expect(page.getByRole('button', { name: '自分のチャンピオンを選択' })).toContainText(
      'Dr. Mundo',
    )
    await expect(page.getByRole('button', { name: '相手のチャンピオンを選択' })).toContainText(
      'Darius',
    )
    await expect(page.getByLabel('ROLE', { exact: true })).toHaveValue('TOP')
    await page.setViewportSize({ width: 1000, height: 720 })
    await editor.click()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await expect(editor).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: 'docs/screenshots/usability-compact.png' })
  } finally {
    await app.close()
  }
})
