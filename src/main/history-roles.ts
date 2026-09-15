import type { Role } from '../shared/contracts'

type Row = Record<string, unknown>
export const record = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}
export function historyRole(own: Row): Role | null {
  const timeline = record(own.timeline)
  if (timeline.lane === 'TOP') return 'TOP'
  if (timeline.lane === 'JUNGLE') return 'JUNGLE'
  if (timeline.lane === 'MIDDLE' || timeline.lane === 'MID') return 'MID'
  if (timeline.lane === 'BOTTOM' || timeline.lane === 'BOT') {
    if (timeline.role === 'DUO_CARRY' || timeline.role === 'CARRY') return 'BOTTOM'
    if (timeline.role === 'DUO_SUPPORT' || timeline.role === 'SUPPORT') return 'SUPPORT'
  }
  return null
}
export interface RoleAssignment {
  role: Role | null
  source: 'history' | 'timeline' | 'unknown'
}
// Broad lane corridors exclude bases and most jungle paths. Only repeated early-game
// presence counts; a single roam/gank must not determine a player's role.
function laneAt(value: unknown): 'TOP' | 'MID' | 'BOTTOM' | null {
  const { x, y } = record(value)
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x > 15000 ||
    y > 15000
  )
    return null
  if ((x < 4000 && y > 6000) || (y > 11000 && x < 10000)) return 'TOP'
  if ((y < 4000 && x > 6000) || (x > 11000 && y < 10000)) return 'BOTTOM'
  if (Math.abs(x - y) < 1800 && x + y > 8000 && x + y < 22000) return 'MID'
  return null
}
export function resolveHistoryRoles(
  participants: Row[],
  timeline: unknown,
): Map<number, RoleAssignment> {
  const result = new Map<number, RoleAssignment>()
  const rawFrames = record(timeline).frames
  // One sample per minute avoids treating duplicated/dense frames as independent evidence.
  const frames = new Map<number, Row>()
  if (Array.isArray(rawFrames))
    for (const frame of rawFrames.map(record)) {
      const time = frame.timestamp
      if (typeof time === 'number' && time >= 180000 && time <= 600999)
        frames.set(Math.floor(time / 60000), frame)
    }
  for (const teamId of [100, 200]) {
    const team = participants.filter((p) => p.teamId === teamId)
    if (
      team.length !== 5 ||
      new Set(team.map((p) => p.participantId)).size !== 5 ||
      team.some((p) => !Number.isSafeInteger(p.participantId) || (p.participantId as number) <= 0)
    )
      continue
    const roles = new Map<number, RoleAssignment>(
      team.map((p) => [p.participantId as number, { role: historyRole(p), source: 'history' }]),
    )
    const smiters = team.filter((p) => p.spell1Id === 11 || p.spell2Id === 11)
    const jungleId = smiters.length === 1 ? (smiters[0].participantId as number) : null
    if (jungleId !== null) {
      // Smite distinguishes a jungler from a laner mislabelled JUNGLE by LCU.
      for (const [id, value] of roles)
        if (id !== jungleId && value.role === 'JUNGLE')
          roles.set(id, { role: null, source: 'unknown' })
      roles.set(jungleId, { role: 'JUNGLE', source: 'timeline' })
    }
    const bottom: { id: number; cs: number | null }[] = []
    for (const p of team) {
      const id = p.participantId as number
      if (id === jungleId) continue
      const votes = { TOP: 0, MID: 0, BOTTOM: 0 }
      let cs: number | null = null,
        latest = 0
      for (const frame of frames.values()) {
        const sample = record(record(frame.participantFrames)[String(id)])
        const lane = laneAt(sample.position)
        if (lane) votes[lane]++
        if (
          (frame.timestamp as number) >= 300000 &&
          (frame.timestamp as number) > latest &&
          Number.isSafeInteger(sample.minionsKilled) &&
          (sample.minionsKilled as number) >= 0
        ) {
          cs = sample.minionsKilled as number
          latest = frame.timestamp as number
        }
      }
      const ranked = (Object.entries(votes) as ['TOP' | 'MID' | 'BOTTOM', number][]).sort(
        (a, b) => b[1] - a[1],
      )
      const [lane, score] = ranked[0]
      const total = ranked.reduce((sum, pair) => sum + pair[1], 0)
      if (score < 3 || score - ranked[1][1] < 2 || score / total < 0.6) continue
      if (lane === 'BOTTOM') {
        bottom.push({ id, cs })
        const existing = roles.get(id)!
        if (existing.role !== 'BOTTOM' && existing.role !== 'SUPPORT')
          roles.set(id, { role: null, source: 'unknown' })
      } else roles.set(id, { role: lane, source: 'timeline' })
    }
    if (bottom.length === 2 && bottom.every((p) => p.cs !== null)) {
      bottom.sort((a, b) => b.cs! - a.cs!)
      if (bottom[0].cs! - bottom[1].cs! >= 10) {
        roles.set(bottom[0].id, { role: 'BOTTOM', source: 'timeline' })
        roles.set(bottom[1].id, { role: 'SUPPORT', source: 'timeline' })
      }
    }
    // Preserve uncertainty instead of inventing roles from participant array order.
    const counts = new Map<Role, number>()
    for (const value of roles.values())
      if (value.role) counts.set(value.role, (counts.get(value.role) ?? 0) + 1)
    for (const [id, value] of roles)
      result.set(
        id,
        value.role && counts.get(value.role) === 1 ? value : { role: null, source: 'unknown' },
      )
  }
  return result
}
