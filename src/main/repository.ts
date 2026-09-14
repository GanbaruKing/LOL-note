import { DatabaseSync } from 'node:sqlite'
import type {
  Champion,
  ChampionPage,
  Matchup,
  MatchupKey,
  MatchupSummary,
  Note,
  Overview,
  PoolEntry,
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
  private db: DatabaseSync
  constructor(path: string, champions: Champion[]) {
    this.db = new DatabaseSync(path)
    try {
      this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
      const version = this.db.prepare('PRAGMA user_version').get()!.user_version as number
      if (version > 3) throw new Error('Unsupported database version')
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
        'SELECT id, category, body, created_at AS createdAt, updated_at AS updatedAt FROM champion_notes WHERE champion_id=? ORDER BY created_at DESC, id DESC',
      )
      .all(championId) as unknown as Note[]
    const matchups = this.listMatchups()
      .filter((m) => m.myChampionId === championId)
      .map((m) => this.getMatchup(m))
    return { championId, notes, matchups }
  }
  addChampionNote(input: unknown): ChampionPage {
    const v = object(input),
      championId = this.championId(v.championId),
      note = parseNoteContent(v)
    return this.transaction(() => {
      const now = new Date().toISOString()
      this.db
        .prepare(
          'INSERT INTO champion_notes (champion_id, category, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(championId, note.category, note.body, now, now)
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
          'UPDATE champion_notes SET category=?, body=?, updated_at=? WHERE id=? AND champion_id=?',
        )
        .run(note.category, note.body, new Date().toISOString(), id, championId)
      if (!changed.changes) throw new ValidationError('編集対象のメモが見つかりません。')
      return this.getChampionPage(championId)
    })
  }
  deleteChampionNote(input: unknown): ChampionPage {
    const v = object(input),
      championId = this.championId(v.championId),
      id = positiveId(v.id)
    return this.transaction(() => {
      const changed = this.db
        .prepare('DELETE FROM champion_notes WHERE id=? AND champion_id=?')
        .run(id, championId)
      if (!changed.changes) throw new ValidationError('削除対象のメモが見つかりません。')
      return this.getChampionPage(championId)
    })
  }
  private transaction<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = run()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
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
        'SELECT id, category, body, created_at AS createdAt, updated_at AS updatedAt FROM matchup_notes WHERE matchup_id=? ORDER BY created_at DESC, id DESC',
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
          'INSERT INTO matchup_notes (matchup_id, category, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(id, v.category, v.body, now, now)
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
          'UPDATE matchup_notes SET category=?, body=?, updated_at=? WHERE id=? AND matchup_id=?',
        )
        .run(v.category, v.body, new Date().toISOString(), id, matchup.id)
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
