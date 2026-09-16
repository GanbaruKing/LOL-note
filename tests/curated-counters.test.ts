import { test } from 'node:test'
import assert from 'node:assert/strict'
import catalog from '../resources/champions.json'
import data from '../resources/counter-notes.json'

test('bundled counter notes have valid lane-specific picks and traceable evidence', () => {
  const ids = new Set(catalog.champions.map((c) => c.id))
  const pairs = new Set<string>()
  const counts = new Map<string, number>()
  for (const entry of data.entries) {
    const key = `${entry.championId}-${entry.role}`
    const pair = `${key}-${entry.counterId}`
    assert(ids.has(entry.championId) && ids.has(entry.counterId), pair)
    assert.notEqual(entry.championId, entry.counterId)
    assert(['TOP', 'JUNGLE', 'MID', 'BOTTOM', 'SUPPORT'].includes(entry.role))
    assert(!pairs.has(pair), pair)
    pairs.add(pair)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    assert(entry.reason.length > 10 && entry.reason.length < 220, pair)
    assert.equal(entry.evidence.length, 2)
    assert.equal(new Set(entry.evidence.map((e) => e.patch)).size, 2)
    for (const evidence of entry.evidence) {
      assert(evidence.games >= 100, pair)
      assert(evidence.counterWinRate > 50 && evidence.counterWinRate < 100, pair)
    }
    const games = entry.evidence.reduce((sum, e) => sum + e.games, 0)
    assert(games >= (entry.basis === 'wiki-matchup' ? 500 : 1000), pair)
    assert.equal(entry.sources.length, 4)
    for (const source of entry.sources) {
      const url = new URL(source.url)
      assert.equal(url.protocol, 'https:')
      assert(['op.gg', 'www.loljp-wiki.jp'].includes(url.hostname))
    }
  }
  assert([...counts.values()].every((count) => count >= 1 && count <= 3))
  assert.equal(new Set(data.entries.map((e) => e.role)).size, 5)
})
