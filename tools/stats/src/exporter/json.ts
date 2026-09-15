import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { randomUUID } from 'node:crypto'
import { object, roles } from '../config/index.js'
import type { Row } from '../aggregator/totals.js'

export function validateRows(rows: Row[]) {
  const seen = new Set<string>()
  for (const r of rows) {
    const key = `${r.role}:${r.champion}:${r.opponent}`
    if (
      seen.has(key) ||
      !roles.includes(r.role) ||
      ![
        r.champion,
        r.opponent,
        r.games,
        r.wins,
        r.losses,
        r.championOverallGames,
        r.opponentOverallGames,
      ].every(Number.isSafeInteger) ||
      r.champion === r.opponent ||
      r.games <= 0 ||
      r.wins < 0 ||
      r.losses < 0 ||
      r.wins + r.losses !== r.games ||
      Object.values(r.regionGames).reduce((a, b) => a + b, 0) !== r.games
    )
      throw new Error('Invalid export counts')
    seen.add(key)
    for (const n of [
      r.rawWinRate,
      r.championOverallWinRate,
      r.opponentOverallWinRate,
      r.expectedWinRate,
      r.confidenceLow,
      r.confidenceHigh,
    ])
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Invalid export rate')
    if (
      !Number.isFinite(r.matchupDelta) ||
      !Number.isFinite(r.rankingScore) ||
      r.confidenceLow > r.confidenceHigh
    )
      throw new Error('Invalid export statistic')
  }
}
export function exportJson(dbPath: string, output: string, runId: string, preview = false) {
  if (!existsSync(dbPath)) throw new Error('Run aggregate before export')
  const db = new DatabaseSync(dbPath, { readOnly: true })
  let data: { metadata: Record<string, unknown>; quality: unknown; rows: Row[] }
  try {
    const row = db
      .prepare('SELECT body FROM datasets WHERE run_id=? ORDER BY rowid DESC LIMIT 1')
      .get(runId) as { body: string } | undefined
    if (!row) throw new Error('No dataset for this run; run aggregate first')
    data = JSON.parse(row.body)
  } finally {
    db.close()
  }
  if ((!data.metadata.coverageComplete || data.metadata.preview) && !preview)
    throw new Error('Incomplete/preview dataset requires export --preview')
  validateRows(data.rows)
  const matchups: Record<string, Record<string, Row[]>> = Object.fromEntries(
    roles.map((role) => [role, {}]),
  )
  for (const row of data.rows) {
    const group = matchups[row.role]
    ;(group[row.opponent] ??= []).push(row)
  }
  const metadata: Record<string, unknown> = {
    ...data.metadata,
    preview: preview || !!data.metadata.preview,
    generatedAt: new Date().toISOString(),
  }
  const serialized = JSON.stringify({ schemaVersion: 2, metadata, matchups })
  // Defense in depth: only aggregate fields are allowed across the publishing boundary.
  const scan = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(scan)
      return
    }
    if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(object(v))) {
        if (/puuid|riot.?id|token|api.?key|summoner|authorization/i.test(k))
          throw new Error('Private field in export')
        scan(x)
      }
  }
  scan(JSON.parse(serialized))
  scan(data.quality)
  if (!/^[a-f0-9]{24}$/.test(String(metadata.datasetId))) throw new Error('Invalid dataset ID')
  const directory = join(output, String(metadata.datasetId), `export-${randomUUID()}`)
  mkdirSync(directory, { recursive: true })
  // Unique publication directory; manifest is written last, so interrupted exports are not complete artifacts.
  for (const [name, body] of [
    ['statistics.json', serialized],
    ['quality.json', JSON.stringify(data.quality)],
  ] as const) {
    writeFileSync(join(directory, `${name}.tmp`), body)
    renameSync(join(directory, `${name}.tmp`), join(directory, name))
  }
  writeFileSync(join(directory, 'statistics.json.gz'), gzipSync(serialized))
  writeFileSync(
    join(directory, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      datasetId: metadata.datasetId,
      files: ['statistics.json', 'statistics.json.gz', 'quality.json'],
      complete: true,
    }),
  )
  return directory
}
