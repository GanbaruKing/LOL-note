import { useEffect, useState } from 'react'
import {
  CATEGORIES,
  ROLES,
  type Champion,
  type SearchInput,
  type SearchHit,
} from '../../shared/contracts'

export default function NoteSearch({
  champions,
  onOpen,
}: {
  champions: Champion[]
  onOpen: (hit: SearchHit) => void
}) {
  const [filters, setFilters] = useState<SearchInput>({
    query: '',
    role: 'ALL',
    category: 'ALL',
    pinnedOnly: false,
  })
  const [hits, setHits] = useState<SearchHit[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      void window.notebook
        .searchNotes(filters)
        .then((r) => {
          if (!cancelled) {
            if (r.ok) {
              setHits(r.data)
              setError('')
            } else setError(r.error)
          }
        })
        .catch(() => {
          if (!cancelled) setError('検索できませんでした。')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [filters])
  const name = (id: number) => champions.find((c) => c.id === id)?.name ?? String(id)
  return (
    <section className="search-page">
      <div className="search-filters panel">
        <input
          aria-label="メモ横断検索"
          placeholder="例：Darius Ghost（スペース区切りで絞り込み）"
          maxLength={200}
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
        />
        <select
          aria-label="検索レーン"
          value={filters.role}
          onChange={(e) => setFilters({ ...filters, role: e.target.value as SearchInput['role'] })}
        >
          <option value="ALL">全レーン・単体メモ</option>
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select
          aria-label="検索カテゴリー"
          value={filters.category}
          onChange={(e) =>
            setFilters({ ...filters, category: e.target.value as SearchInput['category'] })
          }
        >
          <option value="ALL">全カテゴリー</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={filters.pinnedOnly}
            onChange={(e) => setFilters({ ...filters, pinnedOnly: e.target.checked })}
          />
          Pinのみ
        </label>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <p className="muted" role="status">
        {loading ? '検索中…' : `${hits.length} 件`}
      </p>
      {!loading &&
        hits.map((hit) => (
          <article className="search-hit panel" key={`${hit.scope}-${hit.id}`}>
            <div className="section-title">
              <h2>
                {hit.pinned ? '★ ' : ''}
                {name(hit.championId)}
                {hit.key
                  ? ` vs ${name(hit.key.enemyChampionId)} · ${hit.key.role}`
                  : ' · Champion Notes'}
              </h2>
              <button onClick={() => onOpen(hit)}>ノートを開く →</button>
            </div>
            <span className="category-badge">{hit.category}</span>
            <p className="note-body">{hit.body}</p>
          </article>
        ))}
      {!loading && !hits.length && <p className="empty">一致するメモはありません。</p>}
    </section>
  )
}
