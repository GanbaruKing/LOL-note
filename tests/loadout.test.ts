import itemCategories from '../resources/item-categories.json'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { NotebookRepository } from '../src/main/repository'
import { emptyLoadout } from '../src/shared/loadout'
import catalog from '../resources/champions.json'
import data from '../resources/loadout.json'
const key = { myChampionId: 266, enemyChampionId: 122, role: 'TOP' }
test('loadouts persist separately by matchup and restore atomically with personal picks', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'loadout-')), 'test.sqlite')
  let repo = new NotebookRepository(path, catalog.champions)
  const primary = data.trees[0],
    secondary = data.trees[1]
  const loadout = {
    ...emptyLoadout(),
    items: [data.items[0].id, data.items[1].id],
    primary: primary.id,
    secondary: secondary.id,
    primaryRunes: primary.slots.map((s) => s.runes[0].id),
    secondaryRunes: secondary.slots.slice(1, 3).map((s) => s.runes[0].id),
    shards: [5008, 5008, 5001],
    buildNotes: '素材から購入',
    runeNotes: '対面に合わせる',
  }
  repo.saveMyPick(key)
  repo.addNote({ key, category: '振り返り', body: '日付と試合ID' })
  repo.saveLoadout({ key, loadout })
  repo.close()
  repo = new NotebookRepository(path, catalog.champions)
  assert.deepEqual(repo.getLoadout(key), loadout)
  assert.deepEqual(repo.getLoadout({ ...key, role: 'MID' }), emptyLoadout())
  const backup = repo.exportBackup()
  const invalid = structuredClone(backup)
  invalid.loadouts[0].key.enemyChampionId = 999999
  assert.throws(() => repo.restoreBackup(invalid))
  assert.deepEqual(repo.exportBackup().loadouts, backup.loadouts)
  assert.throws(() => repo.saveLoadout({ key, loadout: { ...loadout, secondary: primary.id } }))
  assert.throws(() =>
    repo.saveLoadout({
      key,
      loadout: {
        ...loadout,
        secondaryRunes: secondary.slots[1].runes.slice(0, 2).map((r) => r.id),
      },
    }),
  )
  repo.saveLoadout({ key, loadout: emptyLoadout() })
  repo.restoreBackup(backup)
  assert.deepEqual(repo.getLoadout(key), loadout)
  assert.equal(repo.listMyPicks(key).length, 1)
  repo.restoreBackup({ ...backup, version: 2, loadouts: undefined })
  assert.deepEqual(repo.getLoadout(key), emptyLoadout())
  assert.equal(repo.listMyPicks(key).length, 1)
  repo.close()
})
test('v5 category migration preserves pinned notes and picks and accepts review notes', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'migration-')), 'test.sqlite')
  let repo = new NotebookRepository(path, catalog.champions)
  const note = repo.addNote({ key, category: 'General', body: '既存メモ' }).notes[0]
  repo.pinNote({ scope: 'matchup', id: note.id, pinned: true })
  repo.saveMyPick(key)
  const before = repo.exportBackup().tables
  repo.close()
  const db = new DatabaseSync(path)
  // Recreate the historical v5 category CHECK, not merely its version number.
  for (const [table, foreign, target] of [
    ['matchup_notes', 'matchup_id', 'matchups'],
    ['champion_notes', 'champion_id', 'champions'],
  ]) {
    db.exec(`CREATE TABLE ${table}_old (
      id INTEGER PRIMARY KEY, ${foreign} INTEGER NOT NULL REFERENCES ${target}(id),
      category TEXT NOT NULL CHECK(category IN ('General','Laning','Trading','All-in','Item','Rune','Wave','Jungle','Late Game','Other')),
      body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0);
      INSERT INTO ${table}_old SELECT id,${foreign},category,body,created_at,updated_at,pinned FROM ${table};
      DROP TABLE ${table}; ALTER TABLE ${table}_old RENAME TO ${table};`)
  }
  db.exec('PRAGMA user_version=5')
  db.close()
  repo = new NotebookRepository(path, catalog.champions)
  assert.deepEqual(repo.exportBackup().tables, before)
  repo.addNote({ key, category: '振り返り', body: '新しい振り返り' })
  assert.equal(repo.getMatchup(key).notes.length, 2)
  repo.close()
})

test('shop classifications cover the pinned catalogue and allow multi-role items', () => {
  assert.equal(itemCategories.version, data.version)
  const categories: Record<string, string[]> = itemCategories.categories
  assert.deepEqual(
    Object.keys(categories)
      .map(Number)
      .sort((a, b) => a - b),
    data.items.map((x) => x.id).sort((a, b) => a - b),
  )
  for (const values of Object.values(categories))
    for (const value of values)
      assert.ok(['fighter', 'marksman', 'assassin', 'mage', 'tank', 'support'].includes(value))
  assert.ok(categories[3078].includes('fighter'))
  assert.ok(categories[3089].includes('mage'))
  assert.ok(categories[3153].includes('fighter') && categories[3153].includes('marksman'))
})
