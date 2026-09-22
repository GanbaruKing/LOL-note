import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import appConfig from '../electron.vite.config'

test('gallery opens details and lane pools persist with independent confidence', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'pool-'))
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = join(folder, 'fresh-profile')
  const launch = () => electron.launch({ args: [resolve('.')], env })
  let app = await launch()
  try {
    let page = await app.firstWindow()
    expect(
      await app.evaluate(({ app }) => ({
        data: app.getPath('userData'),
        session: app.getPath('sessionData'),
      })),
    ).toEqual({ data: env.NOTEBOOK_TEST_DATA_DIR, session: env.NOTEBOOK_TEST_DATA_DIR })
    await page.context().setOffline(true)
    await page.getByRole('button', { name: /Champions/ }).click()
    await expect(page.locator('.library-card')).toHaveCount(173)
    const lanes = page.getByRole('group', { name: '一覧のレーン', exact: true })
    await lanes.getByRole('button', { name: 'TOP', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Aatroxの詳細を開く', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ahriの詳細を開く', exact: true })).toHaveCount(0)
    await page.getByLabel('チャンピオン一覧を検索').fill('アーリ')
    await expect(page.locator('.library-card')).toHaveCount(0)
    await lanes.getByRole('button', { name: 'MID', exact: true }).click()
    await expect(page.locator('.library-card')).toHaveCount(1)
    await page.getByLabel('チャンピオン一覧を検索').fill('')
    await lanes.getByRole('button', { name: 'All', exact: true }).click()
    await expect(page.locator('.library-card')).toHaveCount(173)
    await expect(page.getByRole('heading', { name: 'Champion Notes' })).toHaveCount(0)
    await page.getByRole('button', { name: 'AatroxをTOPに登録', exact: true }).click()
    await page.getByLabel('AatroxのTOP自信度').selectOption('5')
    await page
      .getByRole('group', { name: 'プールのレーン' })
      .getByRole('button', { name: /MID/ })
      .click()
    await expect(page.locator('.pool-card')).toHaveCount(0)
    await page.getByRole('button', { name: 'AatroxをMIDに登録', exact: true }).click()
    await page.getByLabel('AatroxのMID自信度').selectOption('2')
    await page
      .getByRole('group', { name: 'プールのレーン' })
      .getByRole('button', { name: /TOP/ })
      .click()
    await expect(page.getByLabel('AatroxのTOP自信度')).toHaveValue('5')
    await page.getByRole('button', { name: 'GarenをTOPに登録', exact: true }).click()
    await expect(page.locator('.pool-card')).toHaveCount(2)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'docs/screenshots/champion-library.png' })
    await page.getByRole('button', { name: 'Aatroxの詳細を開く', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Champion Notes' })).toBeVisible()
    await app.close()
    app = await launch()
    page = await app.firstWindow()
    await page.getByRole('button', { name: /Champions/ }).click()
    await expect(page.getByLabel('AatroxのTOP自信度')).toHaveValue('5')
    await page.getByRole('button', { name: 'AatroxをTOPから解除', exact: true }).click()
    await expect(page.getByLabel('AatroxのTOP自信度')).toHaveCount(0)
    await page
      .getByRole('group', { name: 'プールのレーン' })
      .getByRole('button', { name: /MID/ })
      .click()
    await expect(page.getByLabel('AatroxのMID自信度')).toHaveValue('2')
  } finally {
    await app.close()
  }
})

