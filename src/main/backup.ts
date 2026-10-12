import { parseLoadout, parseLoadouts } from '../shared/loadout'
import { CATEGORIES, DIFFICULTIES, ROLES } from '../shared/contracts'
import {
  object,
  parseKey,
  parseNoteContent,
  parsePatch,
  positiveId,
  ValidationError,
} from '../shared/validation'
import { emptyKnowledgeBook, parseKnowledgeBook } from '../shared/knowledge'
import type { KnowledgeBook, LoadoutTemplate, TrashNote } from '../shared/contracts'

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
  matchup_notes: [
    'id',
    'matchup_id',
    'category',
    'body',
    'created_at',
    'updated_at',
    'pinned',
    'verified_patch',
  ],
  champion_notes: [
    'id',
    'champion_id',
    'category',
    'body',
    'created_at',
    'updated_at',
    'pinned',
    'verified_patch',
  ],
  champion_pool: ['champion_id', 'role', 'confidence'],
  my_picks: ['my_champion_id', 'enemy_champion_id', 'role', 'priority', 'confidence'],
  champion_counters: ['champion_id', 'body', 'updated_at'],
} as const
export type BackupRow = Record<string, string | number | null>
export interface NotebookBackup {
  format: 'lol-note'
  version: 4
  templates: LoadoutTemplate[]
  trash: TrashNote[]
  deletedArticles: KnowledgeBook
  loadouts: ReturnType<typeof parseLoadouts>
  knowledgeBook: KnowledgeBook
  createdAt: string
  tables: Record<keyof typeof backupTables, BackupRow[]>
}
export function parseBackup(input: unknown): NotebookBackup {
  const fail = (): never => {
    throw new ValidationError('RiftNoteのバックアップ形式が正しくありません。')
  }
  const root = object(input)
  if (
    root.format !== 'lol-note' ||
    ![1, 2, 3, 4].includes(root.version as number) ||
    typeof root.createdAt !== 'string'
  )
    fail()
  const knowledgeBook =
    root.version === 1 ? emptyKnowledgeBook() : parseKnowledgeBook(root.knowledgeBook)
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
        const value = column === 'verified_patch' && root.version !== 4 ? '' : row[column]
        let valid: boolean
        if (column === 'verified_patch')
          valid = typeof value === 'string' && parsePatch(value) === value
        else if (column === 'role') valid = ROLES.includes(value as never)
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
  return {
    format: 'lol-note',
    version: 4,
    templates: parseTemplates(root.version === 4 ? root.templates : []),
    trash: parseTrash(root.version === 4 ? root.trash : []),
    deletedArticles:
      root.version === 4 ? parseKnowledgeBook(root.deletedArticles) : emptyKnowledgeBook(),
    loadouts: root.version === 3 || root.version === 4 ? parseLoadouts(root.loadouts) : [],
    knowledgeBook,
    createdAt: root.createdAt as string,
    tables: result,
  }
}

function parseTemplates(input: unknown): LoadoutTemplate[] {
  if (!Array.isArray(input) || input.length > 10000)
    throw new ValidationError('雛形一覧が正しくありません。')
  const seen = new Set<string>()
  return input.map((row) => {
    const v = object(row),
      championId = positiveId(v.championId)
    if (!ROLES.includes(v.role as never) || seen.has(`${championId}:${v.role}`))
      throw new ValidationError('雛形のレーン・重複を確認してください。')
    seen.add(`${championId}:${v.role}`)
    return { championId, role: v.role as LoadoutTemplate['role'], loadout: parseLoadout(v.loadout) }
  })
}
function parseTrash(input: unknown): TrashNote[] {
  if (!Array.isArray(input) || input.length > 100000)
    throw new ValidationError('削除済みメモが正しくありません。')
  const seen = new Set<string>()
  const date = (v: unknown): string => {
    if (typeof v !== 'string' || v.length > 40 || !Number.isFinite(Date.parse(v)))
      throw new ValidationError('日付が正しくありません。')
    return v
  }
  return input.map((row) => {
    const v = object(row),
      n = object(v.note)
    if (
      typeof v.id !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(v.id) ||
      seen.has(v.id) ||
      !['champion', 'matchup'].includes(v.scope as string) ||
      ![0, 1].includes(n.pinned as number)
    )
      throw new ValidationError('削除済みメモの形式が正しくありません。')
    seen.add(v.id)
    const championId = positiveId(v.championId)
    const key = v.scope === 'matchup' ? parseKey(v.key) : null
    if (key && key.myChampionId !== championId)
      throw new ValidationError('削除済みメモの対象が一致しません。')
    return {
      id: v.id,
      deletedAt: date(v.deletedAt),
      scope: v.scope as TrashNote['scope'],
      championId,
      key,
      note: {
        id: positiveId(n.id),
        ...parseNoteContent(n),
        pinned: n.pinned as number,
        createdAt: date(n.createdAt),
        updatedAt: date(n.updatedAt),
      },
    }
  })
}
