import {
  CATEGORIES,
  DIFFICULTIES,
  ROLES,
  type MatchupKey,
  type NoteInput,
  type Overview,
} from './contracts'

export class ValidationError extends Error {}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ValidationError('入力形式が正しくありません。')
  return value as Record<string, unknown>
}
export function positiveId(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new ValidationError('IDが正しくありません。')
  return value as number
}
export function parseKey(value: unknown): MatchupKey {
  const v = object(value)
  if (!ROLES.includes(v.role as never)) throw new ValidationError('Roleを選択してください。')
  return {
    myChampionId: positiveId(v.myChampionId),
    enemyChampionId: positiveId(v.enemyChampionId),
    role: v.role as MatchupKey['role'],
  }
}
export function parseNote(value: unknown): NoteInput {
  const v = object(value)
  return { key: parseKey(v.key), ...parseNoteContent(v) }
}
export function parseNoteContent(value: unknown): Pick<NoteInput, 'category' | 'body'> {
  const v = object(value)
  if (!CATEGORIES.includes(v.category as never))
    throw new ValidationError('カテゴリーが正しくありません。')
  if (typeof v.body !== 'string' || !v.body.trim() || v.body.length > 10000)
    throw new ValidationError('メモは1〜10,000文字で入力してください。')
  return {
    category: v.category as NoteInput['category'],
    body: v.body.trim(),
  }
}
export function parseOverview(value: unknown): Overview {
  const v = object(value)
  if (!DIFFICULTIES.includes(v.difficulty as never))
    throw new ValidationError('難易度が正しくありません。')
  if (
    v.rating !== null &&
    (!Number.isInteger(v.rating) || (v.rating as number) < 1 || (v.rating as number) > 5)
  )
    throw new ValidationError('評価は1〜5で指定してください。')
  return { difficulty: v.difficulty as Overview['difficulty'], rating: v.rating as number | null }
}
