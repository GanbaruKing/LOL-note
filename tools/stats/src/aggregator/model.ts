export function expectedWinRate(championRate: number, opponentRate: number) {
  return (championRate + 100 - opponentRate) / 2
}
export function wilson(wins: number, games: number): [number, number] {
  if (
    !Number.isSafeInteger(games) ||
    games <= 0 ||
    !Number.isSafeInteger(wins) ||
    wins < 0 ||
    wins > games
  )
    throw new Error('Invalid binomial counts')
  const p = wins / games,
    z = 1.959963984540054,
    d = 1 + (z * z) / games,
    c = (p + (z * z) / (2 * games)) / d,
    h = (z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games))) / d
  return [
    wins === 0 ? 0 : Math.max(0, 100 * (c - h)),
    wins === games ? 100 : Math.min(100, 100 * (c + h)),
  ]
}
export function confidence(games: number, thresholds: number[]) {
  return games < thresholds[0]
    ? 'VERY_LOW'
    : games < thresholds[1]
      ? 'LOW'
      : games < thresholds[2]
        ? 'MEDIUM'
        : 'HIGH'
}
