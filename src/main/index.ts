import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdirSync } from 'node:fs'
import catalog from '../../resources/champions.json'
import { NotebookRepository } from './repository'
import { ValidationError } from '../shared/validation'
import type { Result } from '../shared/contracts'

let repository: NotebookRepository | undefined
let mainWindow: BrowserWindow | null = null
// Only explicit test launches can redirect storage; the renderer cannot choose a path.
if (process.env.NOTEBOOK_TEST_DATA_DIR && !app.isPackaged)
  app.setPath('userData', process.env.NOTEBOOK_TEST_DATA_DIR)
const rendererFile = join(__dirname, '../renderer/index.html')
const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
const rendererUrl = devUrl ? new URL(devUrl).href : pathToFileURL(rendererFile).href

function registerApi(databasePath: string) {
  const handlers: Record<string, (input: unknown) => unknown> = {
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
    ipcMain.handle(`notebook:${name}`, (event, input): Result<unknown> => {
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
        return { ok: true, data: handler(input) }
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
    title: 'LoL Matchup Companion',
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
      const directory = app.getPath('userData')
      mkdirSync(directory, { recursive: true })
      const databasePath = join(directory, 'notebook.sqlite')
      repository = new NotebookRepository(databasePath, catalog.champions)
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
  app.on('will-quit', () => repository?.close())
}
