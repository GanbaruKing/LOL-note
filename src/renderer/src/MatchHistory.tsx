import { splitReviewNote, type ReviewInfo } from '../../shared/reviewNote'
import { useEffect, useRef, useState } from 'react'
import {
  ROLES,
  type Champion,
  type HistoryGame,
  type HistoryList,
  type HistoryMatch,
  type MatchupKey,
  type Role,
  type SearchHit,
} from '../../shared/contracts'

const date = (game: HistoryGame) => new Date(game.createdAt).toLocaleString('ja-JP')
const outcome = (game: HistoryGame) => (game.win === null ? '結果不明' : game.win ? '勝利' : '敗北')
const kda = (game: HistoryGame) =>
  `${game.kills ?? '—'} / ${game.deaths ?? '—'} / ${game.assists ?? '—'}`
const queue = (id: number) =>
  ({
    420: 'ランク ソロ/デュオ',
    440: 'ランク フレックス',
    400: 'ノーマル ドラフト',
    430: 'ノーマル ブラインド',
    490: 'クイックプレイ',
  })[id] ?? `Queue ${id}`
function opponent(game: HistoryMatch, role: Role | ''): number | '' {
  const candidates = game.enemies.filter((p) => role && p.role === role)
  return candidates.length === 1 ? candidates[0].championId : ''
}

function Review({
  game,
  champions,
  onOpen,
}: {
  game: HistoryMatch
  champions: Champion[]
  onOpen: (key: MatchupKey, draft: ReviewInfo) => void
}) {
  const [role, setRole] = useState<Role | ''>(game.role ?? '')
  const [enemy, setEnemy] = useState<number | ''>(opponent(game, game.role ?? ''))
  const byId = new Map(champions.map((c) => [c.id, c]))
  const own = byId.get(game.championId)
  const selected = enemy ? byId.get(enemy) : undefined
  return (
    <section className="history-review panel" aria-label="振り返る対面">
      <span className="eyebrow accent">選択した試合</span>
      <h2>
        {own?.name ?? `Champion ${game.championId}`}{' '}
        <span className="muted">· {outcome(game)}</span>
      </h2>
      <p className="muted">
        {date(game)} · {queue(game.queueId)} · K / D / A {kda(game)}
      </p>
      <label className="history-role">
        自分のRole
        <select
          aria-label="振り返りのRole"
          value={role}
          onChange={(e) => {
            const next = e.target.value as Role | ''
            setRole(next)
            setEnemy(opponent(game, next))
          }}
        >
          <option value="">選択してください</option>
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <h3>対戦相手</h3>
      <p className="muted">
        履歴と序盤の行動から対面を自動判定します。実際の対面と違う場合は変更できます。
      </p>
      <div className="history-enemies" role="group" aria-label="振り返りの対戦相手">
        {game.enemies.map((p, index) => {
          const c = byId.get(p.championId)
          return (
            <button
              key={`${p.championId}-${index}`}
              aria-pressed={enemy === p.championId}
              onClick={() => setEnemy(p.championId)}
            >
              {c && <img className="portrait" src={`./champions/${c.slug}.png`} alt="" />}
              <span>
                {c?.name ?? `Champion ${p.championId}`}
                <small>{p.role ?? 'Role不明'}</small>
              </span>
            </button>
          )
        })}
      </div>
      {(!role || !enemy) && <p className="muted">Roleと対戦相手を選択してください。</p>}
      {(!own || (enemy && !selected)) && (
        <p role="alert">同梱データにないチャンピオンです。チャンピオンデータの更新が必要です。</p>
      )}
      <button
        className="primary"
        disabled={!role || !selected || !own}
        onClick={() => {
          if (!role || !selected || !own) return
          onOpen(
            { myChampionId: own.id, enemyChampionId: selected.id, role },
            {
              date: new Date(game.createdAt).toLocaleDateString('ja-JP'),
              gameId: String(game.gameId),
            },
          )
        }}
      >
        この対面のメモを書く →
      </button>
      <p className="muted">
        日付とゲームIDを添えてMatch upを開きます。本文に気づきを書いて保存してください。
      </p>
    </section>
  )
}

