import { compareShopItems, itemTier } from '../src/shared/itemShop'
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
test('page saves commit drafts together and roll back partial writes on validation or ownership errors', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'page-save-')), 'test.sqlite')
  const repo = new NotebookRepository(path, catalog.champions)
  try {
    repo.saveMyPick(key)
    const picks = repo.exportBackup().tables.my_picks
    const loadout = { ...emptyLoadout(), buildNotes: 'ページのビルド', runeNotes: 'ページのルーン' }
    const result = repo.savePage({
      scope: 'matchup',
      key,
      loadout,
      note: { category: 'General', body: '同時保存' },
    })
    assert.deepEqual(result.loadout, loadout)
    assert.equal(result.matchup?.notes[0].body, '同時保存')
    const original = repo.exportBackup()
    assert.throws(() =>
      repo.savePage({
        scope: 'matchup',
        key,
        loadout: { ...loadout, buildNotes: 'ロールバック' },
        note: { category: 'General', body: '' },
      }),
    )
    assert.deepEqual(repo.exportBackup().loadouts, original.loadouts)
    assert.deepEqual(repo.exportBackup().tables, original.tables)
    const otherNote = repo.addNote({
      key: { ...key, role: 'MID' },
      category: 'General',
      body: '別ページ',
    }).notes[0]
    assert.throws(() =>
      repo.savePage({
        scope: 'matchup',
        key,
        loadout: emptyLoadout(),
        note: { id: otherNote.id, category: 'General', body: '誤更新' },
      }),
    )
    assert.deepEqual(repo.getLoadout(key), loadout)
    const updated = repo.savePage({
      scope: 'matchup',
      key,
      note: { id: result.matchup!.notes[0].id, category: 'Rune', body: '編集保存' },
    })
    assert.equal(updated.matchup?.notes.length, 1)
    assert.equal(updated.matchup?.notes[0].body, '編集保存')
    repo.savePage({
      scope: 'champion',
      championId: 122,
      counterBody: '共通対策',
      note: { category: 'General', body: 'チャンピオンメモ' },
    })
    const champion = repo.getChampionPage(122)
    assert.equal(champion.counterStrategy, '共通対策')
    assert.equal(champion.notes[0].body, 'チャンピオンメモ')
    assert.throws(() =>
      repo.savePage({
        scope: 'champion',
        championId: 122,
        counterBody: '失敗する対策',
        note: { category: 'invalid', body: '無効なメモ' },
      }),
    )
    assert.deepEqual(repo.getChampionPage(122), champion)
    repo.savePage({ scope: 'champion', championId: 122, counterBody: '' })
    assert.equal(repo.getChampionPage(122).counterStrategy, '')
    assert.deepEqual(repo.exportBackup().tables.my_picks, picks)
  } finally {
    repo.close()
  }
})
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

test('shop orders basic items before components and completed items, then by price', () => {
  const sample = [3078, 1036, 3057, 1001, 3089, 1028].map((id) =>
    data.items.find((x) => x.id === id)!,
  )
  assert.equal(itemTier(1036), 0)
  assert.equal(itemTier(3057), 1)
  assert.equal(itemTier(3078), 2)
  assert.equal(itemTier(2138), 0)
  assert.equal(itemTier(3179), 2)
  const ordered = sample.sort(compareShopItems)
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1],
      b = ordered[i]
    assert.ok(itemTier(a.id) <= itemTier(b.id))
    if (itemTier(a.id) === itemTier(b.id)) assert.ok(a.gold <= b.gold)
  }
  assert.equal(ordered.at(-1)?.id, 3089)
})
