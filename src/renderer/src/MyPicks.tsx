import { useEffect, useState } from 'react'
import type { Champion, MatchupKey, MyPick, Result, Role } from '../../shared/contracts'

export default function MyPicks({
  enemyChampionId,
  role,
  champions,
  onSelect,
  readOnly = false,
  refreshToken,
}: {
  enemyChampionId: number
  role: Role
  champions: Champion[]
  onSelect: (key: MatchupKey) => void
  readOnly?: boolean
  refreshToken?: unknown
}) {
  const [picks, setPicks] = useState<MyPick[]>([]),
    [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    let request = 0
    const load = () => {
      const current = ++request
      setLoading(true)
      setError('')
      window.notebook
        .listMyPicks({ enemyChampionId, role })
        .then((r) => {
          if (!cancelled && current === request) {
            if (r.ok) setPicks(r.data)
            else setError(r.error)
          }
        })
        .catch(() => {
          if (!cancelled && current === request) setError('Comfort Picksを読み込めません。')
        })
        .finally(() => {
          if (!cancelled && current === request) setLoading(false)
        })
    }
    load()
    window.addEventListener('focus', load)
    return () => {
      cancelled = true
      window.removeEventListener('focus', load)
    }
  }, [enemyChampionId, role, refreshToken])
  async function save(operation: () => Promise<Result<MyPick[]>>) {
    setBusy(true)
    setError('')
    try {
      const r = await operation()
      if (!r.ok) throw new Error(r.error)
      setPicks(r.data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="my-picks panel" aria-label="Comfort Picks">
      <div className="section-title">
        <h2>Comfort Picks</h2>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="empty">読み込み中…</p>
      ) : !picks.length ? (
        <p className="pool-empty">
          {champions.find((c) => c.id === enemyChampionId)?.name ?? 'このチャンピオン'}
          に対して得意なピックを追加しましょう。
        </p>
      ) : (
        <div className="pick-list">
          {picks.map((p) => {
            const c = champions.find((c) => c.id === p.myChampionId)
            return (
              <div className="pick-row" key={p.myChampionId}>
                <button disabled={busy} onClick={() => onSelect(p)}>
                  {c && <img className="portrait" src={`./champions/${c.slug}.png`} alt="" />}
                  <strong>{c?.name ?? p.myChampionId}</strong>
                  <span className="pick-confidence">
                    {p.rating === null ? '未評価' : '★'.repeat(p.rating)}
                  </span>
                </button>
                {!readOnly && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => void save(() => window.notebook.removeMyPick(p))}
                    >
                      解除
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
