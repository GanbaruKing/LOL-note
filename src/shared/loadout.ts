import catalog from '../../resources/loadout.json'
import { object, parseKey, ValidationError } from './validation'
import type { MatchupKey } from './contracts'
export interface Loadout {
  items: number[]
  primary: number | null
  secondary: number | null
  primaryRunes: number[]
  secondaryRunes: number[]
  shards: number[]
  buildNotes: string
  runeNotes: string
}
export const shardRows = [
  [5008, 5005, 5007],
  [5008, 5010, 5001],
  [5011, 5013, 5001],
]
export const shardNames: Record<number, string> = {
  5008: 'アダプティブフォース',
  5005: '攻撃速度',
  5007: 'スキルヘイスト',
  5010: '移動速度',
  5001: 'スケーリング体力',
  5011: '体力',
  5013: '行動妨害耐性・スロウ耐性',
}
export const emptyLoadout = (): Loadout => ({
  items: [],
  primary: null,
  secondary: null,
  primaryRunes: [],
  secondaryRunes: [],
  shards: [],
  buildNotes: '',
  runeNotes: '',
})
export function parseLoadout(input: unknown): Loadout {
  const v = object(input)
  const fail = (): never => {
    throw new ValidationError('ビルド・ルーンの入力が正しくありません。')
  }
  const ids = (x: unknown, max: number): number[] => {
    if (!Array.isArray(x) || x.length > max || x.some((n) => !Number.isSafeInteger(n)))
      return fail()
    return [...x] as number[]
  }
  const items = ids(v.items, 24),
    primaryRunes = ids(v.primaryRunes, 4),
    secondaryRunes = ids(v.secondaryRunes, 2),
    shards = ids(v.shards, 3)
  if (items.some((id) => !catalog.items.some((x) => x.id === id))) fail()
  for (const field of ['primary', 'secondary'])
    if (v[field] !== null && !catalog.trees.some((t) => t.id === v[field])) fail()
  if (v.primary !== null && v.primary === v.secondary) fail()
  const primary = catalog.trees.find((t) => t.id === v.primary),
    secondary = catalog.trees.find((t) => t.id === v.secondary)
  if (primaryRunes.some((id, i) => id !== 0 && !primary?.slots[i].runes.some((r) => r.id === id)))
    fail()
  const slots = secondaryRunes.map(
    (id) => secondary?.slots.findIndex((s, i) => i > 0 && s.runes.some((r) => r.id === id)) ?? -1,
  )
  if (slots.some((i) => i < 1) || new Set(slots).size !== slots.length) fail()
  if (shards.some((id, i) => id !== 0 && !shardRows[i].includes(id))) fail()
  for (const field of ['buildNotes', 'runeNotes'])
    if (typeof v[field] !== 'string' || (v[field] as string).length > 10000) fail()
  return {
    items,
    primary: v.primary as number | null,
    secondary: v.secondary as number | null,
    primaryRunes,
    secondaryRunes,
    shards,
    buildNotes: v.buildNotes as string,
    runeNotes: v.runeNotes as string,
  }
}
export function parseLoadouts(input: unknown): { key: MatchupKey; loadout: Loadout }[] {
  if (!Array.isArray(input) || input.length > 100000)
    throw new ValidationError('ビルド一覧が正しくありません。')
  const seen = new Set<string>()
  return input.map((row) => {
    const v = object(row),
      key = parseKey(v.key),
      id = JSON.stringify(key)
    if (seen.has(id)) throw new ValidationError('ビルドが重複しています。')
    seen.add(id)
    return { key, loadout: parseLoadout(v.loadout) }
  })
}
