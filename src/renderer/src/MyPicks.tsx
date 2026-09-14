import { useEffect, useState } from 'react'
import type { Champion, MatchupKey, MyPick, PoolEntry, Result, Role } from '../../shared/contracts'

export default function MyPicks({
  enemyChampionId,
  role,
  champions,
  pool,
  onSelect,
  readOnly = false,
}: {
  enemyChampionId: number
  role: Role
  champions: Champion[]
  pool: PoolEntry[]
  onSelect: (key: MatchupKey) => void
  readOnly?: boolean
}) {
  const [picks, setPicks] = useState<MyPick[]>([]),
    [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [selected, setSelected] = useState(''),
    [priority, setPriority] = useState(1),
    [confidence, setConfidence] = useState(3)
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
  }, [enemyChampionId, role])
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
        <small>自分が使う候補 · 優先順位順</small>
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
                  <span className="count">{p.priority}</span>
                  {c && <img className="portrait" src={`./champions/${c.slug}.png`} alt="" />}
                  <strong>{c?.name ?? p.myChampionId}</strong>
                  <span className="pick-confidence">{'★'.repeat(p.confidence)}</span>
                </button>
                {!readOnly && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setSelected(String(p.myChampionId))
                        setPriority(p.priority)
                        setConfidence(p.confidence)
                      }}
                    >
                      編集
                    </button>
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
                  priority,
                  confidence,
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
          <label>
            優先順位
            <input
              aria-label="My Picksの優先順位"
              type="number"
              min={1}
              max={99}
              required
              value={priority}
              disabled={busy}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
          </label>
          <label>
            自信度
            <select
              aria-label="My Picksの自信度"
              value={confidence}
              disabled={busy}
              onChange={(e) => setConfidence(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
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
