export const ROLES = ['TOP', 'JUNGLE', 'MID', 'BOTTOM', 'SUPPORT'] as const
export type Role = (typeof ROLES)[number]
export const CATEGORIES = [
  'General',
  'Laning',
  'Trading',
  'All-in',
  'Item',
  'Rune',
  'Wave',
  'Jungle',
  'Late Game',
  'Other',
] as const
export type Category = (typeof CATEGORIES)[number]
export const DIFFICULTIES = ['Unset', 'Easy', 'Even', 'Hard'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]
export interface Champion {
  id: number
  slug: string
  name: string
  nameJa: string
  title: string
}
export interface MatchupKey {
  myChampionId: number
  enemyChampionId: number
  role: Role
}
export interface Overview {
  difficulty: Difficulty
  rating: number | null
}
export interface Note {
  id: number
  category: Category
  body: string
  createdAt: string
  updatedAt: string
}
export interface Matchup extends MatchupKey, Overview {
  id: number | null
  notes: Note[]
}
export interface MatchupSummary extends MatchupKey, Overview {
  id: number
  noteCount: number
  updatedAt: string
}
export interface NoteInput {
  key: MatchupKey
  category: Category
  body: string
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
export interface NotebookApi {
  listChampions(): Promise<Result<Champion[]>>
  listMatchups(): Promise<Result<MatchupSummary[]>>
  getMatchup(key: MatchupKey): Promise<Result<Matchup>>
  saveOverview(input: { key: MatchupKey; overview: Overview }): Promise<Result<Matchup>>
  addNote(input: NoteInput): Promise<Result<Matchup>>
  updateNote(input: NoteInput & { id: number }): Promise<Result<Matchup>>
  deleteNote(input: { key: MatchupKey; id: number }): Promise<Result<Matchup>>
  getInfo(): Promise<Result<{ databasePath: string; catalogVersion: string }>>
}
