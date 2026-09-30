import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import data from '../resources/counter-notes.json'

test('curated picks work offline, filter by role and never seed or replace personal notes', async () => {
  mkdirSync('.test-data', { recursive: true })
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = mkdtempSync(resolve('.test-data', 'curated-'))
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    await page.context().setOffline(true)
    const panel = page.getByRole('region', { name: '初期カウンターメモ' })
    await expect(panel).toContainText('Dr. Mundo')
    expect(await page.evaluate(() => window.notebook.getChampionCounter(122))).toEqual({
      ok: true,
      data: '',
    })
    await page.evaluate(() =>
      window.notebook.saveChampionCounter({ championId: 122, body: '自分の対策を保持' }),
    )
    await page.getByLabel('ROLE', { exact: true }).selectOption('MID')
    await expect(panel).toContainText('まだ登録されていません')
    await expect(panel).not.toContainText('Dr. Mundo')
    await page.getByRole('button', { name: /Library/ }).click()
    await page.getByRole('button', { name: 'Dariusの詳細を開く', exact: true }).click()
    await expect(panel).toHaveCount(0)
    await expect(page.getByLabel('Darius対策の内容', { exact: true })).toHaveValue(
      '自分の対策を保持',
    )
    await page.getByRole('button', { name: /Match up/ }).click()
    await page.getByLabel('ROLE', { exact: true }).selectOption('TOP')
    await expect(panel).toContainText('Dr. Mundo')
    await app.evaluate(({ shell }) => {
      shell.openExternal = async (url) => {
        ;(globalThis as typeof globalThis & { counterSource?: string }).counterSource = url
      }
    })
    const source = data.entries.find((e) => e.championId === 122)!.sources[0].url
    await panel.locator('.curated-counter summary').first().click()
    await panel.getByRole('button', { name: 'OP.GG（現パッチ） ↗', exact: true }).first().click()
    await expect
      .poll(() =>
        app.evaluate(
          () => (globalThis as typeof globalThis & { counterSource?: string }).counterSource,
        ),
      )
      .toBe(source)
    for (const url of ['file:///C:/Windows', 'https://example.com/', `${source}#unlisted`]) {
      expect(
        await page.evaluate((value) => window.notebook.openCounterSource(value), url),
      ).toMatchObject({ ok: false })
    }
    expect(
      await app.evaluate(
        () => (globalThis as typeof globalThis & { counterSource?: string }).counterSource,
      ),
    ).toBe(source)
    await page.screenshot({ path: 'docs/screenshots/curated-counters.png', fullPage: true })
  } finally {
    await app.close()
  }
})
