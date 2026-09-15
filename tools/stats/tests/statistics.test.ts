import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize, validRank } from '../src/processor/match.js'
import { sampleMatches, sampleSeeds } from '../src/processor/sampling.js'
import { totals } from '../src/aggregator/totals.js'
import { wilson, expectedWinRate, confidence } from '../src/aggregator/model.js'
import { validateConfig, reprocessingConfig } from '../src/config/index.js'
import { config, fixture, at } from './fixtures.js'
const c = { ...config, patch: '16.18' }
const norm = (raw = fixture()) =>
  normalize(
    raw,
    raw.metadata.matchId,
    c,
    new Set(Array.from({ length: 10 }, (_, i) => i + 1)),
    at - 1,
    at + 1,
  )
test('pairs are opposite team and same role; both directions conserve wins and deduplicate', () => {
  const m = norm().match!
  assert.equal(m.pairs.length, 5)
  for (const p of m.pairs) {
    assert.notEqual(p.a.team, p.b.team)
    assert.equal(p.a.role, p.b.role)
  }
  const rows = totals([m, m], c)
  assert.equal(rows.length, 10)
  assert.equal(
    rows.reduce((n, r) => n + r.games, 0),
    10,
  )
  assert.equal(
    rows.reduce((n, r) => n + r.wins, 0),
    5,
  )
  for (const r of rows) {
    const reverse = rows.find((s) => s.champion === r.opponent && s.opponent === r.champion)!
    assert.equal(r.wins, reverse.losses)
    assert.ok(Math.abs(r.matchupDelta + reverse.matchupDelta) < 1e-10)
  }
})
test('wrong patch, queue, remake, malformed, short and duplicate players excluded', () => {
  const cases = [
    (r: ReturnType<typeof fixture>) => (r.info.gameVersion = '16.17.1'),
    (r: ReturnType<typeof fixture>) => (r.info.queueId = 440),
    (r: ReturnType<typeof fixture>) => (r.info.gameDuration = 100),
    (r: ReturnType<typeof fixture>) => (r.info.participants[0].gameEndedInEarlySurrender = true),
    (r: ReturnType<typeof fixture>) =>
      (r.info.participants[1].puuid = r.info.participants[0].puuid),
  ]
  for (const mutate of cases) {
    const raw = fixture()
    mutate(raw)
    assert.ok(norm(raw).reason)
  }
  assert.equal(normalize(null, 'JP1_1', c, new Set(), at - 1, at + 1).reason, 'malformed')
})
test('role conflicts exclude the pair without guessing roles or dropping valid other lanes', () => {
  const raw = fixture()
  raw.info.participants[0].individualPosition = 'MIDDLE'
  const m = norm(raw).match!
  assert.equal(m.pairs.length, 4)
  assert.equal(
    m.pairs.some((p) => p.role === 'TOP'),
    false,
  )
})
test('unknown, lower and temporally distant ranks are not eligible', () => {
  assert.equal(validRank(undefined, at, c), false)
  assert.equal(validRank({ tier: 'GOLD', division: 'I', fetchedAt: at }, at, c), false)
  assert.equal(
    validRank({ tier: 'EMERALD', division: 'IV', fetchedAt: at + 49 * 3600000 }, at, c),
    false,
  )
  assert.equal(validRank({ tier: 'EMERALD', division: 'IV', fetchedAt: at }, at, c), true)
})
test('Wilson known values, edge counts, confidence buckets, isolated expected model', () => {
  const [lo, hi] = wilson(530, 1000)
  assert.ok(Math.abs(lo - 49.9010309093) < 1e-8)
  assert.ok(Math.abs(hi - 56.0760085398) < 1e-8)
  assert.equal(wilson(0, 100)[0], 0)
  assert.equal(wilson(100, 100)[1], 100)
  assert.throws(() => wilson(0, 0))
  assert.throws(() => wilson(2, 1))
  assert.equal(expectedWinRate(54, 50), 52)
  assert.deepEqual(
    [99, 100, 299, 300, 999, 1000].map((n) => confidence(n, [100, 300, 1000])),
    ['VERY_LOW', 'LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH'],
  )
})
test('sampling is deterministic, caps all participants and enforces independent region quotas', () => {
  const a = norm().match!,
    b = { ...a, id: 'JP1_2' },
    kr = { ...a, id: 'KR_1', platform: 'KR' }
  const conf = { ...c, matchesPerPlayerPerDay: 1, matchesPerRegionPerDay: 1 }
  const x = sampleMatches([a, b, kr, a], conf, 'seed'),
    y = sampleMatches([kr, b, a], conf, 'seed')
  assert.deepEqual(
    x.accepted.map((m) => m.id),
    y.accepted.map((m) => m.id),
  )
  assert.equal(x.accepted.length, 2)
  assert.equal(x.maxPlayerDailyGames, 1)
  const capped = sampleMatches([a, b], { ...conf, matchesPerRegionPerDay: 10 }, 'seed')
  assert.equal(capped.excluded[0].reason, 'player_quota')
})
test('seed selection spans tier strata and never duplicates a player', () => {
  const pool = Array.from({ length: 100 }, (_, i) => ({
    puuid: String(i),
    tier: i < 80 ? 'EMERALD' : 'DIAMOND',
    division: 'I',
  }))
  const seeds = sampleSeeds([...pool, pool[0]], 10, 'seed')
  assert.equal(seeds.length, 10)
  assert.equal(seeds.filter((s) => s.tier === 'DIAMOND').length, 2)
  assert.deepEqual(sampleSeeds(pool.slice().reverse(), 10, 'seed'), seeds)
})
test('config rejects typos, arbitrary hosts, invalid thresholds and credential fields', () => {
  assert.deepEqual(validateConfig(config), config)
  for (const v of [
    { ...config, apiKey: 'secret' },
    { ...config, platforms: ['attacker.test'] },
    { ...config, confidenceThresholds: [100, 50, 1000] },
    { ...config, requestBudget: 0 },
  ])
    assert.throws(() => validateConfig(v))
})

test('offline reprocessing permits thresholds but cannot relabel the sampled population', () => {
  assert.equal(reprocessingConfig(c, { ...c, minimumGames: 300 }).minimumGames, 300)
  assert.equal(reprocessingConfig(c, { ...c, patch: 'auto' }).patch, c.patch)
  assert.throws(() => reprocessingConfig(c, { ...c, platforms: ['JP1'] }), /new collection/)
  assert.throws(() => reprocessingConfig(c, { ...c, tiers: ['GOLD'] }), /new collection/)
})
