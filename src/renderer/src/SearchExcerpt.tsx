import { normalizeSearch } from '../../shared/search'
export default function SearchExcerpt({ body, query }: { body: string; query: string }) {
  const offsets: number[] = []
  let normalized = ''
  for (let i = 0; i < body.length; i++) {
    const part = normalizeSearch(body[i])
    normalized += part
    for (let j = 0; j < part.length; j++) offsets.push(i)
  }
  const tokens = query.normalize('NFKC').trim().split(/\s+/).map(normalizeSearch).filter(Boolean)
  const ranges: [number, number][] = []
  for (const token of tokens) {
    let position = normalized.indexOf(token)
    while (position >= 0) {
      ranges.push([offsets[position], offsets[position + token.length - 1] + 1])
      position = normalized.indexOf(token, position + token.length)
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  const start = Math.max(0, (ranges[0]?.[0] ?? 0) - 65)
  const end = Math.min(body.length, start + 260)
  return (
    <p className="note-body search-excerpt">
      {start > 0 ? '…' : ''}
      {Array.from({ length: end - start }, (_, n) => {
        const i = start + n
        return ranges.some(([a, b]) => i >= a && i < b) ? <mark key={i}>{body[i]}</mark> : body[i]
      })}
      {end < body.length ? '…' : ''}
    </p>
  )
}
