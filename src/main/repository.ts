import { randomUUID } from 'node:crypto'
import { matchesSearch } from '../shared/search'
import { parsePatch } from '../shared/validation'
import type { TrashNote, LoadoutTemplate } from '../shared/contracts'
import { emptyLoadout, parseLoadout } from '../shared/loadout'
import { DatabaseSync } from 'node:sqlite'
import { emptyKnowledgeBook, parseKnowledgeBook } from '../shared/knowledge'
import { backupTables, parseBackup, type NotebookBackup } from './backup'
import type {
  Champion,
  ChampionPage,
  Matchup,
  MatchupKey,
  MatchupSummary,
  Note,
  Overview,
  PoolEntry,
  MyPick,
  SearchHit,
} from '../shared/contracts'
import { CATEGORIES, DIFFICULTIES, ROLES } from '../shared/contracts'
import {
  object,
  parseKey,
  parseNote,
  parseNoteContent,
  parseOverview,
  positiveId,
  ValidationError,
} from '../shared/validation'

const sqlList = (items: readonly string[]) => items.map((v) => `'${v}'`).join(',')
export class NotebookRepository {
  private transactionDepth = 0
  private db: DatabaseSync
  constructor(path: string, champions: Champion[]) {
    this.db = new DatabaseSync(path)
    try {
      this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
      const version = this.db.prepare('PRAGMA user_version').get()!.user_version as number
      if (version > 7) throw new Error('Unsupported database version')
      this.transaction(() => {
        if (version === 0) {
          this.db.exec(`
            CREATE TABLE champions (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, name_ja TEXT NOT NULL);
            CREATE TABLE matchups (
              id INTEGER PRIMARY KEY,
              my_champion_id INTEGER NOT NULL REFERENCES champions(id),
              enemy_champion_id INTEGER NOT NULL REFERENCES champions(id),
              role TEXT NOT NULL CHECK(role IN (${sqlList(ROLES)})),
              difficulty TEXT NOT NULL DEFAULT 'Unset' CHECK(difficulty IN (${sqlList(DIFFICULTIES)})),
              rating INTEGER CHECK(rating BETWEEN 1 AND 5),
              updated_at TEXT NOT NULL,
              UNIQUE(my_champion_id, enemy_champion_id, role)
            );
            CREATE TABLE matchup_notes (
              id INTEGER PRIMARY KEY,
              matchup_id INTEGER NOT NULL REFERENCES matchups(id) ON DELETE CASCADE,
              category TEXT NOT NULL CHECK(category IN (${sqlList(CATEGORIES)})),
              body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 10000),
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX notes_matchup ON matchup_notes(matchup_id);
            PRAGMA user_version = 1;
          `)
        }
        if (version < 2) {
          this.db.exec(`
            CREATE TABLE champion_notes (
              id INTEGER PRIMARY KEY,
              champion_id INTEGER NOT NULL REFERENCES champions(id),
              category TEXT NOT NULL CHECK(category IN (${sqlList(CATEGORIES)})),
              body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 10000),
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX champion_notes_champion ON champion_notes(champion_id);
            PRAGMA user_version = 2;
          `)
        }
        if (version < 3) {
          this.db.exec(`
            CREATE TABLE champion_pool (
              champion_id INTEGER NOT NULL REFERENCES champions(id),
              role TEXT NOT NULL CHECK(role IN (${sqlList(ROLES)})),
              confidence INTEGER NOT NULL CHECK(confidence BETWEEN 1 AND 5),
              PRIMARY KEY(champion_id, role)
            );
            PRAGMA user_version = 3;
          `)
        }
        if (version < 4) {
          this.db.exec(`
            ALTER TABLE champion_notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1));
            ALTER TABLE matchup_notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1));
            CREATE TABLE my_picks (
              my_champion_id INTEGER NOT NULL REFERENCES champions(id),
              enemy_champion_id INTEGER NOT NULL REFERENCES champions(id),
              role TEXT NOT NULL CHECK(role IN (${sqlList(ROLES)})),
              priority INTEGER NOT NULL CHECK(priority BETWEEN 1 AND 99),
              confidence INTEGER NOT NULL CHECK(confidence BETWEEN 1 AND 5),
              PRIMARY KEY(my_champion_id, enemy_champion_id, role)
            );
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            PRAGMA user_version=4;
          `)
        }
        if (version < 5) {
          this.db.exec(`
            CREATE TABLE champion_counters (
              champion_id INTEGER PRIMARY KEY REFERENCES champions(id),
              body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 10000),
              updated_at TEXT NOT NULL
            );
            PRAGMA user_version=5;
          `)
        }
        if (version < 6) {
          for (const [table, foreign, target] of [
            ['matchup_notes', 'matchup_id', 'matchups'],
            ['champion_notes', 'champion_id', 'champions'],
          ]) {
            this.db.exec(`CREATE TABLE ${table}_new (
              id INTEGER PRIMARY KEY, ${foreign} INTEGER NOT NULL REFERENCES ${target}(id) ON DELETE CASCADE,
              category TEXT NOT NULL CHECK(category IN (${sqlList(CATEGORIES)})),
              body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 10000),
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
              pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)));
              INSERT INTO ${table}_new SELECT id,${foreign},category,body,created_at,updated_at,pinned FROM ${table};
              DROP TABLE ${table}; ALTER TABLE ${table}_new RENAME TO ${table};`)
          }
          this.db.exec(
            'CREATE INDEX notes_matchup ON matchup_notes(matchup_id); CREATE INDEX champion_notes_champion ON champion_notes(champion_id); PRAGMA user_version=6;',
          )
        }
        if (version < 7) {
          for (const table of ['champion_notes', 'matchup_notes']) {
            const columns = this.db.prepare(`PRAGMA table_info(${table})`).all()
            if (!columns.some((c) => c.name === 'verified_patch'))
              this.db.exec(
                `ALTER TABLE ${table} ADD COLUMN verified_patch TEXT NOT NULL DEFAULT ''`,
              )
          }
          this.db.exec('PRAGMA user_version=7')
        }
        const insert = this.db.prepare(
          'INSERT INTO champions (id, slug, name, name_ja) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, name=excluded.name, name_ja=excluded.name_ja',
        )
        for (const c of champions) insert.run(c.id, c.slug, c.name, c.nameJa)
      })
    } catch (error) {
      this.db.close()
      throw error
    }
  }
  close() {
    this.db.close()
  }
  savePage(input: unknown): import('../shared/contracts').PageSaveResult {
    const v = object(input)
    if (v.scope !== 'matchup' && v.scope !== 'champion')
      throw new ValidationError('保存するページが正しくありません。')
    return this.transaction(() => {
      const note = v.note === undefined ? undefined : object(v.note)
      if (v.scope === 'matchup') {
        const key = this.key(v.key)
        const loadout =
          v.loadout === undefined ? undefined : this.saveLoadout({ key, loadout: v.loadout })
        if (note) {
          const draft = { ...parseNoteContent(note), key, id: note.id }
          if (note.id === undefined) this.addNote(draft)
          else this.updateNote(draft)
        }
        return { matchup: this.getMatchup(key), loadout }
      }
      const championId = this.championId(v.championId)
      if (v.counterBody !== undefined) this.saveChampionCounter({ championId, body: v.counterBody })
      if (note) {
        const draft = { ...parseNoteContent(note), championId, id: note.id }
        if (note.id === undefined) this.addChampionNote(draft)
        else this.updateChampionNote(draft)
      }
      return { championPage: this.getChampionPage(championId) }
    })
  }
  private loadoutKey(input: unknown) {
    const key = this.key(input)
    return `loadout:${key.myChampionId}:${key.enemyChampionId}:${key.role}`
  }
  getLoadout(input: unknown) {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key=?')
      .get(this.loadoutKey(input))
    return row ? parseLoadout(JSON.parse(row.value as string)) : emptyLoadout()
  }
  saveLoadout(input: unknown) {
    const v = object(input),
      key = this.loadoutKey(v.key),
      loadout = parseLoadout(v.loadout)
    this.db
      .prepare(
        'INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(loadout))
    return loadout
  }
  private exportLoadouts() {
    return this.db
      .prepare("SELECT key,value FROM settings WHERE key LIKE 'loadout:%' ORDER BY key")
      .all()
      .map((row) => {
        const [, my, enemy, role] = (row.key as string).split(':')
        return {
          key: parseKey({ myChampionId: Number(my), enemyChampionId: Number(enemy), role }),
          loadout: parseLoadout(JSON.parse(row.value as string)),
        }
      })
  }
  getKnowledgeBook() {
    const row = this.db.prepare("SELECT value FROM settings WHERE key='knowledge-book'").get()
    return row ? parseKnowledgeBook(JSON.parse(row.value as string)) : emptyKnowledgeBook()
  }
  getDeletedArticles() {
    const row = this.db.prepare("SELECT value FROM settings WHERE key='deleted-articles'").get()
    return row ? parseKnowledgeBook(JSON.parse(row.value as string)) : emptyKnowledgeBook()
  }
  restoreDeletedArticle(input: unknown) {
    if (typeof input !== 'string') throw new ValidationError('記事IDが正しくありません。')
    return this.transaction(() => {
      const deleted = this.getDeletedArticles(),
        book = this.getKnowledgeBook()
      const article = deleted.articles.find((a) => a.id === input)
      if (!article || book.articles.some((a) => a.id === input))
        throw new ValidationError('復元する記事が見つからないか、同じ記事が存在します。')
      const chapter = deleted.chapters.find((c) => c.id === article.chapterId)
      if (chapter && !book.chapters.some((c) => c.id === chapter.id)) book.chapters.push(chapter)
      book.articles.push(article)
      const restored = this.saveKnowledgeBook(book, false)
      const articles = deleted.articles.filter((a) => a.id !== input)
      this.setSetting('deleted-articles', {
        articles,
        chapters: deleted.chapters.filter((c) => articles.some((a) => a.chapterId === c.id)),
      })
      return restored
    })
  }
  saveKnowledgeBook(input: unknown, retainDeleted = true) {
    const book = parseKnowledgeBook(input)
    return this.transaction(() => {
      if (retainDeleted) {
        const old = this.getKnowledgeBook(),
          deleted = this.getDeletedArticles()
        const removed = old.articles.filter((a) => !book.articles.some((b) => a.id === b.id))
        if (removed.length) {
          const articles = [
            ...deleted.articles.filter((a) => !removed.some((r) => r.id === a.id)),
            ...removed,
          ]
          const chapters = [...deleted.chapters]
          for (const chapter of old.chapters)
            if (
              removed.some((a) => a.chapterId === chapter.id) &&
              !chapters.some((c) => c.id === chapter.id)
            )
              chapters.push(chapter)
          this.setSetting('deleted-articles', parseKnowledgeBook({ articles, chapters }))
        }
      }
      this.setSetting('knowledge-book', book)
      return book
    })
  }
  exportBackup(): NotebookBackup {
    return this.transaction(() => ({
      format: 'lol-note',
      version: 4,
      templates: this.listTemplates(),
      trash: this.listTrash(),
      deletedArticles: this.getDeletedArticles(),
      loadouts: this.exportLoadouts(),
      knowledgeBook: this.getKnowledgeBook(),
      createdAt: new Date().toISOString(),
      tables: Object.fromEntries(
        Object.entries(backupTables).map(([table, columns]) => [
          table,
          this.db.prepare(`SELECT ${columns.join(',')} FROM ${table} ORDER BY rowid`).all(),
        ]),
      ) as NotebookBackup['tables'],
    }))
  }
  restoreBackup(input: unknown) {
    const backup = parseBackup(input)
    try {
      this.transaction(() => {
        this.db.exec("DELETE FROM settings WHERE key LIKE 'template:%' OR key LIKE 'trash:%'")
        for (const entry of backup.templates) this.saveTemplate(entry)
        for (const entry of backup.trash) this.setSetting(`trash:${entry.id}`, entry)
        this.setSetting('deleted-articles', backup.deletedArticles)
        this.saveKnowledgeBook(backup.knowledgeBook, false)
        this.db.exec("DELETE FROM settings WHERE key LIKE 'loadout:%'")
        for (const entry of backup.loadouts) this.saveLoadout(entry)
        for (const table of Object.keys(backupTables).reverse())
          this.db.exec(`DELETE FROM ${table}`)
        for (const [table, columns] of Object.entries(backupTables)) {
          const insert = this.db.prepare(
            `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          )
          for (const row of backup.tables[table as keyof typeof backupTables])
            insert.run(...columns.map((column) => row[column]))
        }
      })
    } catch {
      throw new ValidationError(
        '復元できませんでした。重複や未対応のチャンピオンを確認してください。現在のデータは保持されています。',
      )
    }
  }
  getLeagueFolder(): string | undefined {
    return this.db.prepare("SELECT value FROM settings WHERE key='leagueFolder'").get()?.value as
      string | undefined
  }
  setLeagueFolder(path: string) {
    this.db
      .prepare(
        "INSERT INTO settings(key,value) VALUES ('leagueFolder',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(path)
  }
  listMyPicks(input: unknown): MyPick[] {
    const v = object(input),
      enemyChampionId = this.championId(v.enemyChampionId)
    if (!ROLES.includes(v.role as never)) throw new ValidationError('Roleが正しくありません。')
    return this.db
      .prepare(
        'SELECT p.my_champion_id AS myChampionId, p.enemy_champion_id AS enemyChampionId, p.role, m.rating FROM my_picks p LEFT JOIN matchups m ON m.my_champion_id=p.my_champion_id AND m.enemy_champion_id=p.enemy_champion_id AND m.role=p.role WHERE p.enemy_champion_id=? AND p.role=? ORDER BY m.rating DESC, p.my_champion_id',
      )
      .all(enemyChampionId, v.role as string) as unknown as MyPick[]
  }
  saveMyPick(input: unknown): MyPick[] {
    const key = this.key(input)
    return this.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO my_picks(my_champion_id,enemy_champion_id,role,priority,confidence) VALUES (?,?,?,1,3) ON CONFLICT(my_champion_id,enemy_champion_id,role) DO NOTHING',
        )
        .run(key.myChampionId, key.enemyChampionId, key.role)
      return this.listMyPicks(key)
    })
  }
  removeMyPick(input: unknown): MyPick[] {
    const key = this.key(input)
    this.db
      .prepare('DELETE FROM my_picks WHERE my_champion_id=? AND enemy_champion_id=? AND role=?')
      .run(key.myChampionId, key.enemyChampionId, key.role)
    return this.listMyPicks(key)
  }
  pinNote(input: unknown): void {
    const v = object(input),
      id = positiveId(v.id)
    if ((v.scope !== 'champion' && v.scope !== 'matchup') || typeof v.pinned !== 'boolean')
      throw new ValidationError('Pin設定が正しくありません。')
    const table = v.scope === 'champion' ? 'champion_notes' : 'matchup_notes'
    if (
      !this.db
        .prepare(`UPDATE ${table} SET pinned=?, updated_at=? WHERE id=?`)
        .run(v.pinned ? 1 : 0, new Date().toISOString(), id).changes
    )
      throw new ValidationError('メモが見つかりません。')
  }
  searchNotes(input: unknown): SearchHit[] {
    const v = object(input)
    if (
      typeof v.query !== 'string' ||
      v.query.length > 200 ||
      (v.role !== 'ALL' && !ROLES.includes(v.role as never)) ||
      (v.category !== 'ALL' && !CATEGORIES.includes(v.category as never)) ||
      typeof v.pinnedOnly !== 'boolean'
    )
      throw new ValidationError('検索条件が正しくありません。')
    // Local personal notebooks are small. Normalize in JS for consistent Japanese/English AND search.
    const rows = this.db
      .prepare(
        `SELECT n.*, 'matchup' AS scope, m.my_champion_id AS championId, m.enemy_champion_id AS enemyId, m.role, a.name, a.name_ja, b.name AS enemyName, b.name_ja AS enemyNameJa FROM matchup_notes n JOIN matchups m ON m.id=n.matchup_id JOIN champions a ON a.id=m.my_champion_id JOIN champions b ON b.id=m.enemy_champion_id
      UNION ALL SELECT n.*, 'champion' AS scope, n.champion_id AS championId, NULL AS enemyId, NULL AS role, a.name, a.name_ja, '' AS enemyName, '' AS enemyNameJa FROM champion_notes n JOIN champions a ON a.id=n.champion_id`,
      )
      .all()
    const hits: SearchHit[] = rows.map((r) => ({
      id: r.id as number,
      body: r.body as string,
      category: r.category as Note['category'],
      pinned: r.pinned as number,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      verifiedPatch: r.verified_patch as string,
      scope: r.scope as SearchHit['scope'],
      championId: r.championId as number,
      key:
        r.scope === 'matchup'
          ? {
              myChampionId: r.championId as number,
              enemyChampionId: r.enemyId as number,
              role: r.role as MatchupKey['role'],
            }
          : null,
    }))
    for (const row of this.db.prepare('SELECT * FROM champion_counters').all()) {
      hits.push({
        id: row.champion_id as number,
        championId: row.champion_id as number,
        scope: 'counter',
        key: null,
        category: 'General',
        pinned: 0,
        body: row.body as string,
        title: '共通対策',
        createdAt: row.updated_at as string,
        updatedAt: row.updated_at as string,
      })
    }
    const book = this.getKnowledgeBook()
    for (const [index, article] of book.articles.entries()) {
      const chapter = book.chapters.find((c) => c.id === article.chapterId)?.title ?? '未分類'
      hits.push({
        id: index,
        articleId: article.id,
        championId: 0,
        scope: 'book',
        key: null,
        category: 'General',
        pinned: article.favorite ? 1 : 0,
        body: article.body,
        title: `Notebook / ${chapter} / ${article.title}`,
        createdAt: article.updatedAt,
        updatedAt: article.updatedAt,
      })
    }
    for (const [index, entry] of this.exportLoadouts().entries()) {
      if (!entry.loadout.buildNotes && !entry.loadout.runeNotes) continue
      hits.push({
        id: index,
        championId: entry.key.myChampionId,
        scope: 'loadout',
        key: entry.key,
        title: 'ビルド・ルーンの補足',
        body: `ビルド：${entry.loadout.buildNotes}\nルーン：${entry.loadout.runeNotes}`,
        category: 'General',
        pinned: 0,
        createdAt: '',
        updatedAt: '',
      })
    }
    const names = new Map(
      this.db
        .prepare('SELECT id,name,name_ja,slug FROM champions')
        .all()
        .map((c) => [c.id, `${c.name} ${c.name_ja} ${c.slug}`]),
    )
    return hits
      .filter(
        (h) =>
          (v.role === 'ALL' || h.key?.role === v.role) &&
          (v.category === 'ALL' || h.category === v.category) &&
          (!v.pinnedOnly || h.pinned === 1) &&
          matchesSearch(
            `${names.get(h.championId) ?? ''} ${h.key ? names.get(h.key.enemyChampionId) : ''} ${h.key?.role ?? ''} ${h.category} ${h.title ?? ''} ${h.body}`,
            v.query as string,
          ),
      )
      .sort((a, b) => b.pinned - a.pinned || b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id)
  }
  private setSetting(key: string, value: unknown) {
    this.db
      .prepare(
        'INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(value))
  }
  private templateKey(input: unknown) {
    const v = object(input)
    const championId = this.championId(v.championId)
    if (!ROLES.includes(v.role as never)) throw new ValidationError('レーンを選択してください。')
    return `template:${championId}:${v.role}`
  }
  getTemplate(input: unknown) {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key=?')
      .get(this.templateKey(input))
    return row ? parseLoadout(JSON.parse(row.value as string).loadout) : null
  }
  saveTemplate(input: unknown) {
    const v = object(input),
      key = this.templateKey(v)
    this.setSetting(key, {
      championId: v.championId,
      role: v.role,
      loadout: parseLoadout(v.loadout),
    })
  }
  private listTemplates(): LoadoutTemplate[] {
    return this.db
      .prepare("SELECT value FROM settings WHERE key LIKE 'template:%' ORDER BY key")
      .all()
      .map((r) => JSON.parse(r.value as string))
  }
  listTrash(): TrashNote[] {
    return this.db
      .prepare("SELECT value FROM settings WHERE key LIKE 'trash:%' ORDER BY key")
      .all()
      .map((r) => JSON.parse(r.value as string))
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  }
  private trashNote(entry: Omit<TrashNote, 'id' | 'deletedAt'>) {
    const id = randomUUID()
    this.setSetting(`trash:${id}`, { ...entry, id, deletedAt: new Date().toISOString() })
  }
  restoreTrash(input: unknown) {
    if (typeof input !== 'string' || !/^[a-f0-9-]{36}$/.test(input))
      throw new ValidationError('復元対象が正しくありません。')
    this.transaction(() => {
      const entry = this.listTrash().find((n) => n.id === input)
      if (!entry) throw new ValidationError('削除済みメモが見つかりません。')
      const note = parseNoteContent(entry.note)
      const table = entry.scope === 'champion' ? 'champion_notes' : 'matchup_notes'
      const foreign = entry.scope === 'champion' ? 'champion_id' : 'matchup_id'
      const parent =
        entry.scope === 'champion'
          ? this.championId(entry.championId)
          : this.ensure(this.key(entry.key))
      this.db
        .prepare(
          `INSERT INTO ${table} (${foreign},category,body,pinned,created_at,updated_at,verified_patch) VALUES (?,?,?,?,?,?,?)`,
        )
        .run(
          parent,
          note.category,
          note.body,
          entry.note.pinned,
          entry.note.createdAt,
          entry.note.updatedAt,
          parsePatch(entry.note.verifiedPatch),
        )
      this.db.prepare('DELETE FROM settings WHERE key=?').run(`trash:${input}`)
    })
  }

  listPool(): PoolEntry[] {
    return this.db
      .prepare(
        'SELECT champion_id AS championId, role, confidence FROM champion_pool ORDER BY role, confidence DESC, champion_id',
      )
      .all()
      .map((row) => ({
        championId: row.championId as number,
        role: row.role as PoolEntry['role'],
        confidence: row.confidence as number,
      }))
  }
  private poolKey(input: unknown) {
    const v = object(input),
      championId = this.championId(v.championId)
    if (!ROLES.includes(v.role as never)) throw new ValidationError('レーンを選択してください。')
    return { championId, role: v.role as PoolEntry['role'] }
  }
  savePool(input: unknown): PoolEntry[] {
    const v = object(input),
      key = this.poolKey(v)
    if (
      !Number.isInteger(v.confidence) ||
      (v.confidence as number) < 1 ||
      (v.confidence as number) > 5
    )
      throw new ValidationError('自信度は1〜5で指定してください。')
    return this.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO champion_pool (champion_id, role, confidence) VALUES (?, ?, ?) ON CONFLICT(champion_id, role) DO UPDATE SET confidence=excluded.confidence',
        )
        .run(key.championId, key.role, v.confidence as number)
      return this.listPool()
    })
  }
  removePool(input: unknown): PoolEntry[] {
    const key = this.poolKey(input)
    return this.transaction(() => {
      this.db
        .prepare('DELETE FROM champion_pool WHERE champion_id=? AND role=?')
        .run(key.championId, key.role)
      return this.listPool()
    })
  }
  private championId(input: unknown): number {
    const id = positiveId(input)
    if (!this.db.prepare('SELECT id FROM champions WHERE id=?').get(id))
      throw new ValidationError('チャンピオンが見つかりません。')
    return id
  }
  getChampionPage(input: unknown): ChampionPage {
    const championId = this.championId(input)
    const notes = this.db
      .prepare(
        'SELECT id, category, body, pinned, verified_patch AS verifiedPatch, created_at AS createdAt, updated_at AS updatedAt FROM champion_notes WHERE champion_id=? ORDER BY pinned DESC, created_at DESC, id DESC',
      )
      .all(championId) as unknown as Note[]
    const matchups = this.listMatchups()
      .filter((m) => m.myChampionId === championId)
      .map((m) => this.getMatchup(m))
    return { championId, notes, matchups, counterStrategy: this.getChampionCounter(championId) }
  }
  getChampionCounter(input: unknown): string {
    const championId = this.championId(input)
    return (
      (this.db.prepare('SELECT body FROM champion_counters WHERE champion_id=?').get(championId)
        ?.body as string | undefined) ?? ''
    )
  }
  saveChampionCounter(input: unknown): ChampionPage {
    const v = object(input),
      championId = this.championId(v.championId)
    if (typeof v.body !== 'string' || v.body.length > 10000)
      throw new ValidationError('対策は10,000文字以内で入力してください。')
    const body = v.body.trim()
    return this.transaction(() => {
      if (!body)
        this.db.prepare('DELETE FROM champion_counters WHERE champion_id=?').run(championId)
      else
        this.db
          .prepare(
            'INSERT INTO champion_counters(champion_id,body,updated_at) VALUES (?,?,?) ON CONFLICT(champion_id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at',
          )
          .run(championId, body, new Date().toISOString())
      return this.getChampionPage(championId)
    })
  }
  addChampionNote(input: unknown): ChampionPage {
    const v = object(input),
      championId = this.championId(v.championId),
      note = parseNoteContent(v)
    return this.transaction(() => {
      const now = new Date().toISOString()
      this.db
        .prepare(
          'INSERT INTO champion_notes (champion_id, category, body, created_at, updated_at, verified_patch) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(championId, note.category, note.body, now, now, note.verifiedPatch ?? '')
      return this.getChampionPage(championId)
    })
  }
  updateChampionNote(input: unknown): ChampionPage {
    const v = object(input),
      championId = this.championId(v.championId),
      id = positiveId(v.id),
      note = parseNoteContent(v)
    return this.transaction(() => {
      const changed = this.db
        .prepare(
          'UPDATE champion_notes SET category=?, body=?, updated_at=?, verified_patch=? WHERE id=? AND champion_id=?',
        )
        .run(
          note.category,
          note.body,
          new Date().toISOString(),
          note.verifiedPatch ?? '',
          id,
          championId,
        )
      if (!changed.changes) throw new ValidationError('編集対象のメモが見つかりません。')
      return this.getChampionPage(championId)
    })
  }
  deleteChampionNote(input: unknown): ChampionPage {
    const v = object(input),
      championId = this.championId(v.championId),
      id = positiveId(v.id)
    return this.transaction(() => {
      const note = this.getChampionPage(championId).notes.find((n) => n.id === id)
      if (note) this.trashNote({ scope: 'champion', championId, key: null, note })
      const changed = this.db
        .prepare('DELETE FROM champion_notes WHERE id=? AND champion_id=?')
        .run(id, championId)
      if (!changed.changes) throw new ValidationError('削除対象のメモが見つかりません。')
      return this.getChampionPage(championId)
    })
  }
  private transaction<T>(run: () => T): T {
    const depth = this.transactionDepth
    const savepoint = `notebook_${depth}`
    this.db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`)
    this.transactionDepth++
    try {
      const result = run()
      this.db.exec(depth === 0 ? 'COMMIT' : `RELEASE SAVEPOINT ${savepoint}`)
      return result
    } catch (error) {
      this.db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${savepoint}`)
      if (depth !== 0) this.db.exec(`RELEASE SAVEPOINT ${savepoint}`)
      throw error
    } finally {
      this.transactionDepth--
    }
  }
  private key(input: unknown): MatchupKey {
    const key = parseKey(input)
    const exists = this.db.prepare('SELECT id FROM champions WHERE id = ?')
    if (!exists.get(key.myChampionId) || !exists.get(key.enemyChampionId))
      throw new ValidationError('チャンピオンが見つかりません。')
    return key
  }
  private ensure(key: MatchupKey): number {
    this.db
      .prepare(
        'INSERT INTO matchups (my_champion_id, enemy_champion_id, role, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(my_champion_id, enemy_champion_id, role) DO UPDATE SET updated_at=excluded.updated_at',
      )
      .run(key.myChampionId, key.enemyChampionId, key.role, new Date().toISOString())
    return this.getMatchup(key).id!
  }
  getMatchup(input: unknown): Matchup {
    const key = this.key(input)
    const row = this.db
      .prepare(
        'SELECT id, difficulty, rating FROM matchups WHERE my_champion_id=? AND enemy_champion_id=? AND role=?',
      )
      .get(key.myChampionId, key.enemyChampionId, key.role)
    if (!row) return { ...key, id: null, difficulty: 'Unset', rating: null, notes: [] }
    const notes = this.db
      .prepare(
        'SELECT id, category, body, pinned, verified_patch AS verifiedPatch, created_at AS createdAt, updated_at AS updatedAt FROM matchup_notes WHERE matchup_id=? ORDER BY pinned DESC, created_at DESC, id DESC',
      )
      .all(row.id) as unknown as Note[]
    return {
      ...key,
      id: row.id as number,
      difficulty: row.difficulty as Overview['difficulty'],
      rating: row.rating as number | null,
      notes,
    }
  }
  listMatchups(): MatchupSummary[] {
    return this.db
      .prepare(
        `SELECT m.id, m.my_champion_id AS myChampionId, m.enemy_champion_id AS enemyChampionId,
      m.role, m.difficulty, m.rating, m.updated_at AS updatedAt, count(n.id) AS noteCount
      FROM matchups m LEFT JOIN matchup_notes n ON n.matchup_id=m.id
      GROUP BY m.id ORDER BY m.updated_at DESC, m.id DESC`,
      )
      .all() as unknown as MatchupSummary[]
  }
  saveOverview(input: unknown): Matchup {
    const v = object(input),
      key = this.key(v.key),
      overview = parseOverview(v.overview)
    return this.transaction(() => {
      const id = this.ensure(key)
      this.db
        .prepare('UPDATE matchups SET difficulty=?, rating=? WHERE id=?')
        .run(overview.difficulty, overview.rating, id)
      return this.getMatchup(key)
    })
  }
  addNote(input: unknown): Matchup {
    const v = parseNote(input),
      key = this.key(v.key)
    return this.transaction(() => {
      const id = this.ensure(key),
        now = new Date().toISOString()
      this.db
        .prepare(
          'INSERT INTO matchup_notes (matchup_id, category, body, created_at, updated_at, verified_patch) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, v.category, v.body, now, now, v.verifiedPatch ?? '')
      return this.getMatchup(key)
    })
  }
  updateNote(input: unknown): Matchup {
    const v = parseNote(input),
      key = this.key(v.key),
      id = positiveId(object(input).id)
    return this.transaction(() => {
      const matchup = this.getMatchup(key)
      const changed = this.db
        .prepare(
          'UPDATE matchup_notes SET category=?, body=?, updated_at=?, verified_patch=? WHERE id=? AND matchup_id=?',
        )
        .run(v.category, v.body, new Date().toISOString(), v.verifiedPatch ?? '', id, matchup.id)
      if (!changed.changes)
        throw new ValidationError('編集対象のメモが見つかりません。再読み込みしてください。')
      this.ensure(key)
      return this.getMatchup(key)
    })
  }
  deleteNote(input: unknown): Matchup {
    const v = object(input),
      key = this.key(v.key),
      id = positiveId(v.id)
    return this.transaction(() => {
      const matchup = this.getMatchup(key)
      const note = matchup.notes.find((n) => n.id === id)
      if (note) this.trashNote({ scope: 'matchup', championId: key.myChampionId, key, note })
      const changed = this.db
        .prepare('DELETE FROM matchup_notes WHERE id=? AND matchup_id=?')
        .run(id, matchup.id)
      if (!changed.changes)
        throw new ValidationError('削除対象のメモが見つかりません。再読み込みしてください。')
      this.ensure(key)
      return this.getMatchup(key)
    })
  }
}
