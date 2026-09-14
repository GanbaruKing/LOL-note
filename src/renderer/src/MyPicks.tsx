import { useEffect, useState } from 'react'
import type { Champion, MatchupKey, MyPick, PoolEntry, Result, Role } from '../../shared/contracts'

export default function MyPicks({
  enemyChampionId,
  role,
  champions,
  pool,
  onSelect,
  readOnly = false,
  refreshToken,
}: {
  enemyChampionId: number
  role: Role
  champions: Champion[]
  pool: PoolEntry[]
  onSelect: (key: MatchupKey) => void
  readOnly?: boolean
  refreshToken?: unknown
}) {
  const [picks, setPicks] = useState<MyPick[]>([]),
    [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [selected, setSelected] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setSelected('')
    window.notebook
      .listMyPicks({ enemyChampionId, role })
      .then((r) => {
        if (!cancelled) {
          if (r.ok) setPicks(r.data)
          else setError(r.error)
        }
      })
      .catch(() => {
        if (!cancelled) setError('My Picksを読み込めません。')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
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
  const sorted = [...champions].sort(
    (a, b) =>
      Number(pool.some((p) => p.role === role && p.championId === b.id)) -
      Number(pool.some((p) => p.role === role && p.championId === a.id)),
  )
  return (
    <section className="my-picks panel" aria-label="My Picks">
      <div className="section-title">
        <h2>My Picks</h2>
        <small>自分の評価が高い順</small>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="empty">読み込み中…</p>
      ) : !picks.length ? (
        <p className="pool-empty">この対面・レーンの候補はまだありません。</p>
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
      {!readOnly && (
        <form
          className="pick-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (selected && !busy)
              void save(() =>
                window.notebook.saveMyPick({
                  myChampionId: Number(selected),
                  enemyChampionId,
                  role,
                }),
              )
          }}
        >
          <label>
            候補
            <select
              aria-label="My Picksのチャンピオン"
              value={selected}
              disabled={busy || loading}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">チャンピオンを選択</option>
              {sorted.map((c) => (
                <option value={c.id} key={c.id}>
                  {pool.some((p) => p.championId === c.id && p.role === role) ? '★ ' : ''}
                  {c.name} / {c.nameJa}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={!selected || loading || busy}>
            候補を保存
          </button>
        </form>
      )}
    </section>
  )
}