test('Champions focuses on standalone notes and lists its existing matchup notes', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'champions-'))
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = folder
  const launch = () => electron.launch({ args: [resolve('.')], env })
  let app = await launch()
  try {
    let page = await app.firstWindow()
    await page.context().setOffline(true)
    await expect(page.getByRole('button', { name: /Match up/ })).toBeVisible()
    await expect(page.getByText('前の試合の気づきを。', { exact: true })).toHaveCount(0)
    await page.getByLabel('新しいメモ', { exact: true }).fill('ダリウス対面のメモ')
    await page.getByRole('button', { name: '＋ メモを保存', exact: true }).click()
    await expect(page.locator('.note-body')).toHaveText('ダリウス対面のメモ')
    await expect(page.getByText('RECENTLY UPDATED', { exact: true })).toHaveCount(0)
    await expect(
      page.locator('.matchup-picks').getByRole('heading', { name: 'Comfort Picks' }),
    ).toBeVisible()
    await page.getByRole('button', { name: /Champions/ }).click()
    await page.getByRole('button', { name: 'Aatroxの詳細を開く', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Champion Notes', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '相手のチャンピオンを選択' })).toHaveCount(0)
    await expect(page.getByLabel('チャンピオンの対面メモ一覧')).toContainText('ダリウス対面のメモ')
    await page
      .getByRole('group', { name: '対面メモのレーン' })
      .getByRole('button', { name: 'MID', exact: true })
      .click()
    await expect(page.locator('.champion-matchup-card')).toHaveCount(0)
    await page
      .getByRole('group', { name: '対面メモのレーン' })
      .getByRole('button', { name: 'TOP', exact: true })
      .click()
    await expect(page.locator('.champion-matchup-card')).toHaveCount(1)
    await page.getByLabel('新しいメモ', { exact: true }).fill('QとEのコンボを練習する')
    await page.getByRole('button', { name: '＋ メモを保存', exact: true }).click()
    await expect(page.locator('.note-body')).toHaveText('QとEのコンボを練習する')
    await page.getByRole('button', { name: /メモ\d+を編集/ }).click()
    await page.getByLabel('メモを編集', { exact: true }).fill('基本コンボとパッシブを意識する')
    await page.getByRole('button', { name: '変更を保存', exact: true }).click()
    await expect(page.locator('.note-body')).toHaveText('基本コンボとパッシブを意識する')
    await page.getByLabel('新しいメモ', { exact: true }).fill('未保存の単体メモ')
    await page.getByRole('button', { name: '← チャンピオン一覧に戻る' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: '編集を続ける', exact: true }).click()
    await expect(page.getByLabel('新しいメモ', { exact: true })).toHaveValue('未保存の単体メモ')
    await page.getByRole('button', { name: '← チャンピオン一覧に戻る' }).click()
    await page.getByRole('button', { name: '変更を破棄して移動' }).click()
    await page.getByLabel('チャンピオン一覧を検索').fill('ガレン')
    await page.getByRole('button', { name: 'Garenの詳細を開く', exact: true }).click()
    await expect(page.locator('.champion-header')).toContainText('Garen')
    await expect(page.locator('.note-body')).toHaveCount(0)
    await expect(page.getByLabel('チャンピオンの対面メモ一覧')).not.toContainText(
      'ダリウス対面のメモ',
    )
    await page.getByRole('button', { name: '← チャンピオン一覧に戻る' }).click()
    await expect(page.getByLabel('チャンピオン一覧を検索')).toHaveValue('ガレン')
    await page.getByRole('button', { name: '検索・絞り込みをクリア' }).click()
    await page.getByRole('button', { name: 'Aatroxの詳細を開く', exact: true }).click()
    await expect(page.locator('.note-body')).toHaveText('基本コンボとパッシブを意識する')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'docs/screenshots/champions.png', fullPage: true })
    await page.getByRole('button', { name: '対面ページを開く →' }).click()
    await expect(page.getByRole('heading', { name: 'Match up', exact: true })).toBeVisible()
    await expect(page.locator('.note-body')).toHaveText('ダリウス対面のメモ')
    await app.close()
    app = await launch()
    page = await app.firstWindow()
    await page.getByRole('button', { name: /Champions/ }).click()
    await page.getByRole('button', { name: 'Aatroxの詳細を開く', exact: true }).click()
    await expect(page.locator('.note-body')).toHaveText('基本コンボとパッシブを意識する')
    await page.getByRole('button', { name: /メモ\d+を削除/ }).click()
    await page.getByRole('button', { name: '削除する', exact: true }).click()
    await expect(page.locator('.note-body')).toHaveCount(0)
    await expect(page.getByLabel('チャンピオンの対面メモ一覧')).toContainText('ダリウス対面のメモ')
  } finally {
    await app.close()
  }
})

