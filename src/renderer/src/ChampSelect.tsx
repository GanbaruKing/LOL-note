import { useEffect, useState } from 'react'
import {
  ROLES,
  type Champion,
  type LcuState,
  type MatchupKey,
  type Matchup,
  type Note,
  type Role,
} from '../../shared/contracts'
import MyPicks from './MyPicks'

export default function ChampSelect({
  state,
  champions,
  onOpen,
}: {
  state: LcuState
  champions: Champion[]
  onOpen: (key: MatchupKey) => void
}) {
  const [enemy, setEnemy] = useState<number | null>(null),
    [manualOwn, setManualOwn] = useState<number | null>(null),
    [manualRole, setManualRole] = useState<Role | null>(null)
  const [matchup, setMatchup] = useState<Matchup | null>(null),
    [general, setGeneral] = useState<Note[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  const own = manualOwn ?? state.ownChampionId,
    role = manualRole ?? state.role
  const ownChampion = champions.find((c) => c.id === own)
  const currentEnemy = enemy && state.enemyChampionIds.includes(enemy) ? enemy : null
  const current = state.status === 'champ-select'
  useEffect(() => {
    let cancelled = false
    setMatchup(null)
    setGeneral([])
    setError('')
    if (!current || !currentEnemy || !own || !role) {
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([
      window.notebook.getMatchup({ myChampionId: own, enemyChampionId: currentEnemy, role }),
      window.notebook.getChampionPage(own),
    ])
      .then(([m, c]) => {
        if (cancelled) return
        if (!m.ok) throw new Error(m.error)
        if (!c.ok) throw new Error(c.error)
        setMatchup(m.data)
        setGeneral(c.data.notes)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [current, currentEnemy, own, role])
  const name = (id: number) => champions.find((c) => c.id === id)?.name ?? `Champion #${id}`
  if (!current)
    return (
      <section className="panel lcu-empty">
        <h2>{state.message}</h2>
        <p>Champion Selectが始まると、自分のRoleと確認できる敵Pickが表示されます。</p>
        <p>自動接続できない場合はSettingsでLeagueのフォルダーを選択してください。</p>
      </section>
    )
  const valid =
    matchup &&
    matchup.myChampionId === own &&
    matchup.enemyChampionId === currentEnemy &&
    matchup.role === role
  return (
    <div className="select-page">
      <div className="panel select-context">
        <strong>Champion Select Active</strong>
        <span>Role取得：{state.role ?? '未確定'}</span>
        <label>
          表示レーン
          <select
            aria-label="Champ Selectのレーン"
            value={role ?? ''}
            onChange={(e) => setManualRole(e.target.value as Role)}
          >
            <option value="" disabled>
              レーンを選択
            </option>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          自分のPick
          {ownChampion && (
            <img
              className="portrait"
              src={`./champions/${ownChampion.slug}.png`}
              alt={`自分のPick: ${ownChampion.name}`}
            />
          )}
          <select
            aria-label="Champ Selectの自分Pick"
            value={own ?? ''}
            onChange={(e) => setManualOwn(Number(e.target.value))}
          >
            <option value="" disabled>
              未選択
            </option>
            {champions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            setManualOwn(null)
            setManualRole(null)
          }}
        >
          LCUの選択へ戻す
        </button>
      </div>
      <section className="enemy-picks panel">
        <h2>Enemy Picks</h2>
        <p className="muted">
          対面だと思うチャンピオンを選んでください。敵のレーンは自動判定しません。
        </p>
        <div>
          {state.enemyChampionIds.map((id) => {
            const c = champions.find((c) => c.id === id)
            return (
              <button key={id} aria-pressed={currentEnemy === id} onClick={() => setEnemy(id)}>
                {c && <img className="portrait large" src={`./champions/${c.slug}.png`} alt="" />}
                <strong>{name(id)}</strong>
              </button>
            )
          })}
        </div>
        {!state.enemyChampionIds.length && <p className="empty">敵Pickはまだ確認できません。</p>}
      </section>
      {currentEnemy && role && (
        <MyPicks
          key={`${currentEnemy}-${role}`}
          enemyChampionId={currentEnemy}
          role={role}
          champions={champions}
          readOnly
          onSelect={(key) => setManualOwn(key.myChampionId)}
        />
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="empty">ノートを読み込み中…</p>
      ) : valid ? (
        <section className="panel select-notes">
          <div className="section-title">
            <h2>
              {name(own!)} vs {name(currentEnemy!)} · {role}
            </h2>
            <button onClick={() => onOpen(matchup)}>Match upで編集 →</button>
          </div>
          <h3>Matchup Notes</h3>
          {!matchup.notes.length && <p className="empty">この対面のメモはまだありません。</p>}
          {matchup.notes.map((n) => (
            <article className="note-card" key={n.id}>
              <span className="category-badge">
                {n.pinned ? '★ PIN · ' : ''}
                {n.category}
              </span>
              <p className="note-body">{n.body}</p>
            </article>
          ))}
          <h3>Champion Notes</h3>
          {!general.length && <p className="pool-empty">単体メモはまだありません。</p>}
          {general.map((n) => (
            <article className="note-card" key={n.id}>
              <span className="category-badge">
                {n.pinned ? '★ PIN · ' : ''}
                {n.category}
              </span>
              <p className="note-body">{n.body}</p>
            </article>
          ))}
        </section>
      ) : (
        <p className="empty">敵Pick・自分のPick・レーンを選ぶと、保存済みの知識を表示します。</p>
      )}
    </div>
  )
}