export default function MatchHistory({
  champions,
  onOpen,
  onOpenExisting,
}: {
  onOpenExisting: (hit: SearchHit) => void
  champions: Champion[]
  onOpen: (key: MatchupKey, draft: ReviewInfo) => void
}) {
  const [list, setList] = useState<HistoryList | null>(null)
  const [detail, setDetail] = useState<HistoryMatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [reviews, setReviews] = useState<SearchHit[]>([])
  const generation = useRef(0)
  async function refresh() {
    const id = ++generation.current
    setLoading(true)
    setList(null)
    setDetail(null)
    setSelectedId(null)
    setError('')
    try {
      const [result, notes] = await Promise.all([
        window.notebook.getMatchHistory(),
        window.notebook.searchNotes({
          query: '',
          role: 'ALL',
          category: '振り返り',
          pinnedOnly: false,
        }),
      ])
      if (!notes.ok) throw new Error(notes.error)
      if (id === generation.current)
        setReviews(notes.data.filter((n) => n.key && splitReviewNote(n).review))
      if (id !== generation.current) return
      if (!result.ok) throw new Error(result.error)
      setList(result.data)
    } catch (e) {
      if (id === generation.current)
        setError(e instanceof Error ? e.message : '履歴を取得できませんでした。')
    } finally {
      if (id === generation.current) setLoading(false)
    }
  }
  async function select(game: HistoryGame) {
    const id = ++generation.current
    setDetail(null)
    setSelectedId(game.gameId)
    setError('')
    try {
      const result = await window.notebook.getHistoryMatch(game.gameId)
      if (id !== generation.current) return
      if (!result.ok) throw new Error(result.error)
      setDetail(result.data)
    } catch (e) {
      if (id === generation.current) {
        setSelectedId(null)
        setError(e instanceof Error ? e.message : '試合を取得できませんでした。')
      }
    }
  }
  useEffect(() => {
    void refresh()
    return () => {
      generation.current++
    }
  }, [])
  const byId = new Map(champions.map((c) => [c.id, c]))
  return (
    <div className="history-page">
      <div className="history-toolbar panel">
        <div>
          <h2>最近の試合</h2>
          <p className="muted">
            League Clientから直近20試合を取得し、サモナーズリフトの試合を表示します。
          </p>
        </div>
        <button disabled={loading} onClick={() => void refresh()}>
          履歴を更新
        </button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {loading && (
        <p role="status" className="empty">
          試合履歴を読み込み中…
        </p>
      )}
      {list && list.skipped > 0 && (
        <p className="muted">
          対象外のモード、または必要な情報を確認できない試合を{list.skipped}件除外しました。
        </p>
      )}
      {list && !list.games.length && (
        <p className="empty panel">
          表示できる試合がありません。試合終了後に履歴を更新してください。
        </p>
      )}
      <div className="history-layout">
        {!!list?.games.length && (
          <section className="history-list panel" aria-label="最近の試合一覧">
            {list.games.map((game) => {
              const c = byId.get(game.championId)
              return (
                <button
                  className="history-row"
                  key={game.gameId}
                  aria-pressed={selectedId === game.gameId}
                  onClick={() => void select(game)}
                >
                  {c && <img className="portrait" src={`./champions/${c.slug}.png`} alt="" />}
                  <span className="history-game-info">
                    <strong>{c?.name ?? `Champion ${game.championId}`}</strong>
                    <small>{date(game)}</small>
                    <small>{queue(game.queueId)}</small>
                    {reviews.some(
                      (n) => splitReviewNote(n).review?.gameId === String(game.gameId),
                    ) && <small className="category-badge">記入済み</small>}
                  </span>
                  <span className="history-result">
                    <strong
                      className={game.win === null ? '' : game.win ? 'history-win' : 'history-loss'}
                    >
                      {outcome(game)}
                    </strong>
                    <small>{kda(game)}</small>
                    <small>
                      {Math.floor(game.duration / 60)}分{game.duration % 60}秒
                    </small>
                  </span>
                </button>
              )
            })}
          </section>
        )}
        {detail ? (
          <div>
            {reviews
              .filter((n) => splitReviewNote(n).review?.gameId === String(detail.gameId))
              .map((n) => (
                <div className="panel" key={n.id}>
                  <p>記入済み：{splitReviewNote(n).body.slice(0, 100)}</p>
                  <button onClick={() => onOpenExisting(n)}>この試合の既存メモを開く</button>
                </div>
              ))}
            <Review key={detail.gameId} game={detail} champions={champions} onOpen={onOpen} />
          </div>
        ) : (
          !!list?.games.length && (
            <section className="history-review panel empty" role="status">
              {selectedId
                ? '試合の詳細を読み込み中…'
                : '試合を選ぶと、対戦相手とRoleを確認できます。'}
            </section>
          )
        )}
      </div>
    </div>
  )
}
