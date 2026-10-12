import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { NotebookRepository } from '../src/main/repository'
import { BackupProtection } from '../src/main/protection'
import { emptyLoadout } from '../src/shared/loadout'
import { cooldownValue, cooldownHint } from '../src/shared/cooldowns'
import catalog from '../resources/champions.json'
const key = { myChampionId: 266, enemyChampionId: 122, role: 'TOP' as const }
const book = {
  chapters: [{ id: 'chapter', title: 'ウェーブ' }],
  articles: [
    {
      id: 'article',
      chapterId: 'chapter',
      title: 'リコール',
      body: 'ウェーブを押す',
      favorite: true,
      updatedAt: '2026-10-12T00:00:00Z',
    },
  ],
}

test('unified search covers every note store and normalizes kana, width and token AND queries', () => {
  const r = new NotebookRepository(':memory:', catalog.champions)
  try {
    r.addNote({ key, category: 'General', body: 'Ghostを待つ', verifiedPatch: '16.18' })
    r.saveChampionCounter({ championId: 122, body: '共通の対策' })
    r.saveKnowledgeBook(book)
    r.saveLoadout({
      key,
      loadout: { ...emptyLoadout(), buildNotes: '防御から始める', runeNotes: '耐久を優先' },
    })
    const q = { query: '', role: 'ALL', category: 'ALL', pinnedOnly: false }
    assert.equal(r.searchNotes({ ...q, query: 'だりうす Ｇｈｏｓｔ' })[0].verifiedPatch, '16.18')
    assert.equal(r.searchNotes({ ...q, query: '共通' })[0].scope, 'counter')
    assert.equal(r.searchNotes({ ...q, query: 'うぇーぶ りこーる' })[0].articleId, 'article')
    assert.equal(r.searchNotes({ ...q, query: '防御 耐久' })[0].scope, 'loadout')
    assert.equal(r.searchNotes({ ...q, query: '共通', role: 'TOP' }).length, 0)
    assert.equal(r.searchNotes({ ...q, pinnedOnly: true })[0].scope, 'book')
  } finally {
    r.close()
  }
})
test('trash restoration keeps metadata, never overwrites a reused note ID and survives backup/restart', () => {
  const folder = mkdtempSync(join(tmpdir(), 'riftnote-trash-')),
    path = join(folder, 'test.sqlite')
  let r = new NotebookRepository(path, catalog.champions)
  try {
    const original = r.addNote({
      key,
      category: 'General',
      body: '元の知識',
      verifiedPatch: '16.18.1',
    }).notes[0]
    r.pinNote({ scope: 'matchup', id: original.id, pinned: true })
    r.deleteNote({ key, id: original.id })
    const later = r.addNote({ key, category: 'General', body: '後から追加' }).notes[0]
    assert.equal(r.listTrash().length, 1)
    const backup = r.exportBackup()
    r.close()
    r = new NotebookRepository(path, catalog.champions)
    r.restoreBackup(backup)
    const trashId = r.listTrash()[0].id
    r.restoreTrash(trashId)
    const notes = r.getMatchup(key).notes
    assert.equal(notes.length, 2)
    assert.equal(notes.find((n) => n.id === later.id)?.body, '後から追加')
    assert.equal(notes.find((n) => n.body === '元の知識')?.pinned, 1)
    assert.equal(notes.find((n) => n.body === '元の知識')?.verifiedPatch, '16.18.1')
    assert.equal(r.listTrash().length, 0)
    assert.throws(() => r.restoreTrash(trashId))
  } finally {
    r.close()
  }
})
test('templates isolate champions and lanes, and backup v4 preserves them while v3 imports default safely', () => {
  const r = new NotebookRepository(':memory:', catalog.champions)
  try {
    const loadout = { ...emptyLoadout(), buildNotes: '共通ビルド' }
    r.saveTemplate({ championId: 266, role: 'TOP', loadout })
    assert.equal(r.getTemplate({ championId: 266, role: 'MID' }), null)
    assert.equal(r.getLoadout(key).buildNotes, '')
    const backup = r.exportBackup()
    r.restoreBackup(backup)
    assert.deepEqual(r.getTemplate({ championId: 266, role: 'TOP' }), loadout)
    const invalid = structuredClone(backup)
    invalid.templates[0].championId = 999999
    assert.throws(() => r.restoreBackup(invalid))
    assert.deepEqual(r.getTemplate({ championId: 266, role: 'TOP' }), loadout)
    r.restoreBackup({
      ...backup,
      version: 3,
      templates: undefined,
      trash: undefined,
      deletedArticles: undefined,
    })
    assert.equal(r.getTemplate({ championId: 266, role: 'TOP' }), null)
  } finally {
    r.close()
  }
})
test('deleted notebook articles restore individually without rolling back other edits', () => {
  const r = new NotebookRepository(':memory:', catalog.champions)
  try {
    r.saveKnowledgeBook(book)
    r.saveKnowledgeBook({ chapters: [], articles: [] })
    assert.equal(r.getDeletedArticles().articles[0].id, 'article')
    const backup = r.exportBackup()
    r.restoreBackup(backup)
    r.saveKnowledgeBook({
      chapters: [],
      articles: [{ ...book.articles[0], id: 'another', chapterId: null, title: '新しい記事' }],
    })
    const restored = r.restoreDeletedArticle('article')
    assert.equal(restored.articles.length, 2)
    assert.equal(restored.chapters[0].id, 'chapter')
    assert.equal(r.getDeletedArticles().articles.length, 0)
  } finally {
    r.close()
  }
})
test('automatic backups deduplicate, keep 20 generations and preserve manual files; corrupt latest recovers', () => {
  const folder = mkdtempSync(join(tmpdir(), 'riftnote-auto-'))
  const r = new NotebookRepository(':memory:', catalog.champions)
  try {
    const p = new BackupProtection(folder, r)
    writeFileSync(join(folder, 'manual.json'), 'keep')
    assert.equal(p.snapshot().error, '')
    p.snapshot()
    assert.equal(readdirSync(folder).filter((n) => n.startsWith('auto-')).length, 1)
    for (let i = 0; i < 23; i++) {
      r.saveChampionCounter({ championId: 122, body: `対策 ${i}` })
      p.snapshot()
    }
    assert.equal(readdirSync(folder).filter((n) => n.startsWith('auto-')).length, 20)
    assert.equal(readFileSync(join(folder, 'manual.json'), 'utf8'), 'keep')
    const backup = JSON.parse(readFileSync(p.status().lastBackup!, 'utf8'))
    assert.equal(backup.tables.champion_counters[0].body, '対策 22')
    writeFileSync(p.status().lastBackup!, 'broken')
    const restarted = new BackupProtection(folder, r)
    assert.equal(restarted.snapshot().error, '')
    assert.equal(JSON.parse(readFileSync(restarted.status().lastBackup!, 'utf8')).version, 4)
  } finally {
    r.close()
  }
})
test('short valid cooldowns remain visible and missing fixed cooldowns are labelled accurately', () => {
  assert.equal(cooldownValue([0.5, 0.4, 0.3, 0.2, 0.1]), '0.5 / 0.4 / 0.3 / 0.2 / 0.1')
  assert.equal(cooldownValue([0, 0, 0]), '固定CD未収録')
  assert.match(cooldownHint(157, 'E'), /同じ対象/)
  assert.match(cooldownHint(126, 'Q'), /ハンマー/)
})
