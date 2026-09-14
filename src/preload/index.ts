import { contextBridge, ipcRenderer } from 'electron'
import type { NotebookApi } from '../shared/contracts'

const api: NotebookApi = {
  listChampions: () => ipcRenderer.invoke('notebook:listChampions'),
  listMatchups: () => ipcRenderer.invoke('notebook:listMatchups'),
  getMatchup: (key) => ipcRenderer.invoke('notebook:getMatchup', key),
  saveOverview: (input) => ipcRenderer.invoke('notebook:saveOverview', input),
  addNote: (input) => ipcRenderer.invoke('notebook:addNote', input),
  updateNote: (input) => ipcRenderer.invoke('notebook:updateNote', input),
  deleteNote: (input) => ipcRenderer.invoke('notebook:deleteNote', input),
  getInfo: () => ipcRenderer.invoke('notebook:getInfo'),
}
contextBridge.exposeInMainWorld('notebook', api)
