import type { Note } from './contracts'

export interface ReviewInfo {
  date: string
  gameId: string
}

// Keep the existing backup/storage format while presenting the generated header separately.
// Only recognize the exact historical prefill on review notes; never strip arbitrary prose.
export function splitReviewNote(note: Pick<Note, 'body' | 'category'>): {
  body: string
  review: ReviewInfo | null
} {
  const match =
    note.category === '振り返り'
      ? /^日付：(\d{4}\/\d{1,2}\/\d{1,2})\r?\n(?:試合ID|ゲームID)：(\d+)\r?\n\r?\n([\s\S]*)$/.exec(
          note.body,
        )
      : null
  return match
    ? { review: { date: match[1], gameId: match[2] }, body: match[3] }
    : { review: null, body: note.body }
}

export function joinReviewNote(body: string, review: ReviewInfo | null): string {
  return review ? `日付：${review.date}\nゲームID：${review.gameId}\n\n${body}` : body
}
