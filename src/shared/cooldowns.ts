// Conditions checked against the bundled patch's Data Dragon spell descriptions / IDs.
export function cooldownHint(championId: number, key: string): string {
  if ([60, 76].includes(championId))
    return key === 'R'
      ? '変身のCD。変身後のQ/W/Eは別スキルです。'
      : 'ヒト形態の値。変身後のスキルCDは未収録です。'
  if (championId === 126)
    return key === 'R' ? '形態切替のCD。' : 'ハンマー形態の値。キャノン形態のCDは未収録です。'
  if (championId === 157 && key === 'E') return '使用間隔。同じ対象への再使用制限は別です。'
  if (championId === 42 && key === 'R') return '発射間隔。ミサイルの補充時間とは異なります。'
  if (championId === 143 && key === 'W')
    return '種のチャージ制。補充時間はこの値から判断できません。'
  if (championId === 92 && key === 'Q')
    return '連続して再使用できるスキル。各段の間隔ではありません。'
  if (championId === 777 && key === 'W') return '攻撃速度によってCDが変化します。'
  if (championId === 221 && key === 'Q')
    return '通常攻撃として扱うスキル。固定CDはこの値から判断できません。'
  return ''
}
export function cooldownValue(values: number[]): string {
  if (!values.length || values.some((n) => !Number.isFinite(n) || n <= 0)) return '固定CD未収録'
  return (new Set(values).size === 1 ? [values[0]] : values).join(' / ')
}
