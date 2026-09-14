import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonStatisticsProvider, parseStatistics } from '../src/main/statistics'
import sample from '../resources/statistics-sample.json'

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
