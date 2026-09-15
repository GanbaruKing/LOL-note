import type { Config, Role } from '../config/index.js'
import type { Match } from '../processor/match.js'
import { confidence, expectedWinRate, wilson } from './model.js'
export interface Row {
  champion: number
  opponent: number
  role: Role
  games: number
  wins: number
  losses: number
  rawWinRate: number
  championOverallWinRate: number
  opponentOverallWinRate: number
  championOverallGames: number
  opponentOverallGames: number
  expectedWinRate: number
  matchupDelta: number
  confidenceLow: number
  confidenceHigh: number
  confidence: string
  rankingScore: number
  eligibleForRecommendation: boolean
  regionGames: Record<string, number>
}
export function totals(matches: Match[], config: Config): Row[] {
  const baseline = new Map<string, { games: number; wins: number }>(),
    pairs = new Map<
      string,
      {
        champion: number
        opponent: number
        role: Role
        games: number
        wins: number
        regionGames: Record<string, number>
      }
    >()
  for (const m of new Map(matches.map((m) => [m.id, m])).values())
    for (const pair of m.pairs) {
      for (const [a, b] of [
        [pair.a, pair.b],
        [pair.b, pair.a],
      ]) {
        const baseKey = `${pair.role}:${a.champion}`,
          base = baseline.get(baseKey) ?? { games: 0, wins: 0 }
        base.games++
        base.wins += Number(a.win)
        baseline.set(baseKey, base)
        const key = `${baseKey}:${b.champion}`,
          row = pairs.get(key) ?? {
            champion: a.champion,
            opponent: b.champion,
            role: pair.role,
            games: 0,
            wins: 0,
            regionGames: {},
          }
        row.games++
        row.wins += Number(a.win)
        row.regionGames[m.platform] = (row.regionGames[m.platform] ?? 0) + 1
        pairs.set(key, row)
      }
    }
  return [...pairs.values()]
    .map((row) => {
      const a = baseline.get(`${row.role}:${row.champion}`)!,
        b = baseline.get(`${row.role}:${row.opponent}`)!
      const aWR = (100 * a.wins) / a.games,
        bWR = (100 * b.wins) / b.games,
        raw = (100 * row.wins) / row.games,
        expected = expectedWinRate(aWR, bWR),
        delta = raw - expected
      const [low, high] = wilson(row.wins, row.games)
      return {
        ...row,
        losses: row.games - row.wins,
        rawWinRate: raw,
        championOverallWinRate: aWR,
        opponentOverallWinRate: bWR,
        championOverallGames: a.games,
        opponentOverallGames: b.games,
        expectedWinRate: expected,
        matchupDelta: delta,
        confidenceLow: low,
        confidenceHigh: high,
        confidence: confidence(row.games, config.confidenceThresholds),
        rankingScore: low - expected,
        eligibleForRecommendation:
          row.games >= config.minimumGames &&
          a.games >= config.minimumBaselineGames &&
          b.games >= config.minimumBaselineGames &&
          delta > 0,
      }
    })
    .sort(
      (a, b) =>
        b.rankingScore - a.rankingScore ||
        b.matchupDelta - a.matchupDelta ||
        b.games - a.games ||
        a.champion - b.champion,
    )
}
