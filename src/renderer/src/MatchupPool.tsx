import Collapsible from './Collapsible'
import type { Champion, PoolEntry, Role } from '../../shared/contracts'

export default function MatchupPool({
  champions,
  pool,
  role,
  selectedId,
  ready,
  busy,
  onSelect,
  onManage,
}: {
  champions: Champion[]
  pool: PoolEntry[]
  role: Role
  selectedId: number
  ready: boolean
  busy: boolean
  onSelect: (championId: number) => void
  onManage: () => void
}) {
  const byId = new Map(champions.map((c) => [c.id, c]))
  const entries = pool
    .filter((p) => p.role === role && byId.has(p.championId))
    .sort((a, b) => b.confidence - a.confidence || a.championId - b.championId)
  return (
    <section className="matchup-pool panel" aria-label="Match upのFavorite Picks">
      <Collapsible
        id="matchup-favorites"
        title={
          <>
            {' '}
            Favorite Picks <span className="count">{entries.length}</span>
          </>
        }
      >
        <div className="section-title">
          <span className="role-badge">{role}</span>
        </div>
        <p className="muted">選ぶと自分のチャンピオンを切り替えます。</p>
        {!ready ? (
          <p className="pool-empty">プールを読み込めません。再読み込みしてください。</p>
        ) : !entries.length ? (
          <p className="pool-empty">{role}のチャンピオンはまだ登録されていません。</p>
        ) : (
          <div className="matchup-pool-list">
            {entries.map((entry) => {
              const c = byId.get(entry.championId)!
              return (
                <button
                  className="matchup-pool-pick"
                  key={c.id}
                  disabled={busy}
                  aria-label={`${c.name}を自分のチャンピオンに選択`}
                  aria-pressed={selectedId === c.id}
                  onClick={() => onSelect(c.id)}
                >
                  <img className="portrait" src={`./champions/${c.slug}.png`} alt="" />
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.nameJa}</small>
                    <small className="pool-confidence" aria-label={`自信度${entry.confidence}`}>
                      {'★'.repeat(entry.confidence)}
                    </small>
                  </span>
                  {selectedId === c.id && <span className="selected-mark">✓</span>}
                </button>
              )
            })}
          </div>
        )}
        <button className="pool-manage" disabled={busy} onClick={onManage}>
          プールを編集 →
        </button>
      </Collapsible>
    </section>
  )
}
