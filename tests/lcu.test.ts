import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LcuService, parseLockfile, parseSession } from '../src/main/lcu'

const session = {
  localPlayerCellId: 2,
  gameId: 9,
  myTeam: [
    { cellId: 0, assignedPosition: 'jungle', championId: 64 },
    { cellId: 2, assignedPosition: 'middle', championId: 266 },
  ],
  theirTeam: [{ championId: 122 }, { championId: 0, championPickIntent: 86 }, { championId: 122 }],
}
test('LCU parser uses local cell and only visible picks without assigning enemy roles', () => {
  assert.deepEqual(parseSession(session), {
    role: 'MID',
    ownChampionId: 266,
    enemyChampionIds: [122],
  })
  assert.deepEqual(parseSession({ ...session, localPlayerCellId: -1 }), {
    role: null,
    ownChampionId: null,
    enemyChampionIds: [122],
  })
  assert.equal(
    parseSession({
      ...session,
      myTeam: [{ cellId: 2, assignedPosition: 'utility', championId: 0 }],
    }).role,
    'SUPPORT',
  )
  assert.throws(() => parseSession({}))
  assert.equal(
    parseSession({
      ...session,
      myTeam: [{ cellId: 2, assignedPosition: 'constructor', championId: 0 }],
    }).role,
    null,
  )
  assert.throws(() => parseSession({ ...session, theirTeam: null }))
})
test('lockfile validation confines protocol and port', () => {
  assert.deepEqual(parseLockfile('LeagueClient:123:4567:test-only:https'), {
    port: 4567,
    password: 'test-only',
  })
  for (const value of [
    '',
    'LeagueClient:123:70000:test:https',
    'LeagueClient:123:4567:test:http',
    'LeagueClient:123:4567::https',
    'Other:1:123:a:https',
  ])
    assert.throws(() => parseLockfile(value))
})

test('own hover follows intent and active pick, preferring selected champion after lock or swap', () => {
  const hover = {
    ...session,
    myTeam: [{ cellId: 2, assignedPosition: 'top', championId: 0, championPickIntent: 266 }],
  }
  assert.equal(parseSession(hover).ownChampionId, 266)
  assert.equal(
    parseSession({ ...hover, myTeam: [{ ...hover.myTeam[0], championPickIntent: 86 }] })
      .ownChampionId,
    86,
  )
  assert.equal(
    parseSession({ ...hover, myTeam: [{ ...hover.myTeam[0], championPickIntent: 0 }] })
      .ownChampionId,
    null,
  )
  const action = {
    actorCellId: 2,
    type: 'pick',
    isInProgress: true,
    completed: false,
    championId: 122,
  }
  assert.equal(parseSession({ ...hover, actions: [[action]] }).ownChampionId, 122)
  assert.equal(
    parseSession({ ...hover, actions: [[{ ...action, type: 'ban' }]] }).ownChampionId,
    266,
  )
  assert.equal(
    parseSession({ ...hover, actions: [[{ ...action, actorCellId: 0 }]] }).ownChampionId,
    266,
  )
  assert.equal(
    parseSession({
      ...hover,
      myTeam: [{ ...hover.myTeam[0], championId: 86 }],
      actions: [[action]],
    }).ownChampionId,
    86,
  )
  assert.deepEqual(parseSession(hover).enemyChampionIds, [122])
})
test('polling clears stale data on disconnect/errors and renews selection session on reconnect', async () => {
  let connected = true,
    broken = false,
    phase = 'None'
  const service = new LcuService(
    async () => (connected ? { port: 1234, password: 'test-only' } : null),
    async (_credentials, path) => {
      if (broken) throw new Error('test')
      return path.includes('gameflow') ? phase : session
    },
  )
  await service.poll()
  assert.equal(service.snapshot().status, 'connected')
  phase = 'ChampSelect'
  await service.poll()
  assert.deepEqual(service.snapshot().enemyChampionIds, [122])
  const id = service.snapshot().sessionId
  await service.poll()
  assert.equal(service.snapshot().sessionId, id)
  broken = true
  await service.poll()
  assert.equal(service.snapshot().status, 'error')
  assert.deepEqual(service.snapshot().enemyChampionIds, [])
  broken = false
  await service.poll()
  assert.notEqual(service.snapshot().sessionId, id)
  connected = false
  await service.poll()
  assert.equal(service.snapshot().status, 'disconnected')
  assert.equal(service.snapshot().role, null)
})
