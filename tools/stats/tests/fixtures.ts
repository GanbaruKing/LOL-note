import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { roles, type Config } from '../src/config/index.js'
import { Store, type Run } from '../src/storage/store.js'
export const config = JSON.parse(
  readFileSync(fileURLToPath(new URL('../config/default.json', import.meta.url)), 'utf8'),
) as Config
export const at = Date.UTC(2026, 8, 15, 12)
export function fixture(id = 'JP1_1', win = true) {
  return {
    metadata: { matchId: id },
    info: {
      platformId: id.split('_')[0],
      queueId: 420,
      mapId: 11,
      gameMode: 'CLASSIC',
      gameVersion: '16.18.1',
      gameDuration: 1800,
      gameStartTimestamp: at,
      participants: Array.from({ length: 10 }, (_, i) => ({
        puuid: `private-player-${i}`,
        championId: i + 1,
        teamId: i < 5 ? 100 : 200,
        win: i < 5 ? win : !win,
        teamPosition: roles[i % 5],
        individualPosition: roles[i % 5],
        gameEndedInEarlySurrender: false,
      })),
    },
  }
}
export function setup(overrides: Partial<Config> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'lol-stats-test-')),
    store = new Store(join(dir, 'raw', 'collector.sqlite'))
  const run: Run = {
    id: 'test-run',
    config: { ...config, patch: '16.18', platforms: ['JP1'], tiers: ['MASTER'], ...overrides },
    start: at - 3600000,
    end: at + 3600000,
    seed: 'fixed',
    complete: false,
    champions: Array.from({ length: 10 }, (_, i) => i + 1),
  }
  store.saveRun(run)
  return {
    dir,
    store,
    run,
    close: () => {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
