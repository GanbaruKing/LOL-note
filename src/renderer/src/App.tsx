import { useEffect, useRef, useState } from 'react'
import ChampionLibrary from './ChampionLibrary'
import {
  CATEGORIES,
  ROLES,
  type Category,
  type Champion,
  type ChampionPage,
  type Matchup,
  type MatchupKey,
  type MatchupSummary,
  type Note,
  type Result,
  type PoolEntry,
  type Role,
} from '../../shared/contracts'

async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new Error(result.error)
  return result.data
}
const sameKey = (a: MatchupKey, b: MatchupKey) =>
  a.myChampionId === b.myChampionId && a.enemyChampionId === b.enemyChampionId && a.role === b.role
const difficultyLabel = { Unset: '未設定', Easy: 'Easy', Even: 'Even', Hard: 'Hard' }
function Portrait({ champion, large = false }: { champion: Champion; large?: boolean }) {
  return (
    <img
      className={`portrait ${large ? 'large' : ''}`}
      src={`./champions/${champion.slug}.png`}
      alt=""
    />
  )
}
function ChampionPicker({
  label,
  selected,
  champions,
  disabled,
  onChange,
}: {
  label: string
  selected?: Champion
  champions: Champion[]
  disabled: boolean
  onChange: (id: number) => void
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  const filtered = champions.filter((c) =>
    `${c.name} ${c.nameJa} ${c.slug}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  )
  return (
    <div
      className="picker"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      <span className="eyebrow">{label}</span>
      <button
        className="picker-button"
        disabled={disabled}
        aria-label={`${label}を選択`}
        aria-expanded={open}
        onClick={() => {
          setQuery('')
          setOpen(!open)
        }}
      >
        {selected && <Portrait champion={selected} />}
        <span>
          <strong>{selected?.name ?? '選択してください'}</strong>
          <small>{selected?.nameJa}</small>
        </span>
        <span className="chevron">⌄</span>
      </button>
      {open && (
        <div className="picker-menu">
          <input
            autoFocus
            aria-label={`${label}を検索`}
            placeholder="日本語・英語で検索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="picker-results">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onChange(c.id)
                  setOpen(false)
                }}
              >
                <Portrait champion={c} />
                <span>
                  {c.name}
                  <small>{c.nameJa}</small>
                </span>
                {c.id === selected?.id && <span className="selected-mark">✓</span>}
              </button>
            ))}
            {!filtered.length && <p className="muted">該当するチャンピオンがいません。</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [champions, setChampions] = useState<Champion[]>([])
  const [summaries, setSummaries] = useState<MatchupSummary[]>([])
  const [key, setKey] = useState<MatchupKey>({
    myChampionId: 266,
    enemyChampionId: 122,
    role: 'TOP',
  })
  const [matchup, setMatchup] = useState<Matchup | null>(null)
  const [championId, setChampionId] = useState(266)
  const [championDetailOpen, setChampionDetailOpen] = useState(false)
  const [pool, setPool] = useState<PoolEntry[]>([])
  const [poolReady, setPoolReady] = useState(false)
  const [detailRole, setDetailRole] = useState<Role | 'ALL'>('ALL')
  const [recentRole, setRecentRole] = useState<Role | 'ALL'>('ALL')
  const [championData, setChampionData] = useState<ChampionPage | null>(null)
  const [championLoading, setChampionLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const [page, setPage] = useState<'notebook' | 'champions' | 'settings'>('notebook')
  const [query, setQuery] = useState('')
  const [error, setError] = useState(''),
    [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false)
  const [body, setBody] = useState(''),
    [category, setCategory] = useState<Category>('General')
  const [editing, setEditing] = useState<Note | null>(null),
    [deleting, setDeleting] = useState<number | null>(null)
  const [info, setInfo] = useState<{ databasePath: string; catalogVersion: string } | null>(null)
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)
  const generation = useRef(0),
    editor = useRef<HTMLTextAreaElement>(null)
  const byId = new Map(champions.map((c) => [c.id, c]))
  const mine = byId.get(key.myChampionId),
    enemy = byId.get(key.enemyChampionId)
  const dirty = editing
    ? body !== editing.body || category !== editing.category
    : body.trim().length > 0
  const selectedChampion = byId.get(championId)
  const activeNotes = page === 'champions' ? championData?.notes : matchup?.notes
  const activeLoading = page === 'champions' ? championLoading : loading
  const ready =
    page === 'champions'
      ? !championLoading && championData?.championId === championId
      : !loading && !!matchup && sameKey(key, matchup)

  async function initialize() {
    try {
      setError('')
      const [all, saved, appInfo, savedPool] = await Promise.all([
        unwrap(window.notebook.listChampions()),
        unwrap(window.notebook.listMatchups()),
        unwrap(window.notebook.getInfo()),
        unwrap(window.notebook.listPool()),
      ])
      setChampions(all)
      setSummaries(saved)
      setInfo(appInfo)
      setPool(savedPool)
      setPoolReady(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    void initialize()
  }, [])
  useEffect(() => {
    const id = ++generation.current
    setLoading(true)
    setError('')
    setStatus('')
    setMatchup(null)
    unwrap(window.notebook.getMatchup(key))
      .then((value) => {
        if (id === generation.current) setMatchup(value)
      })
      .catch((e) => {
        if (id === generation.current) setError(e.message)
      })
      .finally(() => {
        if (id === generation.current) setLoading(false)
      })
  }, [key])
  useEffect(() => {
    if (page !== 'champions' || !championDetailOpen) return
    let cancelled = false
    setChampionLoading(true)
    setChampionData(null)
    setError('')
    setStatus('')
    unwrap(window.notebook.getChampionPage(championId))
      .then((data) => {
        if (!cancelled) setChampionData(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setChampionLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [championId, page, reload, championDetailOpen])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty, busy])

  function resetEditor() {
    setEditing(null)
    setBody('')
    setCategory('General')
    setDeleting(null)
  }
  function navigate(action: () => void) {
    if (busy) return
    if (dirty) setPendingNavigation(() => action)
    else {
      resetEditor()
      action()
    }
  }
  function choose(next: MatchupKey) {
    if (sameKey(next, key) && page === 'notebook') return
    navigate(() => {
      setKey(next)
      setPage('notebook')
    })
  }
  async function mutate(
    operation: () => Promise<Result<Matchup | ChampionPage>>,
    message: string,
    reset = false,
  ) {
    if (busy) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const result = await unwrap(operation())
      if ('championId' in result) setChampionData(result)
      else setMatchup(result)
      if (reset) resetEditor()
      setStatus(message)
      setSummaries(await unwrap(window.notebook.listMatchups()))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function edit(note: Note) {
    navigate(() => {
      setEditing(note)
      setBody(note.body)
      setCategory(note.category)
      setTimeout(() => editor.current?.focus(), 0)
    })
  }
  async function changePool(operation: () => Promise<Result<PoolEntry[]>>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      setPool(await unwrap(operation()))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const detailMatchups =
    championData?.matchups.filter((m) => detailRole === 'ALL' || m.role === detailRole) ?? []
  const filtered = summaries.filter((s) => {
    if (recentRole !== 'ALL' && s.role !== recentRole) return false
    const a = byId.get(s.myChampionId),
      b = byId.get(s.enemyChampionId)
    return `${a?.name} ${a?.nameJa} ${b?.name} ${b?.nameJa} ${s.role}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  })

  const notesPanel = (
    <section className="notes-panel panel">
      <div className="section-title">
        <div className="notes-title">
          <h2>{page === 'champions' ? 'Champion Notes' : 'My Notes'}</h2>
          <span className="count">{activeNotes?.length ?? 0}</span>
        </div>
        <span className="save-status" role="status">
          {busy ? '保存中…' : status || 'SQLite · ローカル保存'}
        </span>
      </div>
      <div className="notes-content">
        {activeLoading ? (
          <p className="empty">ノートを読み込み中…</p>
        ) : !activeNotes ? (
          <p className="empty">ノートを読み込めませんでした。再読み込みしてください。</p>
        ) : activeNotes.length === 0 ? (
          <div className="notes-empty">
            <div>✎</div>
            <h3>
              {page === 'champions'
                ? 'このチャンピオンの知識を記録しよう。'
                : 'この対面の、最初の気づきを。'}
            </h3>
            <p>
              {page === 'champions'
                ? 'コンボ、スキルの使い方、ビルド、得意な時間帯。'
                : 'レーン戦のコツ、トレードのタイミング、気をつけたいスキル。'}
              <br />
              次の試合で思い出したいことを書いてみよう。
            </p>
          </div>
        ) : (
          activeNotes.map((note) => (
            <article
              className={`note-card ${editing?.id === note.id ? 'editing' : ''}`}
              key={note.id}
            >
              <div className="note-meta">
                <span className="category-badge">{note.category}</span>
                <time dateTime={note.updatedAt}>
                  {new Date(note.updatedAt).toLocaleDateString('ja-JP')}
                </time>
                <div className="note-actions">
                  <button
                    disabled={busy}
                    onClick={() => edit(note)}
                    aria-label={`メモ${note.id}を編集`}
                  >
                    編集
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => setDeleting(note.id)}
                    aria-label={`メモ${note.id}を削除`}
                  >
                    削除
                  </button>
                </div>
              </div>
              <p className="note-body">{note.body}</p>
              {deleting === note.id && (
                <div className="delete-confirm">
                  <span>このメモを削除しますか？</span>
                  <button disabled={busy} onClick={() => setDeleting(null)}>
                    キャンセル
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        () =>
                          page === 'champions'
                            ? window.notebook.deleteChampionNote({ championId, id: note.id })
                            : window.notebook.deleteNote({ key, id: note.id }),
                        'メモを削除しました',
                        editing?.id === note.id,
                      ).then(() => setDeleting(null))
                    }
                  >
                    削除する
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>
      <form
        className="note-editor"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready && body.trim())
            void mutate(
              () =>
                page === 'champions'
                  ? editing
                    ? window.notebook.updateChampionNote({
                        championId,
                        id: editing.id,
                        body,
                        category,
                      })
                    : window.notebook.addChampionNote({ championId, body, category })
                  : editing
                    ? window.notebook.updateNote({ key, id: editing.id, body, category })
                    : window.notebook.addNote({ key, body, category }),
              editing ? 'メモを更新しました' : 'メモを保存しました',
              true,
            )
        }}
      >
        <div className="editor-heading">
          <label htmlFor="note-body">{editing ? 'メモを編集' : '新しいメモ'}</label>
          <span>{body.length.toLocaleString()} / 10,000</span>
        </div>
        <textarea
          id="note-body"
          ref={editor}
          value={body}
          disabled={!ready || busy}
          maxLength={10000}
          placeholder={
            page === 'champions'
              ? '例：基本コンボ、スキルの使い方、練習したい操作。'
              : '例：相手が主要スキルを使った後にトレードする。'
          }
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
        />
        <div className="editor-toolbar">
          <select
            aria-label="メモのカテゴリー"
            value={category}
            disabled={busy}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span className="shortcut">Ctrl + Enter で保存</span>
          {editing && (
            <button type="button" disabled={busy} onClick={() => navigate(() => {})}>
              キャンセル
            </button>
          )}
          <button className="primary" type="submit" disabled={!ready || busy || !body.trim()}>
            {busy ? '保存中…' : editing ? '変更を保存' : '＋ メモを保存'}
          </button>
        </div>
      </form>
    </section>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-symbol">
            M<span>·</span>
          </div>
          <div>
            MATCHUP<small>COMPANION</small>
          </div>
        </div>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="メインナビゲーション">
          <button
            className={page === 'notebook' ? 'active' : ''}
            onClick={() => navigate(() => setPage('notebook'))}
          >
            <span>▤</span>Match up<span className="nav-count">{summaries.length}</span>
          </button>
          <button
            className={page === 'champions' ? 'active' : ''}
            onClick={() =>
              navigate(() => {
                setPage('champions')
                setChampionDetailOpen(false)
              })
            }
          >
            <span>◈</span>Champions
          </button>
          <button
            className={page === 'settings' ? 'active' : ''}
            onClick={() => navigate(() => setPage('settings'))}
          >
            <span>⚙</span>Settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="connection-dot" />
          <div>
            Local notebook<small>League Clientなしで利用可能</small>
          </div>
          <span className="version">v0.1</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="muted">Workspace</span>
            <span className="slash">/</span>
            {page === 'notebook' ? 'Match up' : page === 'champions' ? 'Champions' : 'Settings'}
          </div>
          <span className="offline-badge">
            <span className="connection-dot" />
            OFFLINE READY
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow accent">THE PERSONAL PLAYBOOK</span>
              <h1>
                {page === 'notebook'
                  ? 'Match up'
                  : page === 'champions'
                    ? 'Champion Library'
                    : 'Settings'}
              </h1>
              <p>
                {page === 'notebook'
                  ? '対面の知識を、あなただけの強みに。'
                  : page === 'champions'
                    ? 'チャンピオン自身の知識と、対面ごとのメモ。'
                    : 'このNotebookについて。'}
              </p>
            </div>
            <span className="heading-tag">
              {page === 'notebook'
                ? `${summaries.reduce((n, s) => n + s.noteCount, 0)} NOTES SAVED`
                : `${champions.length} CHAMPIONS`}
            </span>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                onClick={() => {
                  void initialize()
                  setReload((n) => n + 1)
                  setKey({ ...key })
                }}
              >
                再読み込み
              </button>
            </div>
          )}
          {page === 'settings' ? (
            <section className="settings-panel panel">
              <h2>ローカルデータ</h2>
              <p>メモはこのPCのSQLiteデータベースへ保存されます。</p>
              <label>保存先</label>
              <code>{info?.databasePath ?? '読み込み中…'}</code>
              <label>Champion Data</label>
              <p>
                Data Dragon {info?.catalogVersion} · {champions.length} champions
              </p>
              <p>チャンピオン名とアイコンは同梱済みです。アプリの使用時に通信は行いません。</p>
              <hr />
              <h2>Phase 1 · Notebook</h2>
              <p>LCU連携・統計・クラウド同期は今後の実装予定です。</p>
              <p className="muted">
                LoL Matchup Companion is not endorsed by Riot Games. League of Legends and its
                assets are trademarks of Riot Games.
              </p>
            </section>
          ) : page === 'champions' && !championDetailOpen ? (
            <ChampionLibrary
              champions={champions}
              pool={pool}
              ready={poolReady}
              busy={busy}
              onOpen={(id) =>
                navigate(() => {
                  setChampionId(id)
                  setChampionDetailOpen(true)
                  setDetailRole('ALL')
                })
              }
              onSave={(entry) => void changePool(() => window.notebook.savePool(entry))}
              onRemove={(entry) => void changePool(() => window.notebook.removePool(entry))}
            />
          ) : page === 'champions' ? (
            <section className="champion-detail-page">
              <button
                className="back-to-library"
                disabled={busy}
                onClick={() => navigate(() => setChampionDetailOpen(false))}
              >
                ← チャンピオン一覧に戻る
              </button>
              <div className="champion-detail">
                {selectedChampion && (
                  <div className="champion-header panel">
                    <Portrait champion={selectedChampion} large />
                    <div>
                      <span className="eyebrow accent">CHAMPION KNOWLEDGE</span>
                      <h2>{selectedChampion.name}</h2>
                      <p>
                        {selectedChampion.nameJa} · {selectedChampion.title}
                      </p>
                    </div>
                  </div>
                )}
                {notesPanel}
                <section
                  className="champion-matchups panel"
                  aria-label="チャンピオンの対面メモ一覧"
                >
                  <div className="section-title">
                    <h2>Matchup Notes</h2>
                    <span className="count">{detailMatchups.length}</span>
                  </div>
                  <p className="muted">{selectedChampion?.name}で記録した対面ごとのメモ</p>
                  <div className="lane-tabs" role="group" aria-label="対面メモのレーン">
                    {(['ALL', ...ROLES] as const).map((lane) => (
                      <button
                        key={lane}
                        aria-pressed={detailRole === lane}
                        onClick={() => setDetailRole(lane)}
                      >
                        {lane === 'ALL' ? 'すべて' : lane}
                      </button>
                    ))}
                  </div>
                  {championLoading ? (
                    <p className="empty">読み込み中…</p>
                  ) : detailMatchups.length ? (
                    detailMatchups.map((m) => {
                      const opponent = byId.get(m.enemyChampionId)
                      return (
                        <article className="champion-matchup-card" key={m.id}>
                          <div className="section-title">
                            <div className="matchup-card-title">
                              {opponent && <Portrait champion={opponent} />}
                              <h3>vs {opponent?.name}</h3>
                              <span className="role-badge">{m.role}</span>
                            </div>
                            <button disabled={busy} onClick={() => choose(m)}>
                              対面ページを開く →
                            </button>
                          </div>
                          {m.notes.length ? (
                            m.notes.map((note) => (
                              <div className="matchup-note-preview" key={note.id}>
                                <span className="category-badge">{note.category}</span>
                                <p>{note.body}</p>
                              </div>
                            ))
                          ) : (
                            <p className="muted">まだ対面メモはありません。</p>
                          )}
                        </article>
                      )
                    })
                  ) : (
                    <p className="empty">選択したレーンの対面メモはまだありません。</p>
                  )}
                </section>
              </div>
            </section>
          ) : (
            <>
              <section className="selection-bar panel" aria-label="マッチアップ選択">
                <ChampionPicker
                  label="自分のチャンピオン"
                  selected={mine}
                  champions={champions}
                  disabled={busy}
                  onChange={(id) => choose({ ...key, myChampionId: id })}
                />
                <button
                  className="swap"
                  aria-label="自分と相手を入れ替え"
                  disabled={busy}
                  onClick={() =>
                    choose({
                      ...key,
                      myChampionId: key.enemyChampionId,
                      enemyChampionId: key.myChampionId,
                    })
                  }
                >
                  ⇄
                </button>
                <ChampionPicker
                  label="相手のチャンピオン"
                  selected={enemy}
                  champions={champions}
                  disabled={busy}
                  onChange={(id) => choose({ ...key, enemyChampionId: id })}
                />
                <div className="role-picker">
                  <label className="eyebrow" htmlFor="role">
                    ROLE
                  </label>
                  <select
                    id="role"
                    value={key.role}
                    disabled={busy}
                    onChange={(e) => choose({ ...key, role: e.target.value as MatchupKey['role'] })}
                  >
                    {ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </section>
              <div className="notebook-layout">
                <aside className="matchup-list panel">
                  <div className="section-title">
                    <h2>My Matchups</h2>
                    <span className="count">{summaries.length}</span>
                  </div>
                  <div className="list-search">
                    <span>⌕</span>
                    <input
                      aria-label="保存済みマッチアップを検索"
                      placeholder="Champion / Role"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <p className="list-label">RECENTLY UPDATED</p>
                  <select
                    className="recent-role-filter"
                    aria-label="最近更新した対面のレーン"
                    value={recentRole}
                    onChange={(e) => setRecentRole(e.target.value as Role | 'ALL')}
                  >
                    <option value="ALL">すべてのレーン</option>
                    {ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <div className="saved-list">
                    {filtered.map((s) => {
                      const a = byId.get(s.myChampionId),
                        b = byId.get(s.enemyChampionId)
                      return (
                        a &&
                        b && (
                          <button
                            key={s.id}
                            className={`saved-matchup ${sameKey(s, key) ? 'selected' : ''}`}
                            disabled={busy}
                            onClick={() =>
                              choose({
                                myChampionId: s.myChampionId,
                                enemyChampionId: s.enemyChampionId,
                                role: s.role,
                              })
                            }
                          >
                            <div
                              className="matchup-icon-pair"
                              aria-label={`${a.name} vs ${b.name}`}
                            >
                              <img
                                className="portrait"
                                src={`./champions/${a.slug}.png`}
                                alt={`自分: ${a.name}`}
                              />
                              <span>vs</span>
                              <img
                                className="portrait"
                                src={`./champions/${b.slug}.png`}
                                alt={`相手: ${b.name}`}
                              />
                            </div>
                            <div className="saved-matchup-text">
                              <strong>
                                {a.name}
                                <span> vs </span>
                                {b.name}
                              </strong>
                              <small>
                                {s.role}
                                <span>·</span>
                                {s.noteCount} notes
                              </small>
                            </div>
                          </button>
                        )
                      )
                    })}
                  </div>
                  {!filtered.length && (
                    <div className="list-empty">
                      <span>▤</span>
                      <p>
                        {summaries.length ? '該当する対面がありません。' : 'まだ記録がありません'}
                      </p>
                      <small>
                        {summaries.length
                          ? '別の名前で検索してください。'
                          : '最初のメモを保存すると、ここに対面が並びます。'}
                      </small>
                    </div>
                  )}
                  <div className="list-footer">あなたの経験が、ここに蓄積されます。</div>
                </aside>
                <section className="matchup-detail">
                  {mine && enemy && (
                    <div className="matchup-hero panel">
                      <div className="hero-top">
                        <span className="eyebrow">MATCHUP OVERVIEW</span>
                        <span className="role-badge">◇ {key.role}</span>
                      </div>
                      <div className="versus">
                        <div className="fighter">
                          <Portrait champion={mine} large />
                          <div>
                            <span className="eyebrow accent">YOUR PICK</span>
                            <h2>{mine.name}</h2>
                            <p>{mine.nameJa}</p>
                          </div>
                        </div>
                        <span className="vs">VS</span>
                        <div className="fighter enemy">
                          <div>
                            <span className="eyebrow">OPPONENT</span>
                            <h2>{enemy.name}</h2>
                            <p>{enemy.nameJa}</p>
                          </div>
                          <Portrait champion={enemy} large />
                        </div>
                      </div>
                      <div className="overview-controls">
                        <div>
                          <label htmlFor="difficulty">難易度</label>
                          <select
                            id="difficulty"
                            value={matchup?.difficulty ?? 'Unset'}
                            disabled={!ready || busy}
                            onChange={(e) =>
                              void mutate(
                                () =>
                                  window.notebook.saveOverview({
                                    key,
                                    overview: {
                                      difficulty: e.target.value as Matchup['difficulty'],
                                      rating: matchup?.rating ?? null,
                                    },
                                  }),
                                '評価を保存しました',
                              )
                            }
                          >
                            {Object.entries(difficultyLabel).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="rating">
                          <span>自分の評価</span>
                          <div role="group" aria-label="自分の評価">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                aria-label={`評価${n}`}
                                aria-pressed={(matchup?.rating ?? 0) === n}
                                disabled={!ready || busy}
                                className={n <= (matchup?.rating ?? 0) ? 'filled' : ''}
                                onClick={() =>
                                  void mutate(
                                    () =>
                                      window.notebook.saveOverview({
                                        key,
                                        overview: {
                                          difficulty: matchup?.difficulty ?? 'Unset',
                                          rating: matchup?.rating === n ? null : n,
                                        },
                                      }),
                                    '評価を保存しました',
                                  )
                                }
                              >
                                ★
                              </button>
                            ))}
                          </div>
                        </div>
                        <span className="personal-label">PERSONAL EXPERIENCE</span>
                      </div>
                    </div>
                  )}
                  {notesPanel}
                  <p className="detail-footer">
                    ノートは自分のチャンピオン・相手・Roleの組み合わせごとに保存されます。
                  </p>
                </section>
              </div>
            </>
          )}
        </main>
      </div>
      {pendingNavigation && (
        <div className="modal-backdrop">
          <div
            className="modal panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
          >
            <h2 id="unsaved-title">未保存のメモがあります</h2>
            <p>移動すると入力中の変更が失われます。</p>
            <div>
              <button autoFocus onClick={() => setPendingNavigation(null)}>
                編集を続ける
              </button>
              <button
                className="danger"
                onClick={() => {
                  const action = pendingNavigation
                  setPendingNavigation(null)
                  resetEditor()
                  action()
                }}
              >
                変更を破棄して移動
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
