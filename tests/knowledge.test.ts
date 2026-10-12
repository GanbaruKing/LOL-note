import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NotebookRepository } from '../src/main/repository'
import { parseKnowledgeBook } from '../src/shared/knowledge'
import type { KnowledgeBook } from '../src/shared/contracts'
import catalog from '../resources/champions.json'

const book: KnowledgeBook = {
  chapters: [
    { id: 'lane', title: 'レーン戦' },
    { id: 'macro', title: 'マクロ' },
  ],
  articles: [
    {
      id: 'wave',
      chapterId: 'lane',
      title: 'ウェーブ管理',
      body: '## 判断の基準\n- [ ] 次のウェーブを確認',
      favorite: true,
      updatedAt: '2026-09-23T00:00:00.000Z',
    },
  ],
}
test('knowledge book persists independently and restores atomically with backups', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lol-book-')),
    path = join(dir, 'notebook.sqlite')
  let repo = new NotebookRepository(path, catalog.champions)
  try {
    repo.addChampionNote({ championId: 122, category: 'General', body: '既存メモ' })
    repo.setLeagueFolder('local-only')
    assert.deepEqual(repo.getKnowledgeBook(), { chapters: [], articles: [] })
    repo.saveKnowledgeBook(book)
    repo.close()
    repo = new NotebookRepository(path, catalog.champions)
    assert.deepEqual(repo.getKnowledgeBook(), book)
    assert.equal(repo.getChampionPage(122).notes[0].body, '既存メモ')
    const backup = repo.exportBackup()
    assert.equal(backup.version, 4)
    assert.deepEqual(backup.knowledgeBook, book)
    repo.saveKnowledgeBook({ chapters: [], articles: [] })
    repo.restoreBackup(backup)
    assert.deepEqual(repo.getKnowledgeBook(), book)
    const invalid = structuredClone(backup)
    invalid.knowledgeBook.articles[0].title = '書き換わってはいけない'
    invalid.tables.champion_notes[0].champion_id = 999999
    assert.throws(() => repo.restoreBackup(invalid))
    assert.deepEqual(repo.getKnowledgeBook(), book)
    const legacy = {
      format: backup.format,
      version: 1,
      createdAt: backup.createdAt,
      tables: backup.tables,
    }
    repo.restoreBackup(legacy)
    assert.deepEqual(repo.getKnowledgeBook(), { chapters: [], articles: [] })
    assert.equal(repo.getLeagueFolder(), 'local-only')
    assert.equal(repo.getChampionPage(122).notes[0].body, '既存メモ')
  } finally {
    repo.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
test('knowledge book rejects malformed and oversized documents without replacing saved content', () => {
  const repo = new NotebookRepository(':memory:', catalog.champions)
  try {
    repo.saveKnowledgeBook(book)
    for (const invalid of [
      null,
      { chapters: [], articles: book.articles },
      { ...book, chapters: [...book.chapters, book.chapters[0]] },
      ...[
        { title: '' },
        { body: 'a'.repeat(50001) },
        { favorite: 1 },
        { id: '../x' },
        { id: 'all' },
        { updatedAt: 'not-a-date' },
      ].map((patch) => ({ ...book, articles: [{ ...book.articles[0], ...patch }] })),
    ]) {
      assert.throws(() => repo.saveKnowledgeBook(invalid))
      assert.deepEqual(repo.getKnowledgeBook(), book)
    }
    assert.equal(
      parseKnowledgeBook({
        ...book,
        articles: [{ ...book.articles[0], body: '<script>not executable</script>' }],
      }).articles[0].body,
      '<script>not executable</script>',
    )
  } finally {
    repo.close()
  }
})
