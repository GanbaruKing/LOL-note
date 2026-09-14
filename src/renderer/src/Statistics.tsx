import { useEffect, useState } from 'react'
import type { Champion, MatchupKey, Role, StatisticsData } from '../../shared/contracts'

export default function Statistics({
  enemyChampionId,
  role,
  champions,
  onSelect,
}: {
  enemyChampionId: number
  role: Role
  champions: Champion[]
  onSelect: (key: MatchupKey) => void
}) {
  const [demo, setDemo] = useState(false),
    [revision, setRevision] = useState(0)
  const [data, setData] = useState<StatisticsData | null>(null)
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    setError('')
    window.notebook
      .getStatistics({ enemyChampionId, role, demo })
      .then((r) => {
        if (cancelled) return
        if (r.ok) setData(r.data)
        else setError(r.error)
      })
      .catch(() => {
        if (!cancelled) setError('統計を取得できません。')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enemyChampionId, role, demo, revision])
  async function importData() {
    setBusy(true)
    setError('')
    try {
      const r = await window.notebook.importStatistics()
      if (!r.ok) throw new Error(r.error)
      if (r.data) {
        setDemo(false)
        setRevision((n) => n + 1)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="statistics-panel panel" aria-label="Statistics">
      <div className="section-title">
        <h2>Statistics</h2>
        <small>100試合以上 · 勝率順</small>
      </div>
      <p>
        vs {champions.find((c) => c.id === enemyChampionId)?.name ?? enemyChampionId} · {role}
      </p>
      <div className="statistics-actions">
        <button disabled={busy} onClick={() => void importData()}>
          統計JSONを取り込む
        </button>
        <button disabled={busy} aria-pressed={demo} onClick={() => setDemo(!demo)}>
          {demo ? '取り込んだ統計に戻す' : 'サンプルを見る'}
        </button>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {loading ? (
        <p>統計を読み込み中…</p>
      ) : data ? (
        <>
          {data.isDemo && (
            <p className="error-banner">SAMPLE · 架空データです。実際の勝率ではありません。</p>
          )}
          <p className="statistics-meta">
            出典：{data.source}
            <br />
            Patch：{data.patch} · {data.region} · {data.rank} · {data.queue}
            <br />
            作成日時：{data.generatedAt}
          </p>
          {data.rows.length ? (
            <div className="statistics-list">
              {data.rows.map((row) => {
                const c = champions.find((c) => c.id === row.myChampionId)
                return (
                  <button
                    className="statistics-row"
                    key={row.myChampionId}
                    onClick={() => onSelect(row)}
                  >
                    {c && <img className="portrait" src={`./champions/${c.slug}.png`} alt="" />}
                    <strong>{c?.name ?? row.myChampionId}</strong>
                    <span>
                      {((100 * row.wins) / row.games).toFixed(1)}%
                      <small>{row.games.toLocaleString()} Games</small>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p>この対面・レーンで100試合以上のデータはありません。</p>
          )}
        </>
      ) : (
        !error && <p>統計は未登録です。統計JSONを取り込むと表示できます。</p>
      )}
    </section>
  )
}
