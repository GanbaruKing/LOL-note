import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { days, hash } from '../config/index.js'
import { getRank } from '../collector/collect.js'
import { normalize, validRank, type Match } from '../processor/match.js'
import { sampleMatches } from '../processor/sampling.js'
import type { Store, Run } from '../storage/store.js'
import { totals } from './totals.js'

export function aggregate(store: Store, run: Run, path: string, preview = false) {
  if (!run.complete && !preview)
    throw new Error('Collection incomplete; resume collect or explicitly use --preview')
  const reasons: Record<string, number> = {},
    decisions: { id: string; reason: string }[] = [],
    candidates: Match[] = []
  const reject = (id: string, reason: string) => {
    decisions.push({ id, reason })
    reasons[reason] = (reasons[reason] ?? 0) + 1
  }
  const discovered = store.db
    .prepare('SELECT match_id FROM run_matches WHERE run_id=? ORDER BY match_id')
    .all(run.id) as { match_id: string }[]
  for (const { match_id: id } of discovered) {
    const raw = store.cached(`match:${id}`)
    if (!raw) {
      reject(id, 'not_fetched')
      continue
    }
    const result = normalize(raw.value, id, run.config, new Set(run.champions), run.start, run.end)
    if (!result.match) {
      reject(id, result.reason)
      continue
    }
    const m = result.match
    for (const reason of m.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1
    m.pairs = m.pairs.filter((pair) => {
      const ok = [pair.a, pair.b].every((p) =>
        validRank(getRank(store, run.id, m.platform, p.puuid), m.timestamp, run.config),
      )
      if (!ok) reasons.rank_pair = (reasons.rank_pair ?? 0) + 1
      return ok
    })
    if (!m.pairs.length) {
      reject(id, 'no_valid_pairs')
      continue
    }
    candidates.push(m)
  }
  const sample = sampleMatches(candidates, run.config, run.seed)
  for (const d of sample.excluded) reject(d.id, d.reason)
  const rows = totals(sample.accepted, run.config)
  const playerCounts = new Map<string, number>(),
    tiers: Record<string, number> = {},
    regions: Record<string, number> = {}
  for (const m of sample.accepted) {
    regions[m.platform] = (regions[m.platform] ?? 0) + 1
    for (const p of m.players) playerCounts.set(p.puuid, (playerCounts.get(p.puuid) ?? 0) + 1)
    for (const pair of m.pairs)
      for (const p of [pair.a, pair.b]) {
        const tier = getRank(store, run.id, m.platform, p.puuid)!.tier!
        tiers[tier] = (tiers[tier] ?? 0) + 1
      }
  }
  const coverage = Object.fromEntries(
    run.config.platforms.map((p) => [
      p,
      {
        complete: !!store.checkpoint(run.id, `complete:${p}`),
        games: regions[p] ?? 0,
        days: days(run.start, run.end).map((d) => ({
          day: d.day,
          start: d.start,
          end: d.end,
          games: sample.regionDays[`${p}:${d.day}`] ?? 0,
          target: run.config.matchesPerRegionPerDay,
          attainment: (sample.regionDays[`${p}:${d.day}`] ?? 0) / run.config.matchesPerRegionPerDay,
        })),
      },
    ]),
  )
  const quality = {
    discoveredMatches: discovered.length,
    validBeforeSampling: candidates.length,
    acceptedMatches: sample.accepted.length,
    acceptedPairs: sample.accepted.reduce((n, m) => n + m.pairs.length, 0),
    exclusions: reasons,
    uniquePlayers: playerCounts.size,
    maxPlayerDailyGames: sample.maxPlayerDailyGames,
    maxPlayerMatchShare: sample.accepted.length
      ? [...playerCounts.values()].reduce((a, b) => Math.max(a, b), 0) / sample.accepted.length
      : 0,
    tierParticipantCounts: tiers,
    coverage,
    metrics: store.metrics(run.id),
  }
  const configHash = hash(JSON.stringify(run.config)),
    datasetId = hash(`${run.id}:${configHash}:processor-v1`).slice(0, 24)
  const metadata = {
    isDemo: false,
    patch: run.config.patch,
    region: run.config.platforms.length === 1 ? run.config.platforms[0] : 'GLOBAL',
    platforms: run.config.platforms,
    queue: run.config.queue,
    tier:
      ['EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'].every((t) =>
        run.config.tiers.includes(t),
      ) && run.config.tiers.length === 5
        ? 'EMERALD_PLUS'
        : 'CUSTOM',
    tiers: run.config.tiers,
    rankBasis: 'current_rank_snapshot',
    sampling: 'region_daily_quota_player_capped_v1',
    modelVersion: 'mean_baseline_v1',
    rankingVersion: 'wilson_lower_minus_expected_v1',
    collectorVersion: '0.1.0',
    datasetId,
    configHash,
    window: { start: run.start, end: run.end },
    coverageComplete: run.complete && Object.values(coverage).every((c) => c.complete),
    coverage,
    preview,
    rateUnit: 'percent',
    deltaUnit: 'percentage_points',
    confidenceLevel: 0.95,
    settings: run.config,
    source: 'Riot Match-v5; configured-region sample, not worldwide census',
  }
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  try {
    if (Number(db.prepare('PRAGMA user_version').get()!.user_version) > 1)
      throw new Error('Processed database version is newer than this collector')
    db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY,run_id TEXT,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dataset_matches(dataset_id TEXT,match_id TEXT,reason TEXT,PRIMARY KEY(dataset_id,match_id));
      CREATE TABLE IF NOT EXISTS matchup_pairs(dataset_id TEXT,match_id TEXT,role TEXT,body TEXT,PRIMARY KEY(dataset_id,match_id,role)); PRAGMA user_version=1;`)
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM dataset_matches WHERE dataset_id=?').run(datasetId)
      db.prepare('DELETE FROM matchup_pairs WHERE dataset_id=?').run(datasetId)
      for (const d of decisions)
        db.prepare('INSERT INTO dataset_matches VALUES(?,?,?)').run(datasetId, d.id, d.reason)
      for (const m of sample.accepted) {
        db.prepare('INSERT INTO dataset_matches VALUES(?,?,?)').run(datasetId, m.id, 'accepted')
        for (const pair of m.pairs)
          db.prepare('INSERT INTO matchup_pairs VALUES(?,?,?,?)').run(
            datasetId,
            m.id,
            pair.role,
            JSON.stringify({
              platform: m.platform,
              timestamp: m.timestamp,
              ...pair,
              ranks: [
                getRank(store, run.id, m.platform, pair.a.puuid),
                getRank(store, run.id, m.platform, pair.b.puuid),
              ],
            }),
          )
      }
      db.prepare('INSERT OR REPLACE INTO datasets VALUES(?,?,?)').run(
        datasetId,
        run.id,
        JSON.stringify({ metadata, quality, rows }),
      )
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  } finally {
    db.close()
  }
  return { datasetId, quality }
}
