import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, normalizeMatch, RiotClient } from '../src/collector/riot'
import { parseStatistics } from '../src/main/statistics'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function fixture() {
  const positions = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']
  return {
    metadata: { matchId: 'JP1_1' },
    info: {
      platformId: 'JP1',
      queueId: 420,
      mapId: 11,
      gameMode: 'CLASSIC',
      gameDuration: 1800,
      gameVersion: '16.18.1.123',
      participants: [100, 200].flatMap((teamId) =>
        positions.map((teamPosition, i) => ({
          teamId,
          teamPosition,
          championId: (teamId === 100 ? [266, 64, 103, 22, 12] : [122, 11, 1, 51, 40])[i],
          win: teamId === 100,
          gameEndedInEarlySurrender: false,
        })),
      ),
    },
  }
}
test('collector pairs opposite teams by role, excludes invalid matches and deduplicates', () => {
  const raw = fixture(),
    match = normalizeMatch(raw, 'JP1_1')!
  assert.equal(match.pairs.length, 10)
  const result = parseStatistics(aggregate([match, match], '16.18'))
  assert.equal(result.rows.find((r) => r.myChampionId === 266)!.wins, 1)
  assert.equal(result.rows.find((r) => r.myChampionId === 122)!.wins, 0)
  assert.equal(result.rows[0].games, 1)
  assert.equal(aggregate([match], '16.17').rows.length, 0)
  raw.info.participants[0].teamPosition = 'JUNGLE'
  assert.equal(normalizeMatch(raw, 'JP1_1'), null)
  for (const change of [{ queueId: 450 }, { platformId: 'KR' }, { gameDuration: 120 }]) {
    const other = fixture()
    Object.assign(other.info, change)
    assert.equal(normalizeMatch(other, 'JP1_1'), null)
  }
  const remake = fixture()
  remake.info.participants[0].gameEndedInEarlySurrender = true
  assert.equal(normalizeMatch(remake, 'JP1_1'), null)
  assert.throws(() => normalizeMatch(fixture(), 'JP1_2'))
})
test('Riot client respects retry-after, fixes destination and sanitizes auth errors', async () => {
  const waits: number[] = [],
    requests: string[] = []
  let call = 0
  const client = new RiotClient(
    'test-secret',
    (async (url, init) => {
      requests.push(String(url))
      assert.equal((init!.headers as Record<string, string>)['X-Riot-Token'], 'test-secret')
      assert.equal(init!.redirect, 'error')
      return call++ === 0
        ? new Response('', { status: 429, headers: { 'Retry-After': '2' } })
        : Response.json({ ok: true })
    }) as typeof fetch,
    async (ms) => {
      waits.push(ms)
    },
    () => 5000,
  )
  await client.get('/lol/match/v5/matches/JP1_1')
  assert.ok(waits.includes(2000))
  assert.ok(requests.every((u) => u.startsWith('https://asia.api.riotgames.com/')))
  await assert.rejects(() => client.get('https://example.com'))
  const denied = new RiotClient(
    'test-secret',
    (async () => new Response('test-secret', { status: 403 })) as typeof fetch,
    async () => {},
  )
  await assert.rejects(
    () => denied.get('/lol/match/v5/matches/JP1_1'),
    (e: Error) => e.message.includes('期限切れ') && !e.message.includes('test-secret'),
  )
})

test('collector CLI exports importable JSON and caches only aggregation fields', () => {
  const directory = mkdtempSync(join(tmpdir(), 'riot-cli-'))
  try {
    const raw = fixture()
    const mock = join(directory, 'mock.mjs')
    writeFileSync(
      mock,
      `globalThis.fetch = async (url) => {
      if (url.includes('/accounts/')) return Response.json({puuid:'private-puuid'});
      if (url.includes('/ids?')) return Response.json(['JP1_1']);
      return Response.json(${JSON.stringify(raw)});
    };`,
    )
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        pathToFileURL(createRequire(resolve('package.json')).resolve('tsx')).href,
        '--import',
        pathToFileURL(mock).href,
        resolve('src/collector/cli.ts'),
        '--riot-id',
        'Fixture#JP1',
        '--count',
        '1',
        '--patch',
        '16.18',
      ],
      { cwd: directory, env: { ...process.env, RIOT_API_KEY: 'test-secret' }, encoding: 'utf8' },
    )
    assert.ok(output.includes('完了'))
    assert.ok(!output.includes('test-secret'))
    const result = parseStatistics(
      JSON.parse(readFileSync(join(directory, '.riot-data/statistics.json'), 'utf8')),
    )
    assert.equal(result.isDemo, false)
    assert.equal(result.rows.length, 10)
    const cached = readFileSync(join(directory, '.riot-data/matches/JP1_1.json'), 'utf8')
    assert.ok(!cached.includes('puuid'))
    assert.ok(!cached.includes('test-secret'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
