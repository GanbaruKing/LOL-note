import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { NotebookRepository } from '../src/main/repository'
import catalog from '../resources/champions.json'

const key = { myChampionId: 266, enemyChampionId: 122, role: 'TOP' }
const input = { key, category: 'Laning', body: '相手のQに注意する' }

test('champion notes are independent, validate inputs and scope edits to their champion', () => {
  const repo = new NotebookRepository(':memory:', catalog.champions)
  try {
    const general = { championId: 266, category: 'General', body: '基本コンボを練習する' }
    const note = repo.addChampionNote(general).notes[0]
    assert.equal(repo.getMatchup(key).notes.length, 0)
    assert.equal(repo.getChampionPage(122).notes.length, 0)
    assert.throws(() => repo.updateChampionNote({ ...general, championId: 122, id: note.id }))
    assert.throws(() => repo.deleteChampionNote({ championId: 122, id: note.id }))
    assert.throws(() => repo.addChampionNote({ ...general, body: ' ' }))
    assert.throws(() => repo.addChampionNote({ ...general, body: 'x'.repeat(10001) }))
    assert.throws(() => repo.addChampionNote({ ...general, category: 'bad' }))
    assert.throws(() => repo.getChampionPage(999999))
    assert.equal(
      repo.updateChampionNote({ ...general, id: note.id, body: 'コンボを更新' }).notes[0].body,
      'コンボを更新',
    )
    repo.addNote(input)
    repo.addNote({ ...input, key: { ...key, role: 'MID' } })
    repo.addNote({ ...input, key: { ...key, myChampionId: 86 } })
    const page = repo.getChampionPage(266)
    assert.equal(page.notes.length, 1)
    assert.equal(page.matchups.length, 2)
    assert.ok(page.matchups.every((m) => m.myChampionId === 266 && m.notes[0].body === input.body))
    assert.equal(repo.deleteChampionNote({ championId: 266, id: note.id }).notes.length, 0)
    assert.equal(repo.getMatchup(key).notes.length, 1)
  } finally {
    repo.close()
  }
})

test('v1 migration preserves existing matchup data and champion notes persist after restart', () => {
  const folder = mkdtempSync(join(tmpdir(), 'notebook-migration-')),
    file = join(folder, 'notebook.sqlite')
  let repo = new NotebookRepository(file, catalog.champions)
  try {
    repo.addNote(input)
    repo.saveOverview({ key, overview: { difficulty: 'Hard', rating: 4 } })
    repo.close()
    const legacy = new DatabaseSync(file)
    // Recreate the exact previous schema by removing only the v2 addition.
    legacy.exec('DROP TABLE champion_notes; PRAGMA user_version=1')
    legacy.close()
    repo = new NotebookRepository(file, catalog.champions)
    assert.equal(repo.getMatchup(key).notes[0].body, input.body)
    assert.equal(repo.getMatchup(key).rating, 4)
    repo.addChampionNote({ championId: 266, category: 'General', body: '単体メモ' })
    repo.close()
    repo = new NotebookRepository(file, catalog.champions)
    assert.equal(repo.getChampionPage(266).notes[0].body, '単体メモ')
    assert.equal(repo.getChampionPage(266).matchups[0].notes[0].body, input.body)
  } finally {
    repo.close()
    rmSync(folder, { recursive: true })
  }
})

test('read-only visits do not create matchups; note CRUD preserves identity and metadata', () => {
  const repo = new NotebookRepository(':memory:', catalog.champions)
  try {
    assert.equal(repo.getMatchup(key).id, null)
    assert.deepEqual(repo.listMatchups(), [])
    const first = repo.addNote(input)
    const note = first.notes[0]
    assert.equal(note.body, input.body)
    assert.equal(note.category, 'Laning')
    const updated = repo.updateNote({
      ...input,
      id: note.id,
      body: '更新したメモ',
      category: 'Trading',
    })
    assert.equal(updated.notes[0].id, note.id)
    assert.equal(updated.notes[0].createdAt, note.createdAt)
    assert.equal(updated.notes[0].body, '更新したメモ')
    assert.equal(updated.notes[0].category, 'Trading')
    assert.equal(repo.listMatchups()[0].noteCount, 1)
    assert.deepEqual(repo.deleteNote({ key, id: note.id }).notes, [])
    assert.equal(repo.listMatchups()[0].noteCount, 0)
  } finally {
    repo.close()
  }
})