test('offline Electron notebook: CRUD, isolation, validation and restart persistence', async () => {
  mkdirSync('.test-data', { recursive: true })
  const folder = mkdtempSync(resolve('.test-data', 'e2e-'))
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  env.NOTEBOOK_TEST_DATA_DIR = folder
  delete env.ELECTRON_RUN_AS_NODE
  const launch = () => electron.launch({ args: [resolve('.')], env })
  let app = await launch()
  try {
    let page = await app.firstWindow()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.context().setOffline(true)
    await expect(page.getByRole('heading', { name: 'Match up', exact: true })).toBeVisible()
    await expect(page.getByLabel('新しいメモ', { exact: true })).toBeEnabled()
    expect(
      await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require),
    ).toBe('undefined')
    await page.getByLabel('新しいメモ', { exact: true }).fill('DariusのQを見てから距離を調整する。')
    await page.getByLabel('メモのカテゴリー').selectOption('Trading')
    await page.getByRole('button', { name: '＋ メモを保存', exact: true }).click()
    await expect(page.locator('.note-body')).toHaveText('DariusのQを見てから距離を調整する。')
    await page.getByLabel('難易度', { exact: true }).selectOption('Hard')
    await page.getByRole('button', { name: '評価4', exact: true }).click()
    await expect(page.getByRole('button', { name: '評価4', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.getByLabel('新しいメモ', { exact: true }).fill('未保存の下書き')
    await page.getByLabel('ROLE', { exact: true }).selectOption('MID')
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('button', { name: '編集を続ける', exact: true }).click()
    await expect(page.getByLabel('ROLE', { exact: true })).toHaveValue('TOP')
    await expect(page.getByLabel('新しいメモ', { exact: true })).toHaveValue('未保存の下書き')
    await page.getByLabel('ROLE', { exact: true }).selectOption('MID')
    await page.getByRole('button', { name: '変更を破棄して移動' }).click()
    await expect(page.locator('.note-body')).toHaveCount(0)
    await page.getByLabel('ROLE', { exact: true }).selectOption('TOP')
    await expect(page.locator('.note-body')).toHaveCount(1)

    await page.getByRole('button', { name: /メモ\d+を編集/ }).click()
    await page.getByLabel('メモを編集', { exact: true }).fill('Ghost中は距離を取る。')
    await page.getByRole('button', { name: '変更を保存', exact: true }).click()
    await expect(page.locator('.note-body')).toHaveText('Ghost中は距離を取る。')
    const invalid = await page.evaluate(() =>
      window.notebook.addNote({
        key: { myChampionId: 266, enemyChampionId: 122, role: 'TOP' },
        category: 'General',
        body: ' ',
      }),
    )
    expect(invalid.ok).toBe(false)
    await page.getByRole('button', { name: '相手のチャンピオンを選択' }).click()
    await page.getByLabel('相手のチャンピオンを検索').fill('ガレン')
    await page.locator('.picker-results').getByRole('button', { name: /Garen/ }).click()
    await expect(page.locator('.note-body')).toHaveCount(0)
    await page.getByRole('button', { name: '相手のチャンピオンを選択' }).click()
    await page.getByLabel('相手のチャンピオンを検索').fill('Darius')
    await page
      .locator('.picker-results')
      .getByRole('button', { name: /Darius/ })
      .click()
    await expect(page.locator('.note-body')).toHaveText('Ghost中は距離を取る。')
    expect(
      await page
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    ).toBe(true)
    const lock = new DatabaseSync(join(folder, 'notebook.sqlite'))
    try {
      lock.exec('BEGIN IMMEDIATE')
      await page.getByLabel('新しいメモ', { exact: true }).fill('保存失敗時も残る下書き')
      await page.getByRole('button', { name: '＋ メモを保存', exact: true }).click()
      await expect(page.getByRole('alert')).toContainText('データを読み書きできませんでした')
      await expect(page.getByLabel('新しいメモ', { exact: true })).toHaveValue(
        '保存失敗時も残る下書き',
      )
      await expect(page.locator('.note-body')).toHaveCount(1)
    } finally {
      lock.exec('ROLLBACK')
      lock.close()
    }
    await page.getByRole('button', { name: '＋ メモを保存', exact: true }).click()
    await expect(page.locator('.note-body')).toHaveCount(2)
    await page
      .locator('.note-card')
      .filter({ hasText: '保存失敗時も残る下書き' })
      .getByRole('button', { name: /を削除/ })
      .click()
    await page.getByRole('button', { name: '削除する', exact: true }).click()
    await expect(page.locator('.note-body')).toHaveCount(1)
    expect(errors).toEqual([])
    mkdirSync('docs/screenshots', { recursive: true })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'docs/screenshots/notebook.png', fullPage: true })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 720))
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await app.close()

    app = await launch()
    page = await app.firstWindow()
    await page.context().setOffline(true)
    await expect(page.locator('.note-body')).toHaveText('Ghost中は距離を取る。')
    await expect(page.getByLabel('難易度', { exact: true })).toHaveValue('Hard')
    await expect(page.getByRole('button', { name: '評価4', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const result = await page.evaluate(() => window.notebook.getInfo())
    expect(result.ok && result.data.databasePath).toBe(join(folder, 'notebook.sqlite'))
    await page.getByRole('button', { name: /メモ\d+を削除/ }).click()
    await page.getByRole('button', { name: '削除する', exact: true }).click()
    await expect(page.locator('.note-body')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('development renderer boots with React Refresh and its IPC origin is accepted', async () => {
  const { createServer } = await import('vite')
  const server = await createServer({
    ...appConfig.renderer,
    configFile: false,
    root: resolve('src/renderer'),
    publicDir: resolve('public'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await server.listen()
  mkdirSync('.test-data', { recursive: true })
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.NOTEBOOK_TEST_DATA_DIR = mkdtempSync(resolve('.test-data', 'dev-'))
  env.ELECTRON_RENDERER_URL = server.resolvedUrls!.local[0]
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    app = await electron.launch({ args: [resolve('.')], env })
    const page = await app.firstWindow()
    await expect(page.getByLabel('新しいメモ', { exact: true })).toBeEnabled()
    await page.getByLabel('新しいメモ', { exact: true }).fill('開発モードから保存')
    await page.getByRole('button', { name: '＋ メモを保存', exact: true }).click()
    await expect(page.locator('.note-body')).toHaveText('開発モードから保存')
  } finally {
    await app?.close()
    await server.close()
  }
})
