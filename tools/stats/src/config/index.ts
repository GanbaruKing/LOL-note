import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const routing: Record<string, string> = {
  KR: 'asia',
  JP1: 'asia',
  NA1: 'americas',
  BR1: 'americas',
  LA1: 'americas',
  LA2: 'americas',
  EUW1: 'europe',
  EUN1: 'europe',
  TR1: 'europe',
  RU: 'europe',
  ME1: 'europe',
  OC1: 'sea',
  SG2: 'sea',
  TW2: 'sea',
  VN2: 'sea',
}
export const allTiers = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
  'MASTER',
  'GRANDMASTER',
  'CHALLENGER',
]
export const roles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const
export type Role = (typeof roles)[number]
export interface Config {
  platforms: string[]
  tiers: string[]
  queue: 420
  patch: string
  lookbackHours: number
  seedsPerRegionPerDay: number
  matchesPerSeedPerDay: number
  matchesPerPlayerPerDay: number
  matchesPerRegionPerDay: number
  rankTtlHours: number
  rankDistanceHours: number
  minimumDurationSeconds: number
  excludeEarlySurrender: boolean
  excludeRoleConflict: boolean
  minimumGames: number
  minimumBaselineGames: number
  confidenceThresholds: number[]
  requestIntervalMs: number
  maxAttempts: number
  requestBudget: number
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid response/config object')
  return value as Record<string, unknown>
}
export function validateConfig(value: unknown): Config {
  const v = object(value)
  const keys = [
    'platforms',
    'tiers',
    'queue',
    'patch',
    'lookbackHours',
    'seedsPerRegionPerDay',
    'matchesPerSeedPerDay',
    'matchesPerPlayerPerDay',
    'matchesPerRegionPerDay',
    'rankTtlHours',
    'rankDistanceHours',
    'minimumDurationSeconds',
    'excludeEarlySurrender',
    'excludeRoleConflict',
    'minimumGames',
    'minimumBaselineGames',
    'confidenceThresholds',
    'requestIntervalMs',
    'maxAttempts',
    'requestBudget',
  ]
  if (Object.keys(v).some((k) => !keys.includes(k)))
    throw new Error('Unknown config field; credentials must only be stored in the environment')
  for (const [key, allowed] of [
    ['platforms', Object.keys(routing)],
    ['tiers', allTiers],
  ] as const) {
    const a = v[key]
    if (
      !Array.isArray(a) ||
      !a.length ||
      a.some((x) => typeof x !== 'string' || !allowed.includes(x)) ||
      new Set(a).size !== a.length
    )
      throw new Error(`Invalid ${key}`)
  }
  if (v.queue !== 420 || typeof v.patch !== 'string' || !/^(auto|\d+\.\d+)$/.test(v.patch))
    throw new Error('Only queue 420 and major.minor patch supported')
  for (const key of [
    'lookbackHours',
    'seedsPerRegionPerDay',
    'matchesPerSeedPerDay',
    'matchesPerPlayerPerDay',
    'matchesPerRegionPerDay',
    'rankTtlHours',
    'rankDistanceHours',
    'minimumDurationSeconds',
    'minimumGames',
    'minimumBaselineGames',
    'requestIntervalMs',
    'maxAttempts',
    'requestBudget',
  ]) {
    if (!Number.isSafeInteger(v[key]) || Number(v[key]) < 1) throw new Error(`Invalid ${key}`)
  }
  for (const key of ['excludeEarlySurrender', 'excludeRoleConflict'])
    if (typeof v[key] !== 'boolean') throw new Error(`Invalid ${key}`)
  const limits = v.confidenceThresholds
  if (
    !Array.isArray(limits) ||
    limits.length !== 3 ||
    limits.some((x, i) => !Number.isSafeInteger(x) || x <= (i ? limits[i - 1] : 0))
  )
    throw new Error('Invalid confidence thresholds')
  return v as unknown as Config
}
export const loadConfig = (path: string): Config =>
  validateConfig(JSON.parse(readFileSync(path, 'utf8')))
export function reprocessingConfig(original: Config, requested: Config): Config {
  const next = {
    ...requested,
    patch: requested.patch === 'auto' ? original.patch : requested.patch,
  }
  const allowed = [
    'minimumGames',
    'minimumBaselineGames',
    'confidenceThresholds',
    'matchesPerPlayerPerDay',
    'matchesPerRegionPerDay',
    'minimumDurationSeconds',
    'excludeRoleConflict',
    'excludeEarlySurrender',
    'rankDistanceHours',
  ]
  for (const key of Object.keys(original) as (keyof Config)[])
    if (!allowed.includes(key) && JSON.stringify(original[key]) !== JSON.stringify(next[key]))
      throw new Error(`Changing ${key} requires a new collection run`)
  return next
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export function days(start: number, end: number): { day: string; start: number; end: number }[] {
  const result = []
  for (let t = Math.floor(start / 86400000) * 86400000; t < end; t += 86400000)
    result.push({
      day: new Date(t).toISOString().slice(0, 10),
      start: Math.max(start, t),
      end: Math.min(end, t + 86400000),
    })
  return result
}
