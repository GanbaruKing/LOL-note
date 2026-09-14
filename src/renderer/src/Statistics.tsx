import { useEffect, useState } from 'react'
import catalog from '../../../resources/champions.json'
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
  const [filters, setFilters] = useState(() => {
    const fallback = {
      region: 'JP1',
      rank: 'ALL',
      patch: catalog.version.split('.').slice(0, 2).join('.'),
      minGames: 100,
    }
    try {
      const saved = JSON.parse(localStorage.getItem('statistics-filters') ?? 'null')
      if (
        saved &&
        typeof saved.region === 'string' &&
        typeof saved.rank === 'string' &&
        /^\d+\.\d+$/.test(saved.patch) &&
        Number.isInteger(saved.minGames) &&
        saved.minGames >= 1 &&
        saved.minGames <= 1000000
      )
        return { ...fallback, ...saved } as typeof fallback
    } catch {
      /* Use defaults when local preferences are unavailable. */
    }
    return fallback
  })
  const [draft, setDraft] = useState(filters)
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
      .getStatistics({ enemyChampionId, role, demo, ...filters })
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
  }, [enemyChampionId, role, demo, revision, filters])
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
        <h2>Top Matchup Picks</h2>
        <small>{filters.minGames.toLocaleString()}試合以上 · 勝率上位10体</small>
      </div>
      <p>
        vs {champions.find((c) => c.id === enemyChampionId)?.name ?? enemyChampionId} · {role}
      </p>
      <form
        className="statistics-filters"
        onSubmit={(e) => {
          e.preventDefault()
          setFilters({ ...draft })
          try {
            localStorage.setItem('statistics-filters', JSON.stringify(draft))
          } catch {
            /* Filtering still works without persistence. */
          }
        }}
      >
        <label>
          地域
          <select
            aria-label="統計の地域"
            value={draft.region}
            onChange={(e) => setDraft({ ...draft, region: e.target.value })}
          >
            {[
              ['GLOBAL', '全地域'],
              ['JP1', '日本'],
              ['KR', '韓国'],
              ['NA1', '北米'],
              ['EUW1', '西ヨーロッパ'],
              ['EUN1', '北・東ヨーロッパ'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          ランク帯
          <select
            aria-label="統計のランク"
            value={draft.rank}
            onChange={(e) => setDraft({ ...draft, rank: e.target.value })}
          >
            {[
              ['ALL', '全ランク'],
              ['EMERALD_PLUS', 'Emerald+'],
              ['DIAMOND_PLUS', 'Diamond+'],
              ['MASTER_PLUS', 'Master+'],
              ['IRON', 'Iron'],
              ['BRONZE', 'Bronze'],
              ['SILVER', 'Silver'],
              ['GOLD', 'Gold'],
              ['PLATINUM', 'Platinum'],
              ['EMERALD', 'Emerald'],
              ['DIAMOND', 'Diamond'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          パッチ
          <input
            aria-label="統計のパッチ"
            required
            pattern="[0-9]+[.][0-9]+"
            maxLength={20}
            value={draft.patch}
            onChange={(e) => setDraft({ ...draft, patch: e.target.value })}
          />
        </label>
        <label>
          最低試合数
          <input
            aria-label="統計の最低試合数"
            type="number"
            min={1}
            max={1000000}
            required
            value={draft.minGames || ''}
            onChange={(e) => setDraft({ ...draft, minGames: Number(e.target.value) })}
          />
        </label>
        <button className="primary" type="submit">
          条件を適用
        </button>
      </form>
      <p>
        適用中：{filters.region} · {filters.rank} · Patch {filters.patch}
      </p>
      <details className="statistics-tools">
        <summary>データ設定・サンプル</summary>
        <div className="statistics-actions">
          <button disabled={busy} onClick={() => void importData()}>
            統計JSONを取り込む
          </button>
          <button disabled={busy} aria-pressed={demo} onClick={() => setDemo(!demo)}>
            {demo ? '取り込んだ統計に戻す' : 'サンプルを見る'}
          </button>
        </div>
      </details>
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
              {data.rows.map((row, index) => {
                const c = champions.find((c) => c.id === row.myChampionId)
                return (
                  <button
                    className="statistics-row"
                    key={row.myChampionId}
                    onClick={() => onSelect(row)}
                  >
                    <span className="statistics-place">{index + 1}</span>
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
            <p>この対面・レーンで条件を満たすデータはありません。</p>
          )}
        </>
      ) : (
        !error && (
          <p>
            この条件の統計データは未接続です。地域・ランク・パッチが一致するデータのみ表示します。
          </p>
        )
      )}
    </section>
  )
}
