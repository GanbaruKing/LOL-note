import { object, roles, type Config, type Role } from '../config/index.js'
export interface Player {
  puuid: string
  champion: number
  team: number
  win: boolean
  role: string
  individual: string
}
export interface Pair {
  role: Role
  a: Player
  b: Player
}
export interface Match {
  id: string
  platform: string
  timestamp: number
  day: string
  players: Player[]
  pairs: Pair[]
  reasons: string[]
}
export type Result = { match: Match; reason?: never } | { reason: string; match?: never }
export interface Rank {
  tier: string | null
  division: string | null
  fetchedAt: number
}
export function validRank(rank: Rank | undefined, timestamp: number, config: Config) {
  return (
    !!rank &&
    rank.tier !== null &&
    config.tiers.includes(rank.tier) &&
    Math.abs(rank.fetchedAt - timestamp) <= config.rankDistanceHours * 3600000
  )
}
export function normalize(
  value: unknown,
  id: string,
  config: Config,
  champions: Set<number>,
  start: number,
  end: number,
): Result {
  try {
    const root = object(value),
      meta = object(root.metadata),
      info = object(root.info)
    if (
      meta.matchId !== id ||
      typeof info.platformId !== 'string' ||
      !id.startsWith(`${info.platformId}_`)
    )
      return { reason: 'identity' }
    if (!config.platforms.includes(info.platformId)) return { reason: 'platform' }
    if (info.queueId !== config.queue || info.mapId !== 11 || info.gameMode !== 'CLASSIC')
      return { reason: 'queue_map' }
    if (
      typeof info.gameVersion !== 'string' ||
      info.gameVersion.split('.').slice(0, 2).join('.') !== config.patch
    )
      return { reason: 'patch' }
    if (
      typeof info.gameDuration !== 'number' ||
      !Number.isFinite(info.gameDuration) ||
      info.gameDuration < config.minimumDurationSeconds
    )
      return { reason: 'duration' }
    const timestamp = info.gameStartTimestamp
    if (
      typeof timestamp !== 'number' ||
      !Number.isSafeInteger(timestamp) ||
      timestamp < start ||
      timestamp >= end
    )
      return { reason: 'window' }
    if (!Array.isArray(info.participants) || info.participants.length !== 10)
      return { reason: 'participants' }
    const raw = info.participants.map(object)
    if (config.excludeEarlySurrender && raw.some((p) => p.gameEndedInEarlySurrender === true))
      return { reason: 'early_surrender' }
    if (
      raw.some(
        (p) =>
          typeof p.puuid !== 'string' ||
          !p.puuid ||
          typeof p.championId !== 'number' ||
          !champions.has(p.championId) ||
          typeof p.teamId !== 'number' ||
          ![100, 200].includes(p.teamId) ||
          typeof p.win !== 'boolean',
      )
    )
      return { reason: 'participant_data' }
    const players: Player[] = raw.map((p) => ({
      puuid: p.puuid as string,
      champion: p.championId as number,
      team: p.teamId as number,
      win: p.win as boolean,
      role: String(p.teamPosition ?? ''),
      individual: String(p.individualPosition ?? ''),
    }))
    if (
      new Set(players.map((p) => p.puuid)).size !== 10 ||
      new Set(players.map((p) => p.champion)).size !== 10
    )
      return { reason: 'duplicate_participant' }
    const blue = players.filter((p) => p.team === 100),
      red = players.filter((p) => p.team === 200)
    if (
      blue.length !== 5 ||
      red.length !== 5 ||
      blue.some((p) => p.win !== blue[0].win) ||
      red.some((p) => p.win !== red[0].win) ||
      blue[0].win === red[0].win
    )
      return { reason: 'teams' }
    const pairs: Pair[] = [],
      reasons: string[] = []
    for (const role of roles) {
      const a = blue.filter((p) => p.role === role),
        b = red.filter((p) => p.role === role)
      if (a.length !== 1 || b.length !== 1) {
        reasons.push('role_unknown')
        continue
      }
      if (
        config.excludeRoleConflict &&
        [a[0], b[0]].some((p) => roles.includes(p.individual as Role) && p.individual !== role)
      ) {
        reasons.push('role_conflict')
        continue
      }
      pairs.push({ role, a: a[0], b: b[0] })
    }
    return {
      match: {
        id,
        platform: info.platformId,
        timestamp,
        day: new Date(timestamp).toISOString().slice(0, 10),
        players,
        pairs,
        reasons,
      },
    }
  } catch {
    return { reason: 'malformed' }
  }
}
