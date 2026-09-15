import type { HistoryGame, HistoryList, HistoryMatch } from '../shared/contracts'
import { historyRole, resolveHistoryRoles } from './history-roles'
import { ValidationError } from '../shared/validation'
import { readLcu, type LcuCredentials, type LcuPath } from './lcu'

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const positive = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0
const count = (value: unknown): number | null =>
  Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null

function ownParticipant(game: Record<string, unknown>, puuid: string) {
  const identities = Array.isArray(game.participantIdentities)
    ? game.participantIdentities.map(record)
    : []
  const matches = identities.filter((identity) => record(identity.player).puuid === puuid)
  if (!puuid || matches.length !== 1 || !positive(matches[0].participantId)) return null
  const participants = Array.isArray(game.participants) ? game.participants.map(record) : []
  const own = participants.filter((p) => p.participantId === matches[0].participantId)
  return own.length === 1 ? own[0] : null
}
export function parseHistoryGame(input: unknown, puuid: string): HistoryGame | null {
  const game = record(input),
    own = ownParticipant(game, puuid)
  // Other maps/modes do not share the notebook's five-role matchup model.
  if (
    game.mapId !== 11 ||
    game.gameMode !== 'CLASSIC' ||
    !own ||
    !positive(game.gameId) ||
    !positive(game.gameCreation) ||
    !Number.isFinite(new Date(game.gameCreation).getTime()) ||
    !positive(game.gameDuration) ||
    !positive(own.championId) ||
    count(game.queueId) === null
  )
    return null
  const stats = record(own.stats)
  return {
    gameId: game.gameId,
    createdAt: game.gameCreation,
    duration: game.gameDuration,
    queueId: game.queueId as number,
    championId: own.championId,
    role: historyRole(own),
    win: typeof stats.win === 'boolean' ? stats.win : null,
    kills: count(stats.kills),
    deaths: count(stats.deaths),
    assists: count(stats.assists),
  }
}
export function parseHistoryList(input: unknown, puuid: string): HistoryList {
  const rows = record(record(input).games).games
  if (!Array.isArray(rows))
    throw new ValidationError(
      '試合履歴の形式を確認できませんでした。クライアントを更新して再試行してください。',
    )
  const games = new Map<number, HistoryGame>()
  let skipped = 0
  for (const raw of rows.slice(0, 20)) {
    const game = parseHistoryGame(raw, puuid)
    if (game) games.set(game.gameId, game)
    else skipped++
  }
  return { games: [...games.values()].sort((a, b) => b.createdAt - a.createdAt), skipped }
}
export function parseHistoryMatch(
  input: unknown,
  puuid: string,
  gameId: number,
  timeline?: unknown,
): HistoryMatch {
  const game = record(input),
    summary = parseHistoryGame(input, puuid),
    own = ownParticipant(game, puuid)
  if (!summary || summary.gameId !== gameId || !own || ![100, 200].includes(own.teamId as number))
    throw new ValidationError(
      'この試合の自分の情報を確認できませんでした。履歴を更新してください。',
    )
  const participants = (game.participants as unknown[]).map(record)
  const enemies = participants.filter((p) => p.teamId === (own.teamId === 100 ? 200 : 100))
  if (!enemies.length || enemies.length > 5 || enemies.some((p) => !positive(p.championId)))
    throw new ValidationError('対戦相手を取得できませんでした。もう一度試してください。')
  const roles = resolveHistoryRoles(participants, timeline)
  const ownRole = roles.get(own.participantId as number)
  return {
    ...summary,
    role: ownRole?.role ?? null,
    roleSource: ownRole?.source ?? 'unknown',
    enemies: enemies.map((p) => ({
      championId: p.championId as number,
      role: roles.get(p.participantId as number)?.role ?? null,
      roleSource: roles.get(p.participantId as number)?.source ?? 'unknown',
    })),
  }
}

export class HistoryService {
  constructor(
    private discover: () => Promise<LcuCredentials | null>,
    private get = readLcu,
  ) {}
  private async read<T>(
    path: LcuPath,
    parse: (raw: unknown, puuid: string, timeline?: unknown) => T,
    gameId?: number,
  ): Promise<T> {
    try {
      const credentials = await this.discover()
      if (!credentials)
        throw new ValidationError(
          'League Clientにログインしてから、履歴を更新してください。接続できない場合はSettingsでフォルダーを指定してください。',
        )
      const current = record(await this.get(credentials, '/lol-summoner/v1/current-summoner'))
      if (typeof current.puuid !== 'string' || !current.puuid.trim())
        throw new ValidationError(
          'ログイン中のプレイヤーを確認できません。League Clientのログイン完了後に再試行してください。',
        )
      const raw = await this.get(credentials, path)
      let timeline: unknown
      if (gameId !== undefined) {
        try {
          timeline = await this.get(credentials, `/lol-match-history/v1/game-timelines/${gameId}`)
        } catch {
          /* The match is still reviewable when its optional timeline is unavailable. */
        }
      }
      const after = record(await this.get(credentials, '/lol-summoner/v1/current-summoner'))
      if (after.puuid !== current.puuid)
        throw new ValidationError('ログイン中のアカウントが変わりました。履歴を更新してください。')
      return parse(raw, current.puuid, timeline)
    } catch (error) {
      if (error instanceof ValidationError) throw error
      throw new ValidationError(
        '試合履歴を取得できませんでした。League Clientの接続とログイン状態を確認して再試行してください。',
      )
    }
  }
  list(): Promise<HistoryList> {
    return this.read(
      '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19',
      parseHistoryList,
    )
  }
  detail(gameId: unknown): Promise<HistoryMatch> {
    if (!positive(gameId)) return Promise.reject(new ValidationError('試合IDが正しくありません。'))
    return this.read(
      `/lol-match-history/v1/games/${gameId}`,
      (raw, puuid, timeline) => parseHistoryMatch(raw, puuid, gameId, timeline),
      gameId,
    )
  }
}
