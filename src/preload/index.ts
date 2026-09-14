import { contextBridge, ipcRenderer } from 'electron'
import type { NotebookApi } from '../shared/contracts'

const api: NotebookApi = {
  listPool: () => ipcRenderer.invoke('notebook:listPool'),
  savePool: (input) => ipcRenderer.invoke('notebook:savePool', input),
  removePool: (input) => ipcRenderer.invoke('notebook:removePool', input),
  getChampionPage: (id) => ipcRenderer.invoke('notebook:getChampionPage', id),
  addChampionNote: (input) => ipcRenderer.invoke('notebook:addChampionNote', input),
  updateChampionNote: (input) => ipcRenderer.invoke('notebook:updateChampionNote', input),
  deleteChampionNote: (input) => ipcRenderer.invoke('notebook:deleteChampionNote', input),
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
