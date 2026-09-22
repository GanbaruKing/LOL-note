// Treat kana, width, case and spacing consistently across champion selectors.
export function normalizeChampionSearch(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 0x60))
    .replace(/[\s・.'’-]/g, '')
}
