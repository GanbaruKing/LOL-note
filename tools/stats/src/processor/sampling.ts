import { hash, type Config } from '../config/index.js'
import type { Match } from './match.js'
export interface Seed {
  puuid: string
  tier: string
  division: string
}
export function sampleSeeds(pool: Seed[], size: number, seed: string): Seed[] {
  const unique = [...new Map(pool.map((p) => [p.puuid, p])).values()]
  const groups = new Map<string, Seed[]>()
  for (const p of unique) {
    const key = `${p.tier}/${p.division}`
    const group = groups.get(key) ?? []
    group.push(p)
    groups.set(key, group)
  }
  const target = Math.min(size, unique.length)
  const quotas = [...groups.entries()].map(([key, items]) => ({
    key,
    items,
    exact: (target * items.length) / unique.length,
    n: Math.floor((target * items.length) / unique.length),
  }))
  quotas.sort((a, b) => b.exact - b.n - (a.exact - a.n) || a.key.localeCompare(b.key))
  let remainder = target - quotas.reduce((n, q) => n + q.n, 0)
  for (const q of quotas)
    if (remainder > 0) {
      q.n++
      remainder--
    }
  return quotas.flatMap((q) =>
    q.items
      .sort((a, b) => hash(`${seed}:${a.puuid}`).localeCompare(hash(`${seed}:${b.puuid}`)))
      .slice(0, q.n),
  )
}
export function sampleMatches(matches: Match[], config: Config, seed: string) {
  const regionDays = new Map<string, number>(),
    playerDays = new Map<string, number>()
  const accepted: Match[] = [],
    excluded: { id: string; reason: string }[] = []
  const unique = [...new Map(matches.map((m) => [m.id, m])).values()]
  unique.sort((a, b) => hash(`${seed}:${a.id}`).localeCompare(hash(`${seed}:${b.id}`)))
  for (const m of unique) {
    const group = `${m.platform}:${m.day}`
    if ((regionDays.get(group) ?? 0) >= config.matchesPerRegionPerDay) {
      excluded.push({ id: m.id, reason: 'region_quota' })
      continue
    }
    if (
      m.players.some(
        (p) => (playerDays.get(`${group}:${p.puuid}`) ?? 0) >= config.matchesPerPlayerPerDay,
      )
    ) {
      excluded.push({ id: m.id, reason: 'player_quota' })
      continue
    }
    accepted.push(m)
    regionDays.set(group, (regionDays.get(group) ?? 0) + 1)
    for (const p of m.players) {
      const k = `${group}:${p.puuid}`
      playerDays.set(k, (playerDays.get(k) ?? 0) + 1)
    }
  }
  return {
    accepted,
    excluded,
    regionDays: Object.fromEntries(regionDays),
    maxPlayerDailyGames: [...playerDays.values()].reduce((a, b) => Math.max(a, b), 0),
  }
}
