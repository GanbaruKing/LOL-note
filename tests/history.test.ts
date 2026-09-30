import { splitReviewNote, joinReviewNote } from '../src/shared/reviewNote'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HistoryService,
  parseHistoryGame,
  parseHistoryList,
  parseHistoryMatch,
} from '../src/main/history'
import { historyRole, resolveHistoryRoles } from '../src/main/history-roles'
import { historyFixture, timelineFixture } from './history-fixtures'

test('history identifies own participant by PUUID, filters unsupported games and strips identity', () => {
  const raw = historyFixture()
  raw.participants.reverse()
  assert.equal(parseHistoryGame(raw, 'test-own')?.championId, 266)
  assert.equal(parseHistoryGame(raw, 'test-stranger'), null)
  const list = parseHistoryList(
    {
      games: {
        games: [
          raw,
          raw,
          { ...raw, mapId: 12 },
          { ...raw, gameCreation: 1e20 },
          { ...raw, gameId: '12345' },
        ],
      },
    },
    'test-own',
  )
  assert.equal(list.games.length, 1)
  assert.equal(list.skipped, 3)
  assert.ok(!JSON.stringify(list).includes('test-own'))
  assert.ok(!JSON.stringify(list).includes('not-for-renderer'))
  assert.throws(() => parseHistoryList({}, 'test-own'))
  assert.throws(() => parseHistoryMatch(raw, 'test-own', 2))
  assert.throws(() =>
    parseHistoryMatch(
      { ...raw, participants: raw.participants.filter((p) => p.teamId === 200) },
      'test-own',
      raw.gameId,
    ),
  )
  assert.equal(parseHistoryList({ games: { games: [] } }, 'test-own').games.length, 0)
  assert.equal(
    parseHistoryList(
      { games: { games: Array.from({ length: 25 }, (_, i) => historyFixture(i + 1)) } },
      'test-own',
    ).games.length,
    20,
  )
})
test('role mappings support live LCU CARRY/SUPPORT aliases and leave ambiguous roles unknown', () => {
  for (const alias of ['CARRY', 'DUO_CARRY'])
    assert.equal(historyRole({ timeline: { lane: 'BOTTOM', role: alias } }), 'BOTTOM')
  for (const alias of ['SUPPORT', 'DUO_SUPPORT'])
    assert.equal(historyRole({ timeline: { lane: 'BOT', role: alias } }), 'SUPPORT')
  assert.equal(historyRole({ timeline: { lane: 'NONE', role: 'SUPPORT' } }), null)
  const game = historyFixture()
  game.participants[0].timeline.lane = 'MIDDLE'
  const detail = parseHistoryMatch(game, 'test-own', game.gameId)
  assert.equal(detail.enemies.find((p) => p.championId === 122)?.role, null)
  assert.equal(detail.enemies.find((p) => p.championId === 103)?.role, null)
})
test('timeline recovers missing lanes and duplicate JUNGLE without using array order', () => {
  const game = historyFixture(),
    timeline = timelineFixture()
  for (const p of game.participants) p.timeline = { lane: 'NONE', role: 'SUPPORT' }
  game.participants.reverse()
  let detail = parseHistoryMatch(game, 'test-own', game.gameId, timeline)
  assert.equal(detail.role, 'TOP')
  assert.equal(detail.roleSource, 'timeline')
  assert.deepEqual(
    detail.enemies.map((p) => p.role),
    ['SUPPORT', 'BOTTOM', 'MID', 'JUNGLE', 'TOP'],
  )
  for (const p of game.participants)
    if (p.championId === 266 || p.championId === 122) p.timeline.lane = 'JUNGLE'
  detail = parseHistoryMatch(game, 'test-own', game.gameId, timeline)
  assert.equal(detail.role, 'TOP')
  assert.equal(detail.enemies.find((p) => p.championId === 122)?.role, 'TOP')
})
test('short games, duplicate frames, equal bottom CS and roaming do not force an assignment', () => {
  const game = historyFixture()
  for (const p of game.participants) p.timeline = { lane: 'NONE', role: 'NONE' }
  const timeline = timelineFixture()
  let roles = resolveHistoryRoles(game.participants, {
    frames: [timeline.frames[0], timeline.frames[0], timeline.frames[0]],
  })
  assert.equal(roles.get(6)?.role, null)
  assert.equal(roles.get(7)?.role, 'JUNGLE')
  for (const f of timeline.frames) {
    f.participantFrames['10'].minionsKilled = f.participantFrames['9'].minionsKilled
    f.participantFrames['6'].position = { x: 7000, y: 4000 }
  }
  roles = resolveHistoryRoles(game.participants, timeline)
  assert.equal(roles.get(6)?.role, null)
  assert.equal(roles.get(9)?.role, null)
  assert.equal(roles.get(10)?.role, null)
})
test('history service handles disconnect, account switches, optional timeline errors and invalid IDs', async () => {
  const raw = historyFixture(),
    paths: string[] = []
  let account = 'test-own',
    failTimeline = false
  const service = new HistoryService(
    async () => ({ port: 123, password: 'test-only' }),
    async (_credentials, path) => {
      paths.push(path)
      if (path.includes('current-summoner') && !path.includes('matches')) return { puuid: account }
      if (path.includes('game-timelines')) {
        if (failTimeline) throw new Error('private error')
        return timelineFixture()
      }
      if (path.includes('matches?')) return { games: { games: [raw] } }
      return raw
    },
  )
  assert.equal((await service.list()).games.length, 1)
  assert.equal((await service.detail(raw.gameId)).role, 'TOP')
  failTimeline = true
  assert.equal((await service.detail(raw.gameId)).role, 'TOP')
  const before = paths.length
  for (const value of ['../', -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])
    await assert.rejects(service.detail(value), /ゲームID/)
  assert.equal(paths.length, before)
  account = 'test-stranger'
  await assert.rejects(service.detail(raw.gameId), /自分の情報/)
  await assert.rejects(new HistoryService(async () => null).list(), /ログイン/)
  let calls = 0
  const switched = new HistoryService(
    async () => ({ port: 123, password: 'test-only' }),
    async (_c, path) => {
      if (path.includes('matches?')) return { games: { games: [raw] } }
      return { puuid: ++calls === 1 ? 'test-own' : 'test-other' }
    },
  )
  await assert.rejects(switched.list(), /アカウントが変わりました/)
})

test('review headers display separately without changing unrelated prose or legacy categories', () => {
  const legacy = {
    category: '振り返り' as const,
    body: '日付：2026/9/30\n試合ID：12345\n\n相手のQを避ける\n次の行',
  }
  const draft = splitReviewNote(legacy)
  assert.deepEqual(draft, {
    review: { date: '2026/9/30', gameId: '12345' },
    body: '相手のQを避ける\n次の行',
  })
  const stored = joinReviewNote(draft.body, draft.review)
  assert.match(stored, /ゲームID：12345/)
  assert.deepEqual(splitReviewNote({ category: '振り返り', body: stored }), draft)
  assert.equal(joinReviewNote(draft.body, null), draft.body)
  for (const note of [
    { ...legacy, category: 'General' as const },
    { ...legacy, body: '本文\n' + legacy.body },
    { ...legacy, body: '日付：2026/9/30\n試合ID：12345\n本文' },
  ])
    assert.deepEqual(splitReviewNote(note), { review: null, body: note.body })
})
