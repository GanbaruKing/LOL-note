import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import counterNotes from '../../resources/counter-notes.json'
import { join, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdirSync, readFileSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { parseBackup } from './backup'
import catalog from '../../resources/champions.json'
import { NotebookRepository } from './repository'
import { ValidationError } from '../shared/validation'
import type { Result } from '../shared/contracts'
import { LcuService, createDiscovery } from './lcu'
import { HistoryService } from './history'

let repository: NotebookRepository | undefined
let mainWindow: BrowserWindow | null = null
let lcu: LcuService | undefined
app.setName('RiftNote')
// Keep the existing storage identity when renaming the product, including Chromium data.
// Only explicit test launches can redirect storage; the renderer cannot choose a path.
const storageDirectory =
  process.env.NOTEBOOK_TEST_DATA_DIR && !app.isPackaged
    ? process.env.NOTEBOOK_TEST_DATA_DIR
    : join(app.getPath('appData'), 'lol-matchup-companion')
let storageSetupFailed = false
try {
  mkdirSync(storageDirectory, { recursive: true })
  app.setPath('userData', storageDirectory)
  app.setPath('sessionData', storageDirectory)
} catch {
  storageSetupFailed = true
}
const rendererFile = join(__dirname, '../renderer/index.html')
const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
const rendererUrl = devUrl ? new URL(devUrl).href : pathToFileURL(rendererFile).href

function registerApi(databasePath: string) {
  let maintenance = false
  const writeBackup = (path: string) => {
    const data = JSON.stringify(parseBackup(repository!.exportBackup()), null, 2)
    if (Buffer.byteLength(data) > 50 * 1024 * 1024)
      throw new ValidationError('バックアップの上限50MBを超えています。')
    const temporary = `${path}.${randomUUID()}.tmp`
    writeFileSync(temporary, data, { flag: 'wx' })
    renameSync(temporary, path)
  }
  const history = new HistoryService(
    createDiscovery(() => repository!.getLeagueFolder(), !process.env.NOTEBOOK_TEST_DATA_DIR),
  )
  const handlers: Record<string, (input: unknown) => unknown> = {
    getLoadout: (input) => repository!.getLoadout(input),
    saveLoadout: (input) => repository!.saveLoadout(input),
    getKnowledgeBook: () => repository!.getKnowledgeBook(),
    saveKnowledgeBook: (input) => repository!.saveKnowledgeBook(input),
    openCounterSource: async (input) => {
      if (
        typeof input !== 'string' ||
        !counterNotes.entries.some((entry) => entry.sources.some((source) => source.url === input))
      )
        throw new ValidationError('この出典は開けません。')
      await shell.openExternal(input)
    },
    exportBackup: async () => {
      const choice = await dialog.showSaveDialog(mainWindow!, {
        title: 'バックアップを保存',
        defaultPath: `RiftNote-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'RiftNote Backup', extensions: ['json'] }],
      })
      if (choice.canceled || !choice.filePath) return null
      if (extname(choice.filePath).toLowerCase() !== '.json')
        throw new ValidationError('保存先には.jsonファイルを指定してください。')
      writeBackup(choice.filePath)
      return choice.filePath
    },
    restoreBackup: async () => {
      const choice = await dialog.showOpenDialog(mainWindow!, {
        title: 'バックアップから復元',
        properties: ['openFile'],
        filters: [{ name: 'RiftNote Backup', extensions: ['json'] }],
      })
      if (choice.canceled || !choice.filePaths[0]) return null
      const path = choice.filePaths[0]
      if (statSync(path).size > 50 * 1024 * 1024)
        throw new ValidationError('バックアップは50MB以下にしてください。')
      let backup
      try {
        backup = parseBackup(JSON.parse(readFileSync(path, 'utf8')))
      } catch {
        throw new ValidationError('有効なRiftNoteバックアップを選択してください。')
      }
      const confirmation = await dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        title: 'バックアップから復元',
        message:
          '保存済みのメモ・ノートブック・対策・評価・登録ピック・ビルド・ルーンを置き換えます。',
        detail:
          '現在のデータは復元前に自動バックアップします。旧形式のバックアップにはノートブックがないため、復元するとノートブックは空になります。ビルド・ルーンのない旧形式を復元すると、ビルド・ルーンは空になります。Leagueのフォルダー設定は変更しません。',
        buttons: ['キャンセル', '復元する'],
        defaultId: 0,
        cancelId: 0,
      })
      if (confirmation.response !== 1) return null
      const directory = join(app.getPath('userData'), 'backups')
      mkdirSync(directory, { recursive: true })
      const safetyPath = join(directory, `before-restore-${Date.now()}-${randomUUID()}.json`)
      writeBackup(safetyPath)
      repository!.restoreBackup(backup)
      return safetyPath
    },
    getChampionCounter: (input) => repository!.getChampionCounter(input),
    saveChampionCounter: (input) => repository!.saveChampionCounter(input),
    getMatchHistory: () => history.list(),
    getHistoryMatch: (input) => history.detail(input),
    getLcuState: () => lcu!.snapshot(),
    selectLeagueFolder: async () => {
      const selection = await dialog.showOpenDialog(mainWindow!, {
        title: 'League of Legendsのインストールフォルダーを選択',
        properties: ['openDirectory'],
      })
      if (selection.canceled || !selection.filePaths[0]) return false
      repository!.setLeagueFolder(selection.filePaths[0])
      return true
    },
    listMyPicks: (input) => repository!.listMyPicks(input),
    saveMyPick: (input) => repository!.saveMyPick(input),
    removeMyPick: (input) => repository!.removeMyPick(input),
    pinNote: (input) => repository!.pinNote(input),
    searchNotes: (input) => repository!.searchNotes(input),
    listPool: () => repository!.listPool(),
    savePool: (input) => repository!.savePool(input),
    removePool: (input) => repository!.removePool(input),
    getChampionPage: (input) => repository!.getChampionPage(input),
    addChampionNote: (input) => repository!.addChampionNote(input),
    updateChampionNote: (input) => repository!.updateChampionNote(input),
    deleteChampionNote: (input) => repository!.deleteChampionNote(input),
    listChampions: () => catalog.champions,
    listMatchups: () => repository!.listMatchups(),
    getMatchup: (input) => repository!.getMatchup(input),
    saveOverview: (input) => repository!.saveOverview(input),
    addNote: (input) => repository!.addNote(input),
    updateNote: (input) => repository!.updateNote(input),
    deleteNote: (input) => repository!.deleteNote(input),
    getInfo: () => ({ databasePath, catalogVersion: catalog.version }),
  }
  for (const [name, handler] of Object.entries(handlers)) {
    ipcMain.handle(`notebook:${name}`, async (event, input): Promise<Result<unknown>> => {
      const sender = event.senderFrame
      if (
        !mainWindow ||
        event.sender !== mainWindow.webContents ||
        !sender ||
        sender !== event.sender.mainFrame ||
        sender.url !== rendererUrl
      ) {
        return { ok: false, error: '許可されていないリクエストです。' }
      }
      try {
        if (maintenance && !/^(get|list|search)/.test(name))
          throw new ValidationError('バックアップ処理の完了をお待ちください。')
        const isMaintenance = name === 'exportBackup' || name === 'restoreBackup'
        if (isMaintenance) maintenance = true
        try {
          return { ok: true, data: await handler(input) }
        } finally {
          if (isMaintenance) maintenance = false
        }
      } catch (error) {
        console.error(
          `Notebook operation failed: ${name}`,
          error instanceof Error ? error.name : 'UnknownError',
        )
        return {
          ok: false,
          error:
            error instanceof ValidationError
              ? error.message
              : 'データを読み書きできませんでした。入力を残したまま、もう一度お試しください。',
        }
      }
    })
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1000,
    minHeight: 720,
    title: 'RiftNote',
    icon: app.isPackaged
      ? join(__dirname, '../renderer/icon.png')
      : join(app.getAppPath(), 'public/icon.png'),
    backgroundColor: '#101217',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const response = dialog.showMessageBoxSync(mainWindow!, {
      type: 'question',
      buttons: ['編集を続ける', '変更を破棄して閉じる'],
      defaultId: 0,
      cancelId: 0,
      title: '未保存のメモ',
      message: '未保存の変更があります。閉じますか？',
      detail: '保存済みのメモは残ります。保存処理中の場合は、完了を待ってください。',
    })
    if (response === 1) event.preventDefault()
  })
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  await mainWindow.loadURL(rendererUrl)
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  })
  app
    .whenReady()
    .then(async () => {
      if (storageSetupFailed) throw new Error('Storage directory unavailable')
      const directory = app.getPath('userData')
      mkdirSync(directory, { recursive: true })
      const databasePath = join(directory, 'notebook.sqlite')
      repository = new NotebookRepository(databasePath, catalog.champions)
      lcu = new LcuService(
        createDiscovery(() => repository!.getLeagueFolder(), !process.env.NOTEBOOK_TEST_DATA_DIR),
      )
      lcu.start()
      registerApi(databasePath)
      await createWindow()
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow()
      })
    })
    .catch(() => {
      dialog.showErrorBox(
        'Notebookを起動できません',
        '保存フォルダーへのアクセス、またはデータベースの形式を確認してください。既存データは削除されません。',
      )
      app.quit()
    })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('will-quit', () => {
    lcu?.stop()
    repository?.close()
  })
}
