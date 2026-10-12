import type { Note } from '../../shared/contracts'
import { splitReviewNote, type ReviewInfo } from '../../shared/reviewNote'

export function ReviewDetails({ review }: { review: ReviewInfo }) {
  return (
    <div className="review-details" role="group" aria-label="振り返りのゲーム情報">
      <span>日付：{review.date}</span>
      <span>ゲームID：{review.gameId}</span>
    </div>
  )
}

export function ReviewTag({ note }: { note: Pick<Note, 'category'> }) {
  return note.category === '振り返り' ? <span className="category-badge">振り返り</span> : null
}

export default function NoteContent({
  note,
}: {
  note: Pick<Note, 'category' | 'body'>
}) {
  const { body, review } = splitReviewNote(note)
  return (
    <>
      {review && <ReviewDetails review={review} />}
      <p className="note-body">{body}</p>
    </>
  )
}
