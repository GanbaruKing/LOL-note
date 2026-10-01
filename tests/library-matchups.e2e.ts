import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { NotebookRepository } from '../src/main/repository'
import catalog from '../resources/champions.json'

test('library lists only written matchups in opponent A-Z order and searches names and text', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'library-matchups-'))
  const repo = new NotebookRepository(join(folder, 'notebook.sqlite'), catalog.champions)
  const key = { myChampionId: 266, enemyChampionId: 122, role: 'TOP' }
  repo.addNote({ key, category: 'General', body: '外側のQを避ける' })
  repo.addNote({
    key: { ...key, enemyChampionId: 62 },
    category: 'General',
    body: 'ウェーブを引く',
  })
  repo.addNote({
    key: { ...key, enemyChampionId: 103, role: 'MID' },
    category: 'General',
    body: 'チャームを避ける',
  })
  repo.saveOverview({
    key: { ...key, enemyChampionId: 14 },
    overview: { difficulty: 'Unset', rating: 4 },
  })
  const deleted = repo.addNote({
    key: { ...key, enemyChampionId: 86 },
    category: 'General',
    body: '削除予定',
  })
  repo.deleteNote({ key: { ...key, enemyChampionId: 86 }, id: deleted.notes[0].id })
  repo.close()
  const env: Record<string, string> = Object.fromEntries(
    Object.entries({ ...process.env, NOTEBOOK_TEST_DATA_DIR: folder }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [resolve('.')], env })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: /Library/ }).click()
    await page.getByRole('button', { name: 'Aatroxの詳細を開く', exact: true }).click()
    const panel = page.getByLabel('チャンピオンの対面メモ一覧')
    const names = panel.locator('.champion-matchup-card h3')
    await expect(names).toHaveText(['vs Ahri', 'vs Darius', 'vs Wukong'])
    await expect(panel).not.toContainText('まだ対面メモはありません')
    await panel.getByLabel('対面メモを検索').fill('だりうす')
    await expect(names).toHaveText(['vs Darius'])
    await panel.getByLabel('対面メモを検索').fill('ＷＵＫＯＮＧ ウェーブ')
    await expect(names).toHaveText(['vs Wukong'])
    await panel.getByLabel('対面メモを検索').fill('チャーム')
    await expect(names).toHaveText(['vs Ahri'])
    await panel.getByRole('button', { name: 'TOP', exact: true }).click()
    await expect(names).toHaveCount(0)
    await expect(panel).toContainText('条件に一致する対面メモはありません')
    await panel.getByLabel('対面メモを検索').fill('')
    await expect(names).toHaveText(['vs Darius', 'vs Wukong'])
    await panel.getByRole('button', { name: 'すべて', exact: true }).click()
    await panel.screenshot({ path: 'test-results/library-matchups.png' })
  } finally {
    await app.close()
  }
})
