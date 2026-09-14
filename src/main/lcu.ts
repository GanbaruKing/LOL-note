import { request } from 'node:https'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'
import type { LcuState, Role } from '../shared/contracts'

// Credentials never cross IPC, appear in logs, or get persisted.
export interface LcuCredentials {
  port: number
  password: string
}
export function parseLockfile(text: string): LcuCredentials {
  const parts = text.trim().split(':')
  if (
    parts.length !== 5 ||
    parts[0] !== 'LeagueClient' ||
    !/^\d+$/.test(parts[1]) ||
    !/^\d+$/.test(parts[2]) ||
    Number(parts[2]) < 1 ||
    Number(parts[2]) > 65535 ||
    !parts[3] ||
    parts[4] !== 'https'
  )
    throw new Error('Invalid LCU lockfile')
  return { port: Number(parts[2]), password: parts[3] }
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const champion = (v: unknown): number | null =>
  Number.isSafeInteger(v) && (v as number) > 0 ? (v as number) : null
export function parseSession(
  input: unknown,
): Pick<LcuState, 'role' | 'ownChampionId' | 'enemyChampionIds'> {
  const v = record(input)
  if (
    !Array.isArray(v.myTeam) ||
    !Array.isArray(v.theirTeam) ||
    !Number.isInteger(v.localPlayerCellId)
  )
    throw new Error('Invalid champion select response')
  const own = v.myTeam.map(record).find((p) => p.cellId === v.localPlayerCellId)
  const activePick = Array.isArray(v.actions)
    ? v.actions
        .flatMap((group) => (Array.isArray(group) ? group : []))
        .map(record)
        .find(
          (action) =>
            action.actorCellId === v.localPlayerCellId &&
            action.type === 'pick' &&
            action.isInProgress === true &&
            action.completed !== true,
        )
    : undefined
  const roles: Record<string, Role> = {
    top: 'TOP',
    jungle: 'JUNGLE',
    middle: 'MID',
    mid: 'MID',
    bottom: 'BOTTOM',
    utility: 'SUPPORT',
    support: 'SUPPORT',
  }
  return {
    role:
      typeof own?.assignedPosition === 'string' &&
      Object.hasOwn(roles, own.assignedPosition.toLowerCase())
        ? (roles[own.assignedPosition.toLowerCase()] ?? null)
        : null,
    ownChampionId:
      champion(own?.championId) ??
      champion(activePick?.championId) ??
      champion(own?.championPickIntent),
    enemyChampionIds: [
      ...new Set(
        v.theirTeam
          .map((p) => champion(record(p).championId))
          .filter((id): id is number => id !== null),
      ),
    ],
  }
}
export function readLcu(
  credentials: LcuCredentials,
  path: '/lol-gameflow/v1/gameflow-phase' | '/lol-champ-select/v1/session',
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Self-signed LCU certificate exception is restricted to this loopback request.
    const req = request(
      {
        hostname: '127.0.0.1',
        port: credentials.port,
        path,
        method: 'GET',
        auth: `riot:${credentials.password}`,
        rejectUnauthorized: false,
        agent: false,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error('LCU request failed'))
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > 1024 * 1024) req.destroy(new Error('LCU response too large'))
          else chunks.push(chunk)
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch {
            reject(new Error('Invalid LCU response'))
          }
        })
        res.on('error', () => reject(new Error('LCU response failed')))
      },
    )
    const timeout = setTimeout(() => req.destroy(new Error('LCU request timed out')), 2500)
    req.on('error', () => reject(new Error('LCU connection failed')))
    req.on('close', () => clearTimeout(timeout))
    req.end()
  })
}
export function createDiscovery(getFolder: () => string | undefined, automatic = true) {
  let discoveredFolders: string[] = [],
    checkedAt = 0
  return async (): Promise<LcuCredentials | null> => {
    const folders = [
      getFolder(),
      ...(automatic
        ? [
            ...discoveredFolders,
            'C:\\Riot Games\\League of Legends',
            'C:\\Program Files\\Riot Games\\League of Legends',
          ]
        : []),
    ].filter((s): s is string => !!s)
    const read = async (paths: string[]) => {
      for (const folder of new Set(paths)) {
        try {
          return parseLockfile(await readFile(join(folder, 'lockfile'), 'utf8'))
        } catch {
          /* Client may not be running. */
        }
      }
      return null
    }
    const credentials = await read(folders)
    if (credentials) return credentials
    if (automatic && process.platform === 'win32' && Date.now() - checkedAt > 10000) {
      checkedAt = Date.now()
      try {
        const { stdout } = await promisify(execFile)(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            'Get-CimInstance Win32_Process -Filter "Name=\'LeagueClient.exe\'" | ForEach-Object { $_.ExecutablePath }',
          ],
          { windowsHide: true, timeout: 4000, maxBuffer: 32768 },
        )
        discoveredFolders = stdout
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map(dirname)
        return await read(discoveredFolders)
      } catch {
        /* User can select the installation folder without elevation. */
      }
    }
    return null
  }
}
export const disconnected = (): LcuState => ({
  status: 'disconnected',
  phase: null,
  sessionId: null,
  role: null,
  ownChampionId: null,
  enemyChampionIds: [],
  message: 'League Client未接続。Notebookは利用できます。',
})
export class LcuService {
  private state: LcuState = disconnected()
  private timer?: ReturnType<typeof setTimeout>
  private stopped = true
  private running = false
  private generation = 0
  private gameId: unknown
  constructor(
    private discover: () => Promise<LcuCredentials | null>,
    private get = readLcu,
  ) {}
  snapshot(): LcuState {
    return { ...this.state, enemyChampionIds: [...this.state.enemyChampionIds] }
  }
  async poll(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const credentials = await this.discover()
      if (!credentials) {
        this.state = disconnected()
        return
      }
      const phase = await this.get(credentials, '/lol-gameflow/v1/gameflow-phase')
      if (typeof phase !== 'string') throw new Error('Invalid game phase')
      if (phase !== 'ChampSelect') {
        this.state = {
          ...disconnected(),
          status: 'connected',
          phase,
          message: `League Client接続中 · ${phase}`,
        }
        return
      }
      const raw = await this.get(credentials, '/lol-champ-select/v1/session')
      const session = parseSession(raw)
      if (this.state.status !== 'champ-select' || this.gameId !== record(raw).gameId)
        this.generation++
      this.gameId = record(raw).gameId
      this.state = {
        ...session,
        status: 'champ-select',
        phase,
        sessionId: String(this.generation),
        message: 'Champion Select Active',
      }
    } catch {
      this.state = {
        ...disconnected(),
        status: 'error',
        message: 'LCU接続を確認しています。自動で再接続します。',
      }
    } finally {
      this.running = false
    }
  }
  start() {
    if (!this.stopped) return
    this.stopped = false
    const run = async () => {
      await this.poll()
      if (!this.stopped) this.timer = setTimeout(run, 2000)
    }
    void run()
  }
  stop() {
    this.stopped = true
    clearTimeout(this.timer)
  }
}
