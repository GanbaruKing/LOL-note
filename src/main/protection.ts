import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { parseBackup } from './backup'
import type { NotebookRepository } from './repository'

// Only files owned by this service are rotated. Manual / before-restore backups stay intact.
export class BackupProtection {
  private digest = ''
  private lastBackup: string | null = null
  private error = ''
  constructor(
    private directory: string,
    private repo: NotebookRepository,
  ) {}
  snapshot() {
    try {
      mkdirSync(this.directory, { recursive: true })
      const backup = parseBackup(this.repo.exportBackup())
      const content = JSON.stringify({ ...backup, createdAt: '' })
      const digest = createHash('sha256').update(content).digest('hex')
      const files = readdirSync(this.directory)
        .filter((n) => /^auto-\d{13}-[a-f0-9-]{36}\.json$/.test(n))
        .sort()
        .reverse()
      if (!this.digest && files[0]) {
        try {
          const previous = parseBackup(
            JSON.parse(readFileSync(join(this.directory, files[0]), 'utf8')),
          )
          this.digest = createHash('sha256')
            .update(JSON.stringify({ ...previous, createdAt: '' }))
            .digest('hex')
          this.lastBackup = join(this.directory, files[0])
        } catch {
          /* A damaged previous snapshot must not block a fresh backup. */
        }
      }
      if (digest !== this.digest) {
        const path = join(this.directory, `auto-${Date.now()}-${randomUUID()}.json`)
        const temp = `${path}.tmp`
        const json = JSON.stringify(backup, null, 2)
        if (Buffer.byteLength(json) > 50 * 1024 * 1024) throw new Error('Backup too large')
        try {
          writeFileSync(temp, json, { flag: 'wx' })
          renameSync(temp, path)
        } finally {
          try {
            unlinkSync(temp)
          } catch {
            /* Already renamed or never created. */
          }
        }
        this.digest = digest
        this.lastBackup = path
        for (const name of files.slice(19)) unlinkSync(join(this.directory, name))
      }
      this.error = ''
    } catch {
      this.error =
        '自動バックアップを保存できませんでした。保存先の空き容量・アクセス権を確認してください。'
    }
    return this.status()
  }
  status() {
    return { directory: this.directory, lastBackup: this.lastBackup, error: this.error }
  }
}
