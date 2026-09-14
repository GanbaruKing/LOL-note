import type { StatisticsData, Role } from '../shared/contracts'
import catalog from '../../resources/champions.json'

export class CollectorError extends Error {}
const ids = new Set(catalog.champions.map((c) => c.id))
const roles: Record<string, Role> = {
  TOP: 'TOP',
  JUNGLE: 'JUNGLE',
  MIDDLE: 'MID',
  BOTTOM: 'BOTTOM',
  UTILITY: 'SUPPORT',
}
export interface CollectedMatch {
  id: string
  patch: string
  pairs: { championId: number; enemyId: number; role: Role; win: boolean }[]
}
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

export function normalizeMatch(value: unknown, expectedId: string): CollectedMatch | null {
  const root = record(value),
    metadata = record(root?.metadata),
    info = record(root?.info)
  if (!info || metadata?.matchId !== expectedId)
    throw new CollectorError('試合データの形式が正しくありません。')
  if (
    info.platformId !== 'JP1' ||
    info.queueId !== 420 ||
    info.mapId !== 11 ||
    info.gameMode !== 'CLASSIC' ||
    typeof info.gameDuration !== 'number' ||
    info.gameDuration < 300
  )
    return null
  const patch =
    typeof info.gameVersion === 'string' ? info.gameVersion.match(/^(\d+\.\d+)\./)?.[1] : null
  if (!patch || !Array.isArray(info.participants) || info.participants.length !== 10) return null
  const participants = info.participants.map(record)
  if (
    participants.some(
      (p) =>
        !p ||
        !ids.has(p.championId as number) ||
        typeof p.win !== 'boolean' ||
        ![100, 200].includes(p.teamId as number) ||
        p.gameEndedInEarlySurrender === true,
    )
  )
    return null
  const pairs: CollectedMatch['pairs'] = []
  for (const [position, role] of Object.entries(roles)) {
    const blue = participants.filter((p) => p!.teamId === 100 && p!.teamPosition === position)
    const red = participants.filter((p) => p!.teamId === 200 && p!.teamPosition === position)
    if (blue.length !== 1 || red.length !== 1 || blue[0]!.win === red[0]!.win) return null
    for (const [a, b] of [
      [blue[0]!, red[0]!],
      [red[0]!, blue[0]!],
    ]) {
      pairs.push({
        championId: a.championId as number,
        enemyId: b.championId as number,
        role,
        win: a.win as boolean,
      })
    }
  }
  return { id: expectedId, patch, pairs }
}

export function aggregate(matches: CollectedMatch[], patch: string): StatisticsData {
  const seen = new Set<string>(),
    rows = new Map<string, StatisticsData['rows'][number]>()
  for (const match of matches) {
    if (match.patch !== patch || seen.has(match.id)) continue
    seen.add(match.id)
    for (const p of match.pairs) {
      const key = `${p.championId}-${p.enemyId}-${p.role}`
      const row = rows.get(key) ?? {
        myChampionId: p.championId,
        enemyChampionId: p.enemyId,
        role: p.role,
        games: 0,
        wins: 0,
      }
      row.games++
      if (p.win) row.wins++
      rows.set(key, row)
    }
  }
  return {
    schemaVersion: 1,
    isDemo: false,
    source: `Riot Match-v5 / 指定プレイヤー履歴からの標本（${seen.size}試合・全体統計ではありません）`,
    patch,
    region: 'JP1',
    rank: 'ランク未選別（履歴標本）',
    queue: 'Ranked Solo/Duo (420)',
    generatedAt: new Date().toISOString(),
    rows: [...rows.values()],
  }
}

export class RiotClient {
  private lastRequest = 0
  constructor(
    private key: string,
    private request: typeof fetch = fetch,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private now: () => number = Date.now,
  ) {
    if (!key.trim())
      throw new CollectorError('RIOT_API_KEYがありません。同じPowerShellで設定してください。')
  }
  async get(path: string): Promise<unknown> {
    if (
      !path.startsWith('/riot/account/v1/accounts/by-riot-id/') &&
      !path.startsWith('/lol/match/v5/matches/')
    )
      throw new CollectorError('許可されていないAPIです。')
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.sleep(Math.max(0, 1300 - (this.now() - this.lastRequest)))
      this.lastRequest = this.now()
      let response: Response
      try {
        response = await this.request(`https://asia.api.riotgames.com${path}`, {
          headers: { 'X-Riot-Token': this.key },
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        })
      } catch {
        if (attempt < 3) {
          await this.sleep(2000 * (attempt + 1))
          continue
        }
        throw new CollectorError('Riot APIに接続できません。通信状態を確認して再実行してください。')
      }
      if (response.status === 401 || response.status === 403)
        throw new CollectorError(
          'APIキーが無効、期限切れ、または権限不足です。キーを更新してください。',
        )
      if (response.status === 404) throw new CollectorError('Riot IDまたは試合が見つかりません。')
      if (response.status === 429 || response.status >= 500) {
        const header = response.headers.get('retry-after')
        const seconds = header === null ? 120 : Number(header)
        if (attempt === 3 || !Number.isFinite(seconds) || seconds < 0 || seconds > 300)
          throw new CollectorError(
            'APIが混雑または取得制限中です。時間を置いて再実行してください。',
          )
        await this.sleep(
          response.status === 429 ? Math.max(1300, seconds * 1000) : 2000 * (attempt + 1),
        )
        continue
      }
      if (!response.ok) throw new CollectorError(`Riot APIがHTTP ${response.status}を返しました。`)
      try {
        return await response.json()
      } catch {
        throw new CollectorError('Riot APIの応答を読み込めません。')
      }
    }
    throw new CollectorError('取得を再試行してください。')
  }
}
