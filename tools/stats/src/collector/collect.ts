import { days, hash, object, routing } from '../config/index.js'
import { normalize, type Rank } from '../processor/match.js'
import { sampleSeeds, type Seed } from '../processor/sampling.js'
import type { Store, Run } from '../storage/store.js'
import { ApiError, type Client } from './client.js'

export function getRank(
  store: Store,
  run: string,
  platform: string,
  puuid: string,
): Rank | undefined {
  const row = store.db
    .prepare('SELECT body FROM ranks WHERE run_id=? AND platform=? AND puuid=?')
    .get(run, platform, puuid) as { body: string } | undefined
  return row && JSON.parse(row.body)
}
function saveRank(store: Store, run: string, platform: string, puuid: string, rank: Rank) {
  const body = JSON.stringify(rank)
  store.db.prepare('INSERT OR IGNORE INTO ranks VALUES(?,?,?,?)').run(run, platform, puuid, body)
  store.db.prepare('INSERT OR REPLACE INTO rank_cache VALUES(?,?,?)').run(platform, puuid, body)
}
async function ladder(store: Store, client: Client, run: Run, platform: string): Promise<Seed[]> {
  const saved = store.checkpoint<Seed[]>(run.id, `ladder:${platform}`)
  if (saved) return saved
  const result: Seed[] = []
  for (const tier of run.config.tiers) {
    const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)
    for (const division of apex ? ['I'] : ['I', 'II', 'III', 'IV']) {
      for (let page = 1; ; page++) {
        const path = apex
          ? `/lol/league/v4/${tier.toLowerCase()}leagues/by-queue/RANKED_SOLO_5x5`
          : `/lol/league/v4/entries/RANKED_SOLO_5x5/${tier}/${division}?page=${page}`
        const response = await client.get(
          platform.toLowerCase(),
          path,
          apex ? 'ladder-apex' : 'ladder',
          `${run.id}:ladder:${platform}:${tier}:${division}:${page}`,
        )
        const entries = apex ? object(response.value).entries : response.value
        if (!Array.isArray(entries)) throw new Error('Invalid ladder response')
        for (const value of entries) {
          const row = object(value)
          if (typeof row.puuid !== 'string' || !row.puuid)
            throw new Error('Ladder entry missing PUUID')
          const seed = { puuid: row.puuid, tier, division }
          result.push(seed)
          // An old resumed ladder snapshot is retained for discovery, but not used as fresh rank evidence.
          if (Date.now() - response.fetchedAt <= run.config.rankTtlHours * 3600000)
            saveRank(store, run.id, platform, seed.puuid, {
              tier,
              division,
              fetchedAt: response.fetchedAt,
            })
        }
        if (apex || entries.length === 0) break
      }
    }
  }
  const unique = [...new Map(result.map((p) => [p.puuid, p])).values()]
  store.saveCheckpoint(run.id, `ladder:${platform}`, unique)
  return unique
}
async function rankPlayer(store: Store, client: Client, run: Run, platform: string, puuid: string) {
  if (getRank(store, run.id, platform, puuid)) return
  const cached = store.db
    .prepare('SELECT body FROM rank_cache WHERE platform=? AND puuid=?')
    .get(platform, puuid) as { body: string } | undefined
  if (cached) {
    const rank: Rank = JSON.parse(cached.body)
    if (Date.now() - rank.fetchedAt <= run.config.rankTtlHours * 3600000) {
      saveRank(store, run.id, platform, puuid, rank)
      store.count(run.id, 'rankCacheHits')
      return
    }
  }
  const response = await client
    .get(
      platform.toLowerCase(),
      `/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
      'rank',
      `${run.id}:rank:${platform}:${puuid}`,
    )
    .catch((error) => {
      if (error instanceof ApiError && error.status === 404) {
        store.count(run.id, 'rankUnavailable404')
        return { value: [], fetchedAt: Date.now() }
      }
      throw error
    })
  if (!Array.isArray(response.value)) throw new Error('Invalid rank response')
  const solo = response.value.map(object).find((x) => x.queueType === 'RANKED_SOLO_5x5')
  if (solo && (typeof solo.tier !== 'string' || typeof solo.rank !== 'string'))
    throw new Error('Invalid solo rank entry')
  saveRank(store, run.id, platform, puuid, {
    tier: (solo?.tier as string) ?? null,
    division: (solo?.rank as string) ?? null,
    fetchedAt: response.fetchedAt,
  })
}

export async function collect(
  store: Store,
  client: Client,
  run: Run,
  report: (message: string) => void = console.log,
) {
  if (run.complete) {
    report(`Run ${run.id} already complete; use --new for a new window.`)
    return
  }
  const champions = new Set(run.champions)
  for (const platform of run.config.platforms) {
    if (store.checkpoint(run.id, `complete:${platform}`)) continue
    report(`${platform}: discovering ranked players (cached pages resume automatically)`)
    const pool = await ladder(store, client, run, platform)
    for (const window of days(run.start, run.end)) {
      const key = `seeds:${platform}:${window.day}`
      const seeds =
        store.checkpoint<Seed[]>(run.id, key) ??
        sampleSeeds(pool, run.config.seedsPerRegionPerDay, `${run.seed}:${platform}:${window.day}`)
      store.saveCheckpoint(run.id, key, seeds)
      report(`${platform} ${window.day}: ${seeds.length} seeds`)
      for (const seed of seeds) {
        const done = `history:${platform}:${window.day}:${seed.puuid}`
        if (store.checkpoint(run.id, done)) continue
        const ids = new Set<string>()
        for (let start = 0; ; start += 100) {
          const query = new URLSearchParams({
            queue: '420',
            startTime: String(Math.floor(window.start / 1000)),
            endTime: String(Math.ceil(window.end / 1000)),
            start: String(start),
            count: '100',
          })
          const response = await client.get(
            routing[platform],
            `/lol/match/v5/matches/by-puuid/${encodeURIComponent(seed.puuid)}/ids?${query}`,
            'history',
            `${run.id}:${done}:${start}`,
          )
          if (
            !Array.isArray(response.value) ||
            response.value.some(
              (x) => typeof x !== 'string' || !new RegExp(`^${platform}_[0-9]+$`).test(x),
            )
          )
            throw new Error('Invalid match ID list')
          for (const id of response.value) ids.add(id)
          if (response.value.length < 100) break
        }
        const chosen = [...ids]
          .sort((a, b) => hash(`${run.seed}:${a}`).localeCompare(hash(`${run.seed}:${b}`)))
          .slice(0, run.config.matchesPerSeedPerDay)
        store.transaction(() => {
          for (const id of chosen) {
            store.db
              .prepare('INSERT OR IGNORE INTO run_matches VALUES(?,?,?)')
              .run(run.id, id, platform)
            store.db
              .prepare('INSERT OR IGNORE INTO match_sources VALUES(?,?,?,?)')
              .run(run.id, id, seed.puuid, window.day)
          }
          store.saveCheckpoint(run.id, done, true)
        })
      }
    }
    const matches = store.db
      .prepare('SELECT match_id FROM run_matches WHERE run_id=? AND platform=? ORDER BY match_id')
      .all(run.id, platform) as { match_id: string }[]
    report(`${platform}: ${matches.length} unique match candidates; fetching details and ranks`)
    for (const { match_id: id } of matches) {
      const response = await client.get(
        routing[platform],
        `/lol/match/v5/matches/${id}`,
        'match',
        `match:${id}`,
      )
      const result = normalize(response.value, id, run.config, champions, run.start, run.end)
      if (result.match)
        for (const pair of result.match.pairs)
          for (const p of [pair.a, pair.b]) await rankPlayer(store, client, run, platform, p.puuid)
    }
    store.saveCheckpoint(run.id, `complete:${platform}`, true)
  }
  run.complete = true
  store.saveRun(run)
  report(`Run ${run.id} complete. Run aggregate, then export.`)
}
