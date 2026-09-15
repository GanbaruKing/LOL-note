import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Client } from '../src/collector/client.js'
import { collect } from '../src/collector/collect.js'
import { aggregate } from '../src/aggregator/aggregate.js'
import { exportJson } from '../src/exporter/json.js'
import { setup, fixture, at } from './fixtures.js'

test('429 Retry-After is honored and successful responses never refetched', async () => {
  const s = setup()
  let now = at,
    calls = 0
  const starts: number[] = []
  try {
    const transport = (async () => {
      calls++
      starts.push(now)
      return calls === 1
        ? new Response('', {
            status: 429,
            headers: { 'Retry-After': '180', 'X-Rate-Limit-Type': 'application' },
          })
        : Response.json({ ok: true })
    }) as typeof fetch
    const client = new Client(s.store, s.run.config, s.run.id, 'TEST-ONLY', transport, {
      now: () => now,
      sleep: async (ms) => {
        now += ms
      },
    })
    await client.get('asia', '/test', 'match', 'x')
    assert.ok(starts[1] - starts[0] >= 180000)
    await client.get('asia', '/test', 'match', 'x')
    assert.equal(calls, 2)
  } finally {
    s.close()
  }
})
test('application and method count headers delay the next request', async () => {
  const s = setup()
  let now = at
  const starts: number[] = []
  try {
    const client = new Client(
      s.store,
      s.run.config,
      s.run.id,
      'TEST-ONLY',
      (async () => {
        starts.push(now)
        return Response.json(
          {},
          { headers: { 'X-App-Rate-Limit': '100:120', 'X-App-Rate-Limit-Count': '99:120' } },
        )
      }) as typeof fetch,
      {
        now: () => now,
        sleep: async (ms) => {
          now += ms
        },
      },
    )
    await client.get('asia', '/test', 'match', 'a')
    await client.get('asia', '/test', 'history', 'b')
    assert.ok(starts[1] - starts[0] >= 120000)
  } finally {
    s.close()
  }
})
test('retry delay persists across interruption; 403 stops and does not retry automatically', async () => {
  const s = setup()
  let now = at
  try {
    const first = new Client(
      s.store,
      s.run.config,
      s.run.id,
      'TEST-ONLY',
      (async () =>
        new Response('', { status: 429, headers: { 'Retry-After': '180' } })) as typeof fetch,
      {
        now: () => now,
        sleep: async () => {
          throw new Error('simulated stop')
        },
      },
    )
    await assert.rejects(first.get('asia', '/test', 'match', 'persist'), /simulated stop/)
    const starts: number[] = []
    const second = new Client(
      s.store,
      s.run.config,
      s.run.id,
      'TEST-ONLY',
      (async () => {
        starts.push(now)
        return Response.json({})
      }) as typeof fetch,
      {
        now: () => now,
        sleep: async (ms) => {
          now += ms
        },
      },
    )
    await second.get('asia', '/test', 'match', 'persist')
    assert.ok(starts[0] >= at + 180000)
    let calls = 0
    const denied = new Client(
      s.store,
      s.run.config,
      s.run.id,
      'TEST-ONLY',
      (async () => {
        calls++
        return new Response('', { status: 403 })
      }) as typeof fetch,
      {
        now: () => now,
        sleep: async (ms) => {
          now += ms
        },
      },
    )
    await assert.rejects(denied.get('asia', '/test', 'match', 'denied'), /403/)
    await assert.rejects(denied.get('asia', '/test', 'match', 'denied'), /previously failed/)
    assert.equal(calls, 1)
  } finally {
    s.close()
  }
})
test('storage rollback and single process lock protect incomplete writes', () => {
  const s = setup()
  try {
    assert.throws(() =>
      s.store.transaction(() => {
        s.store.saveCheckpoint(s.run.id, 'partial', true)
        throw new Error('stop')
      }),
    )
    assert.equal(s.store.checkpoint(s.run.id, 'partial'), undefined)
    const unlock = s.store.lock()
    assert.throws(() => s.store.lock(), /Another stats process/)
    unlock()
    const again = s.store.lock()
    again()
  } finally {
    s.close()
  }
})

test('incomplete collection cannot be exported as a complete snapshot', () => {
  const s = setup()
  try {
    const path = join(s.dir, 'processed', 'stats.sqlite')
    aggregate(s.store, s.run, path, true)
    assert.throws(() => exportJson(path, join(s.dir, 'output'), s.run.id), /preview/)
    const dir = exportJson(path, join(s.dir, 'output'), s.run.id, true)
    const data = JSON.parse(readFileSync(join(dir, 'statistics.json'), 'utf8'))
    assert.equal(data.metadata.preview, true)
    assert.equal(data.metadata.coverageComplete, false)
  } finally {
    s.close()
  }
})

