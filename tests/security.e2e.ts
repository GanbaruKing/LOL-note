import { test, expect, _electron as electron } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'

test('renderer isolation, untrusted IPC, stored HTML and network restrictions', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'security-'))
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  env.NOTEBOOK_TEST_DATA_DIR = folder
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('button', { name: /Settings/ })).toBeVisible()
    expect(
      await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
    ).toBe('undefined')
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents as unknown as {
        getLastWebPreferences(): {
          sandbox: boolean
          contextIsolation: boolean
          nodeIntegration: boolean
        }
      }
      const p = contents.getLastWebPreferences()
      return {
        sandbox: p.sandbox,
        contextIsolation: p.contextIsolation,
        nodeIntegration: p.nodeIntegration,
      }
    })
    expect(prefs).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false })
    expect(
      await page.evaluate(() =>
        window.notebook.openCounterSource('file:///C:/Windows/System32/cmd.exe'),
      ),
    ).toMatchObject({ ok: false })
    expect(
      await page.evaluate(() => window.notebook.openCounterSource('https://example.com/')),
    ).toMatchObject({ ok: false })
    expect(
      await page.evaluate(async () => {
        try {
          await fetch('https://example.com/')
          return 'allowed'
        } catch {
          return 'blocked'
        }
      }),
    ).toBe('blocked')
    const body =
      '<img src=x onerror="window.__injected=true"><script>window.__injected=true</script>'
    await page.evaluate(async (body) => {
      await window.notebook.addChampionNote({ championId: 266, category: 'General', body })
    }, body)
    await page.getByRole('button', { name: /Search/ }).click()
    await page.getByLabel('メモ横断検索').fill('__injected')
    await expect(page.locator('.search-hit')).toContainText('<img')
    expect(await page.evaluate(() => '__injected' in window)).toBe(false)
    const result = await app.evaluate(
      async ({ BrowserWindow }, preload) => {
        const other = new BrowserWindow({
          show: false,
          webPreferences: {
            preload,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        })
        try {
          await other.loadURL('about:blank')
          return await other.webContents.executeJavaScript('window.notebook.listChampions()')
        } finally {
          other.destroy()
        }
      },
      join(resolve('.'), 'out/preload/index.js'),
    )
    expect(result).toMatchObject({ ok: false, error: '許可されていないリクエストです。' })
  } finally {
    await app.close()
  }
})
