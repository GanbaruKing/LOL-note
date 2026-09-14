import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonStatisticsProvider, parseStatistics } from '../src/main/statistics'
import sample from '../resources/statistics-sample.json'
import catalog from '../resources/champions.json'

test('statistics return top ten after exact cohort and minimum-games filters', () => {
  const folder = mkdtempSync(join(tmpdir(), 'statistics-top-'))
  try {
    const file = join(folder, 'statistics.json')
    const rows = catalog.champions
      .slice(0, 12)
      .map((c, i) => ({
        myChampionId: c.id,
        enemyChampionId: 122,
        role: 'TOP',
        games: 100,
        wins: i + 40,
      }))
    writeFileSync(file, JSON.stringify({ ...sample, rows }))
    const provider = new JsonStatisticsProvider(file)
    const query = {
      enemyChampionId: 122,
      role: 'TOP',
      demo: false,
      region: 'JP1',
      rank: 'ALL',
      patch: '16.18',
      minGames: 100,
    }
    const result = provider.get(query)!
    assert.equal(result.rows.length, 10)
    assert.equal(result.rows[0].wins, 51)
    assert.equal(result.rows[9].wins, 42)
    assert.equal(provider.get({ ...query, minGames: 101 })!.rows.length, 0)
    for (const change of [{ region: 'KR' }, { rank: 'EMERALD_PLUS' }, { patch: '16.17' }])
      assert.equal(provider.get({ ...query, ...change }), null)
    for (const minGames of [0, -1, 1.5, 1000001])
      assert.throws(() => provider.get({ ...query, minGames }))
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('statistics filter exact enemy and role, include 100 games and sort wins/games', () => {
  const provider = new JsonStatisticsProvider('unused')
  const query = { enemyChampionId: 122, role: 'TOP', demo: true }
  assert.deepEqual(
    provider.get(query)!.rows.map((r) => r.myChampionId),
    [164, 266, 86],
  )
  assert.equal(provider.get({ ...query, role: 'MID' })!.rows.length, 0)
  assert.equal(provider.get({ ...query, enemyChampionId: 86 })!.rows.length, 0)
  assert.throws(() => provider.get({ ...query, role: '__proto__' }))
})

test('statistics import persists and invalid replacement preserves previous data', () => {
  const folder = mkdtempSync(join(tmpdir(), 'statistics-'))
  try {
    const destination = join(folder, 'statistics.json'),
      source = join(folder, 'import.json')
    const provider = new JsonStatisticsProvider(destination)
    const query = { enemyChampionId: 122, role: 'TOP', demo: false }
    assert.equal(provider.get(query), null)
    writeFileSync(source, JSON.stringify(sample))
    provider.import(source)
    const original = readFileSync(destination, 'utf8')
    assert.equal(new JsonStatisticsProvider(destination).get(query)!.source, sample.source)
    writeFileSync(source, '{invalid')
    assert.throws(() => provider.import(source))
    assert.equal(readFileSync(destination, 'utf8'), original)
    for (const rows of [
      [{ ...sample.rows[0], wins: 1001 }],
      [{ ...sample.rows[0], games: 0 }],
      [{ ...sample.rows[0], myChampionId: 999999 }],
      [sample.rows[0], sample.rows[0]],
    ])
      assert.throws(() => parseStatistics({ ...sample, rows }))
    assert.throws(() => parseStatistics({ ...sample, source: '' }))
    assert.throws(() => parseStatistics({ ...sample, generatedAt: 'invalid' }))
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
