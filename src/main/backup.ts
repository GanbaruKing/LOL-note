import { CATEGORIES, DIFFICULTIES, ROLES } from '../shared/contracts'
import { object, ValidationError } from '../shared/validation'

// Only these tables and columns can enter a backup or a restore statement.
export const backupTables = {
  matchups: [
    'id',
    'my_champion_id',
    'enemy_champion_id',
    'role',
    'difficulty',
    'rating',
    'updated_at',
  ],
  matchup_notes: ['id', 'matchup_id', 'category', 'body', 'created_at', 'updated_at', 'pinned'],
  champion_notes: ['id', 'champion_id', 'category', 'body', 'created_at', 'updated_at', 'pinned'],
  champion_pool: ['champion_id', 'role', 'confidence'],
  my_picks: ['my_champion_id', 'enemy_champion_id', 'role', 'priority', 'confidence'],
  champion_counters: ['champion_id', 'body', 'updated_at'],
} as const
export type BackupRow = Record<string, string | number | null>
export interface NotebookBackup {
  format: 'lol-note'
  version: 1
  createdAt: string
  tables: Record<keyof typeof backupTables, BackupRow[]>
}
export function parseBackup(input: unknown): NotebookBackup {
  const fail = (): never => {
    throw new ValidationError('LOL Noteのバックアップ形式が正しくありません。')
  }
  const root = object(input)
  if (root.format !== 'lol-note' || root.version !== 1 || typeof root.createdAt !== 'string') fail()
  const tables = object(root.tables)
  const result = {} as NotebookBackup['tables']
  let count = 0
  for (const [table, columns] of Object.entries(backupTables)) {
    const rows = tables[table]
    if (!Array.isArray(rows) || (count += rows.length) > 100000) fail()
    result[table as keyof typeof backupTables] = (rows as unknown[]).map((inputRow) => {
      const row = object(inputRow)
      const clean: BackupRow = {}
      for (const column of columns) {
        const value = row[column]
        let valid: boolean
        if (column === 'role') valid = ROLES.includes(value as never)
        else if (column === 'category') valid = CATEGORIES.includes(value as never)
        else if (column === 'difficulty') valid = DIFFICULTIES.includes(value as never)
        else if (column === 'body')
          valid = typeof value === 'string' && value.trim().length > 0 && value.length <= 10000
        else if (column.endsWith('_at'))
          valid =
            typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))
        else if (column === 'rating' && value === null) valid = true
        else
          valid =
            typeof value === 'number' &&
            Number.isSafeInteger(value) &&
            value >= (column === 'pinned' ? 0 : 1) &&
            value <=
              (column === 'pinned'
                ? 1
                : column === 'rating' || column === 'confidence'
                  ? 5
                  : column === 'priority'
                    ? 99
                    : Number.MAX_SAFE_INTEGER)
        if (!valid) fail()
        clean[column] = value as string | number | null
      }
      return clean
    })
  }
  return { format: 'lol-note', version: 1, createdAt: root.createdAt as string, tables: result }
}
