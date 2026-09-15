import { useState } from 'react'
import laneData from '../../../resources/champion-lanes.json'
import { ROLES, type Champion, type PoolEntry, type Role } from '../../shared/contracts'

export default function ChampionLibrary({
  champions,
  initialRole = 'TOP',
  pool,
  busy,
  ready,
  onOpen,
  onSave,
  onRemove,
}: {
  champions: Champion[]
  initialRole?: Role
  pool: PoolEntry[]
  busy: boolean
  ready: boolean
  onOpen: (id: number) => void
  onSave: (entry: PoolEntry) => void
  onRemove: (entry: PoolEntry) => void
}) {
  const [role, setRole] = useState<Role>(initialRole)
  const [query, setQuery] = useState('')
  const [laneFilter, setLaneFilter] = useState<Role | 'ALL'>('ALL')
  const lanesById: Record<string, string[]> = laneData.lanes
  const lanePool = pool.filter((p) => p.role === role)
  const filtered = champions.filter(
    (c) =>
      (laneFilter === 'ALL' || lanesById[c.id]?.includes(laneFilter)) &&
      `${c.name} ${c.nameJa}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <div className="champion-library">
      <section className="pool-panel panel" aria-label="レーン別チャンピオンプール">
        <div className="section-title">
          <h2>My Champion Pool</h2>
          <span className="muted">レーンごとに、使うチャンピオンを登録</span>
        </div>
        <div className="lane-tabs" role="group" aria-label="プールのレーン">
          {ROLES.map((lane) => (
            <button
              key={lane}
              aria-pressed={role === lane}
              onClick={() => setRole(lane)}
              disabled={busy}
            >
              {lane}
              <span>{pool.filter((p) => p.role === lane).length}</span>
            </button>
          ))}
        </div>
        <div className="section-title">
          <h3>{role}のプール</h3>
          <small>下のカードから登録できます · 複数レーンへの登録も可能</small>
        </div>
        {!ready ? (
          <p className="empty">プールを読み込めません。再読み込みしてください。</p>
        ) : lanePool.length === 0 ? (
          <p className="pool-empty">{role}のチャンピオンはまだ登録されていません。</p>
        ) : (
          <div className="pool-grid">
            {lanePool.map((entry) => {
              const c = champions.find((c) => c.id === entry.championId)
              if (!c) return null
              return (
                <article className="pool-card" key={c.id}>
                  <button className="pool-champion" onClick={() => onOpen(c.id)} disabled={busy}>
                    <img className="portrait" src={`./champions/${c.slug}.png`} alt="" />
                    <span>
                      <strong>{c.name}</strong>
                      <small>{c.nameJa}</small>
                    </span>
                  </button>
                  <div className="pool-controls">
                    <label>
                      自信度
                      <select
                        aria-label={`${c.name}の${role}自信度`}
                        value={entry.confidence}
                        disabled={busy}
                        onChange={(e) => onSave({ ...entry, confidence: Number(e.target.value) })}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {'★'.repeat(n)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      aria-label={`${c.name}を${role}から解除`}
                      disabled={busy}
                      onClick={() => onRemove(entry)}
                    >
                      解除
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      <div className="library-toolbar">
        <div>
          <h2>All Champions</h2>
          <p>カードをクリックして、チャンピオンの詳細とメモを開く</p>
        </div>
        <input
          aria-label="チャンピオン一覧を検索"
          placeholder="日本語・英語で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="lane-tabs" role="group" aria-label="一覧のレーン">
        {(['ALL', ...ROLES] as const).map((lane) => (
          <button key={lane} aria-pressed={laneFilter === lane} onClick={() => setLaneFilter(lane)}>
            {lane === 'ALL' ? 'All' : lane}
          </button>
        ))}
      </div>
      <div className="champion-grid">
        {filtered.map((c) => {
          const registered = lanePool.some((p) => p.championId === c.id)
          const lanes = pool.filter((p) => p.championId === c.id).map((p) => p.role)
          return (
            <article className="library-card" key={c.id}>
              <button
                className="champion-card"
                aria-label={`${c.name}の詳細を開く`}
                disabled={busy}
                onClick={() => onOpen(c.id)}
              >
                <img className="portrait large" src={`./champions/${c.slug}.png`} alt="" />
                <strong>{c.name}</strong>
                <small>{c.nameJa}</small>
              </button>
              <div className="registered-lanes">
                {lanes.length ? (
                  lanes.map((lane) => <span key={lane}>{lane}</span>)
                ) : (
                  <span className="unregistered">未登録</span>
                )}
              </div>
              <button
                className="pool-add"
                disabled={busy || !ready || registered}
                onClick={() => onSave({ championId: c.id, role, confidence: 3 })}
                aria-label={`${c.name}を${role}に登録`}
              >
                {registered ? `✓ ${role} 登録済み` : `＋ ${role}に登録`}
              </button>
            </article>
          )
        })}
      </div>
      {filtered.length === 0 && <p className="empty">該当するチャンピオンがいません。</p>}
    </div>
  )
}