test('notes and overview persist across reopening a real SQLite file', () => {
  const folder = mkdtempSync(join(tmpdir(), 'notebook-repository-'))
  const file = join(folder, 'notebook.sqlite')
  let repo = new NotebookRepository(file, catalog.champions)
  try {
    repo.addNote({ ...input, body: "日本語\n' ; DROP TABLE champions; --" })
    repo.saveOverview({ key, overview: { difficulty: 'Hard', rating: 4 } })
    repo.close()
    repo = new NotebookRepository(file, catalog.champions)
    const result = repo.getMatchup(key)
    assert.equal(result.notes[0].body, "日本語\n' ; DROP TABLE champions; --")
    assert.equal(result.rating, 4)
    assert.equal(result.difficulty, 'Hard')
    assert.equal(repo.listMatchups().length, 1)
  } finally {
    repo.close()
    rmSync(folder, { recursive: true })
  }
})

test('role, own champion and opponent are separate; edits cannot cross matchups', () => {
  const repo = new NotebookRepository(':memory:', catalog.champions)
  try {
    const first = repo.addNote(input)
    for (const otherKey of [
      { ...key, role: 'MID' },
      { ...key, myChampionId: 86 },
      { ...key, enemyChampionId: 86 },
    ]) {
      assert.equal(repo.getMatchup(otherKey).notes.length, 0)
      assert.throws(() => repo.updateNote({ ...input, key: otherKey, id: first.notes[0].id }))
      assert.throws(() => repo.deleteNote({ key: otherKey, id: first.notes[0].id }))
    }
    assert.equal(repo.listMatchups().length, 1)
    assert.equal(repo.getMatchup(key).notes[0].body, input.body)
  } finally {
    repo.close()
  }
})

test('invalid inputs fail without partial writes', () => {
  const repo = new NotebookRepository(':memory:', catalog.champions)
  try {
    for (const invalid of [
      null,
      {},
      { ...input, body: '  \n ' },
      { ...input, body: 'x'.repeat(10001) },
      { ...input, category: 'Invalid' },
      { ...input, key: { ...key, role: 'INVALID' } },
      { ...input, key: { ...key, myChampionId: 999999 } },
      { ...input, key: { ...key, enemyChampionId: '122' } },
    ])
      assert.throws(() => repo.addNote(invalid))
    for (const rating of [0, 6, 1.5, '5'])
      assert.throws(() => repo.saveOverview({ key, overview: { difficulty: 'Even', rating } }))
    assert.throws(() =>
      repo.saveOverview({ key, overview: { difficulty: 'Impossible', rating: 3 } }),
    )
    assert.deepEqual(repo.listMatchups(), [])
    assert.equal(repo.addNote({ ...input, body: 'x'.repeat(10000) }).notes[0].body.length, 10000)
  } finally {
    repo.close()
  }
})

test('future schema versions are rejected without rewriting the database', () => {
  const folder = mkdtempSync(join(tmpdir(), 'notebook-schema-')),
    file = join(folder, 'future.sqlite')
  try {
    const db = new DatabaseSync(file)
    db.exec('PRAGMA user_version = 99')
    db.close()
    assert.throws(() => new NotebookRepository(file, catalog.champions), /Unsupported/)
    const check = new DatabaseSync(file)
    assert.equal(check.prepare('PRAGMA user_version').get()!.user_version, 99)
    check.close()
  } finally {
    rmSync(folder, { recursive: true })
  }
})
