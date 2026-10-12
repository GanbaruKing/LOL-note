// Shared by selectors, notebook articles, and database search.
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s・.'’-]/g, '')
}
export function matchesSearch(text: string, query: string): boolean {
  const normalized = normalizeSearch(text)
  return query
    .normalize('NFKC')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => normalized.includes(normalizeSearch(token)))
}
