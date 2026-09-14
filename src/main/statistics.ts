import { readFileSync, writeFileSync, renameSync, statSync } from 'node:fs'
import { ROLES, type StatisticsData, type StatisticsQuery } from '../shared/contracts'
import { object, parseKey, positiveId, ValidationError } from '../shared/validation'
import catalog from '../../resources/champions.json'
import sample from '../../resources/statistics-sample.json'

const ids = new Set(catalog.champions.map((c) => c.id))
export function parseStatistics(input: unknown): StatisticsData {
  const v = object(input)
  if (v.schemaVersion !== 1 || typeof v.isDemo !== 'boolean')
    throw new ValidationError('統計の形式が正しくありません。')
  const fields = ['source', 'patch', 'region', 'rank', 'queue', 'generatedAt'] as const
  for (const field of fields) {
    if (typeof v[field] !== 'string' || !v[field].trim() || v[field].length > 200)
      throw new ValidationError(`統計の${field}を指定してください。`)
  }
  if (!Number.isFinite(Date.parse(v.generatedAt as string)))
    throw new ValidationError('統計の作成日時が正しくありません。')
  if (!Array.isArray(v.rows) || v.rows.length > 100000)
    throw new ValidationError('統計行数が正しくありません。')
  const seen = new Set<string>()
  const rows = v.rows.map((row) => {
    const r = object(row),
      key = parseKey(r),
      games = positiveId(r.games)
    if (
      !ids.has(key.myChampionId) ||
      !ids.has(key.enemyChampionId) ||
      !Number.isSafeInteger(r.wins) ||
      (r.wins as number) < 0 ||
      (r.wins as number) > games
    )
      throw new ValidationError('チャンピオン、勝利数、試合数を確認してください。')
    const unique = `${key.myChampionId}-${key.enemyChampionId}-${key.role}`
    if (seen.has(unique)) throw new ValidationError('同じ対面の統計が重複しています。')
    seen.add(unique)
    return { ...key, games, wins: r.wins as number }
  })
  return {
    schemaVersion: 1,
    isDemo: v.isDemo as boolean,
    source: v.source as string,
    patch: v.patch as string,
    region: v.region as string,
    rank: v.rank as string,
    queue: v.queue as string,
    generatedAt: v.generatedAt as string,
    rows,
  }
}

export interface StatisticsProvider {
  get(input: unknown): StatisticsData | null
}
export class JsonStatisticsProvider implements StatisticsProvider {
  constructor(private file: string) {}
  private read(file: string) {
    if (statSync(file).size > 20 * 1024 * 1024)
      throw new ValidationError('統計JSONは20MB以下にしてください。')
    try {
      return parseStatistics(JSON.parse(readFileSync(file, 'utf8')))
    } catch (e) {
      if (e instanceof ValidationError) throw e
      throw new ValidationError('統計JSONを読み込めません。')
    }
  }
  import(file: string) {
    const data = this.read(file)
    writeFileSync(`${this.file}.tmp`, JSON.stringify(data), 'utf8')
    renameSync(`${this.file}.tmp`, this.file)
  }
  get(input: unknown): StatisticsData | null {
    const q = object(input)
    if (
      !ids.has(positiveId(q.enemyChampionId)) ||
      !ROLES.includes(q.role as never) ||
      typeof q.demo !== 'boolean'
    )
      throw new ValidationError('統計の検索条件が正しくありません。')
    let data: StatisticsData
    try {
      data = q.demo ? parseStatistics(sample) : this.read(this.file)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
    const query = q as unknown as StatisticsQuery
    return {
      ...data,
      rows: data.rows
        .filter(
          (r) =>
            r.enemyChampionId === query.enemyChampionId && r.role === query.role && r.games >= 100,
        )
        .sort(
          (a, b) =>
            b.wins / b.games - a.wins / a.games ||
            b.games - a.games ||
            a.myChampionId - b.myChampionId,
        ),
    }
  }
}
