import { useEffect, useState } from 'react'
import type { Champion } from '../../shared/contracts'

export default function EnemyCounter({ enemy }: { enemy: Champion }) {
  const [body, setBody] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let cancelled = false
    setBody(null)
    setError('')
    window.notebook
      .getChampionCounter(enemy.id)
      .then((result) => {
        if (cancelled) return
        if (result.ok) setBody(result.data)
        else setError(result.error)
      })
      .catch(() => {
        if (!cancelled) setError('対策を読み込めませんでした。')
      })
    return () => {
      cancelled = true
    }
  }, [enemy.id, retry])
  return (
    <section className="enemy-counter panel" aria-label="敵チャンピオンの対策">
      <div className="section-title">
        <h2>{enemy.name}対策</h2>
      </div>
      <p className="muted">自分のチャンピオン・Roleを問わず共通する対策</p>
      {error ? (
        <div role="alert">
          {error} <button onClick={() => setRetry((n) => n + 1)}>再読み込み</button>
        </div>
      ) : body === null ? (
        <p role="status">対策を読み込み中…</p>
      ) : body ? (
        <p className="counter-body">{body}</p>
      ) : (
        <p className="muted">
          対策はまだありません。Championsで{enemy.name}を開くと記入できます。
        </p>
      )}
    </section>
  )
}
