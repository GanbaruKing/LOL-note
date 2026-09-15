import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { randomUUID } from 'node:crypto'
import { hash, type Config } from '../config/index.js'

export interface Run {
  id: string
  config: Config
  start: number
  end: number
  seed: string
  complete: boolean
  champions: number[]
}
export interface Cached {
  value: unknown
  fetchedAt: number
}
export class Store {
  readonly db: DatabaseSync
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    if (Number(this.db.prepare('PRAGMA user_version').get()!.user_version) > 1) {
      this.db.close()
      throw new Error('Raw database version is newer than this collector')
    }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS responses(key TEXT PRIMARY KEY, body BLOB NOT NULL, fetched_at INTEGER NOT NULL, checksum TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(key TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, status_code INTEGER);
      CREATE TABLE IF NOT EXISTS cooldowns(scope TEXT PRIMARY KEY, until_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS run_matches(run_id TEXT NOT NULL, match_id TEXT NOT NULL, platform TEXT NOT NULL, PRIMARY KEY(run_id, match_id));
      CREATE TABLE IF NOT EXISTS match_sources(run_id TEXT, match_id TEXT, seed TEXT, day TEXT, PRIMARY KEY(run_id, match_id, seed, day));
      CREATE TABLE IF NOT EXISTS ranks(run_id TEXT, platform TEXT, puuid TEXT, body TEXT NOT NULL, PRIMARY KEY(run_id, platform, puuid));
      CREATE TABLE IF NOT EXISTS rank_cache(platform TEXT, puuid TEXT, body TEXT NOT NULL, PRIMARY KEY(platform, puuid));
      CREATE TABLE IF NOT EXISTS checkpoints(run_id TEXT, key TEXT, body TEXT NOT NULL, PRIMARY KEY(run_id, key));
      CREATE TABLE IF NOT EXISTS metrics(run_id TEXT, key TEXT, value INTEGER NOT NULL, PRIMARY KEY(run_id,key));
      CREATE TABLE IF NOT EXISTS process_lock(id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT, pid INTEGER);
      PRAGMA user_version=1;
    `)
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const value = fn()
      this.db.exec('COMMIT')
      return value
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }
  lock(): () => void {
    const owner = randomUUID()
    this.transaction(() => {
      const old = this.db.prepare('SELECT pid FROM process_lock WHERE id=1').get() as
        { pid: number } | undefined
      if (old) {
        let alive = true
        try {
          process.kill(old.pid, 0)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false
        }
        if (alive)
          throw new Error(
            'Another stats process is active (or its PID was reused). Do not run concurrently.',
          )
      }
      this.db.prepare('INSERT OR REPLACE INTO process_lock VALUES(1,?,?)').run(owner, process.pid)
      // Exclusive owner has recovered; requests interrupted before commit may be repeated.
      this.db.exec("UPDATE jobs SET status='pending' WHERE status='leased'")
    })
    return () => {
      this.db.prepare('DELETE FROM process_lock WHERE owner=?').run(owner)
    }
  }
  saveRun(run: Run) {
    this.db.prepare('INSERT OR REPLACE INTO runs VALUES(?,?)').run(run.id, JSON.stringify(run))
  }
  run(id?: string): Run {
    const row = (
      id
        ? this.db.prepare('SELECT body FROM runs WHERE id=?').get(id)
        : this.db.prepare('SELECT body FROM runs ORDER BY rowid DESC LIMIT 1').get()
    ) as { body: string } | undefined
    if (!row) throw new Error('No run found; start collect first')
    return JSON.parse(row.body)
  }
  cached(key: string): Cached | undefined {
    const row = this.db.prepare('SELECT body,fetched_at FROM responses WHERE key=?').get(key) as
      { body: Uint8Array; fetched_at: number } | undefined
    return (
      row && { value: JSON.parse(gunzipSync(row.body).toString('utf8')), fetchedAt: row.fetched_at }
    )
  }
  saveResponse(key: string, value: unknown, fetchedAt: number) {
    const json = JSON.stringify(value)
    this.transaction(() => {
      this.db
        .prepare('INSERT OR REPLACE INTO responses VALUES(?,?,?,?)')
        .run(key, gzipSync(json), fetchedAt, hash(json))
      this.db
        .prepare(
          "INSERT INTO jobs(key,status) VALUES(?,'done') ON CONFLICT(key) DO UPDATE SET status='done',next_at=0",
        )
        .run(key)
    })
  }
  checkpoint<T>(run: string, key: string): T | undefined {
    const row = this.db
      .prepare('SELECT body FROM checkpoints WHERE run_id=? AND key=?')
      .get(run, key) as { body: string } | undefined
    return row ? (JSON.parse(row.body) as T) : undefined
  }
  saveCheckpoint(run: string, key: string, value: unknown) {
    this.db
      .prepare('INSERT OR REPLACE INTO checkpoints VALUES(?,?,?)')
      .run(run, key, JSON.stringify(value))
  }
  count(run: string, key: string, amount = 1) {
    this.db
      .prepare(
        'INSERT INTO metrics VALUES(?,?,?) ON CONFLICT(run_id,key) DO UPDATE SET value=value+excluded.value',
      )
      .run(run, key, amount)
  }
  metrics(run: string) {
    return Object.fromEntries(
      (
        this.db.prepare('SELECT key,value FROM metrics WHERE run_id=?').all(run) as {
          key: string
          value: number
        }[]
      ).map((x) => [x.key, x.value]),
    )
  }
  close() {
    this.db.close()
  }
}