test('unknown rank after bounded 404 retries excludes only that role pair', async () => {
  const s = setup({ seedsPerRegionPerDay: 1 })
  let now = at,
    missingCalls = 0
  try {
    const transport = (async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname
      if (path.includes('masterleagues'))
        return Response.json({ entries: [{ puuid: 'private-player-0' }] })
      if (path.endsWith('/ids')) return Response.json(['JP1_1'])
      if (path.endsWith('/matches/JP1_1')) return Response.json(fixture())
      if (path.endsWith('private-player-9')) {
        missingCalls++
        return new Response('', { status: 404 })
      }
      return Response.json([{ queueType: 'RANKED_SOLO_5x5', tier: 'MASTER', rank: 'I' }])
    }) as typeof fetch
    await collect(
      s.store,
      new Client(s.store, s.run.config, s.run.id, 'TEST-ONLY', transport, {
        now: () => now,
        sleep: async (ms) => {
          now += ms
        },
      }),
      s.run,
      () => {},
    )
    assert.equal(missingCalls, 3)
    assert.equal(s.run.complete, true)
    const result = aggregate(s.store, s.run, join(s.dir, 'processed', 'stats.sqlite'))
    assert.equal(result.quality.acceptedPairs, 4)
    assert.equal(result.quality.exclusions.rank_pair, 1)
  } finally {
    s.close()
  }
})
test('collector resumes budget interruption, aggregates idempotently, exports no player data; CLI works offline', async () => {
  const s = setup({ requestBudget: 4, seedsPerRegionPerDay: 1 })
  let now = at
  const calls: string[] = []
  const clock = {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms
    },
  }
  const transport = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    calls.push(url.pathname)
    if (url.pathname.includes('masterleagues'))
      return Response.json({ entries: [{ puuid: 'private-player-0' }] })
    if (url.pathname.endsWith('/ids')) return Response.json(['JP1_1', 'JP1_1'])
    if (url.pathname.endsWith('/matches/JP1_1')) return Response.json(fixture())
    if (url.pathname.includes('/entries/by-puuid/'))
      return Response.json([{ queueType: 'RANKED_SOLO_5x5', tier: 'MASTER', rank: 'I' }])
    throw new Error('Unexpected endpoint')
  }) as typeof fetch
  try {
    const unlock = s.store.lock()
    await assert.rejects(
      collect(
        s.store,
        new Client(s.store, s.run.config, s.run.id, 'TEST-ONLY', transport, clock),
        s.run,
        () => {},
      ),
      /budget/,
    )
    assert.throws(
      () => aggregate(s.store, s.run, join(s.dir, 'processed', 'stats.sqlite')),
      /incomplete/,
    )
    s.run.config.requestBudget = 100
    await collect(
      s.store,
      new Client(s.store, s.run.config, s.run.id, 'TEST-ONLY', transport, clock),
      s.run,
      () => {},
    )
    assert.equal(s.run.complete, true)
    assert.equal(calls.filter((x) => x.endsWith('/matches/JP1_1')).length, 1)
    assert.equal(calls.filter((x) => x.endsWith('/ids')).length, 1)
    const path = join(s.dir, 'processed', 'stats.sqlite'),
      first = aggregate(s.store, s.run, path),
      second = aggregate(s.store, s.run, path)
    assert.equal(first.datasetId, second.datasetId)
    assert.equal(second.quality.acceptedPairs, 5)
    const db = new DatabaseSync(path)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM matchup_pairs').get()!.n, 5)
    db.close()
    const output = exportJson(path, join(s.dir, 'output'), s.run.id)
    const text = readFileSync(join(output, 'statistics.json'), 'utf8')
    assert.doesNotMatch(text, /private-player|puuid|TEST-ONLY|X-Riot-Token/)
    const data = JSON.parse(text)
    assert.equal(data.schemaVersion, 2)
    assert.equal(data.matchups.TOP['6'][0].games, 1)
    assert.equal(data.metadata.coverageComplete, true)
    unlock()
    // Execute the actual TypeScript CLI, with no key, for offline commands.
    const cwd = fileURLToPath(new URL('..', import.meta.url))
    for (const command of ['aggregate', 'export']) {
      const env = { ...process.env }
      delete env.RIOT_API_KEY
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'src/cli/index.ts', command, '--data', s.dir],
        { cwd, env, encoding: 'utf8' },
      )
      assert.equal(result.status, 0, result.stderr)
    }
  } finally {
    s.close()
  }
})
