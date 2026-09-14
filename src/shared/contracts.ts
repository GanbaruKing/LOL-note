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
  pinned: number
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
export interface ChampionNoteInput {
  championId: number
  category: Category
  body: string
}
export interface ChampionPage {
  championId: number
  notes: Note[]
  matchups: Matchup[]
}
export interface PoolEntry {
  championId: number
  role: Role
  confidence: number
}
export interface MyPick extends MatchupKey {
  rating: number | null
}
export interface SearchInput {
  query: string
  role: Role | 'ALL'
  category: Category | 'ALL'
  pinnedOnly: boolean
}
export interface SearchHit extends Note {
  scope: 'champion' | 'matchup'
  championId: number
  key: MatchupKey | null
}
export interface LcuState {
  status: 'disconnected' | 'connected' | 'champ-select' | 'error'
  phase: string | null
  sessionId: string | null
  role: Role | null
  ownChampionId: number | null
  enemyChampionIds: number[]
  message: string
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }
export interface StatisticsQuery {
  region?: string
  rank?: string
  patch?: string
  minGames?: number
  enemyChampionId: number
  role: Role
  demo: boolean
}
export interface StatisticsData {
  schemaVersion: 1
  isDemo: boolean
  source: string
  patch: string
  region: string
  rank: string
  queue: string
  generatedAt: string
  rows: (MatchupKey & { games: number; wins: number })[]
}
export interface NotebookApi {
  getStatistics(input: StatisticsQuery): Promise<Result<StatisticsData | null>>
  importStatistics(): Promise<Result<boolean>>

  listMyPicks(input: { enemyChampionId: number; role: Role }): Promise<Result<MyPick[]>>
  saveMyPick(input: MatchupKey): Promise<Result<MyPick[]>>
  removeMyPick(input: MatchupKey): Promise<Result<MyPick[]>>
  pinNote(input: {
    scope: 'champion' | 'matchup'
    id: number
    pinned: boolean
  }): Promise<Result<void>>
  searchNotes(input: SearchInput): Promise<Result<SearchHit[]>>
  getLcuState(): Promise<Result<LcuState>>
  selectLeagueFolder(): Promise<Result<boolean>>
  listPool(): Promise<Result<PoolEntry[]>>
  savePool(input: PoolEntry): Promise<Result<PoolEntry[]>>
  removePool(input: { championId: number; role: Role }): Promise<Result<PoolEntry[]>>
  getChampionPage(championId: number): Promise<Result<ChampionPage>>
  addChampionNote(input: ChampionNoteInput): Promise<Result<ChampionPage>>
  updateChampionNote(input: ChampionNoteInput & { id: number }): Promise<Result<ChampionPage>>
  deleteChampionNote(input: { championId: number; id: number }): Promise<Result<ChampionPage>>
  listChampions(): Promise<Result<Champion[]>>
  listMatchups(): Promise<Result<MatchupSummary[]>>
  getMatchup(key: MatchupKey): Promise<Result<Matchup>>
  saveOverview(input: { key: MatchupKey; overview: Overview }): Promise<Result<Matchup>>
  addNote(input: NoteInput): Promise<Result<Matchup>>
  updateNote(input: NoteInput & { id: number }): Promise<Result<Matchup>>
  deleteNote(input: { key: MatchupKey; id: number }): Promise<Result<Matchup>>
  getInfo(): Promise<Result<{ databasePath: string; catalogVersion: string }>>
}
