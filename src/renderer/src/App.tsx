import LoadoutEditor from './LoadoutEditor'
import { useEffect, useRef, useState } from 'react'
import ChampionLibrary from './ChampionLibrary'
import MyPicks from './MyPicks'
import MatchupPool from './MatchupPool'
import NoteSearch from './NoteSearch'
import ChampSelect from './ChampSelect'
import MatchHistory from './MatchHistory'
import EnemyCounter from './EnemyCounter'
import CuratedCounters from './CuratedCounters'
import KnowledgeBook from './KnowledgeBook'
import SkillCooldowns from './SkillCooldowns'
import { normalizeChampionSearch } from './championSearch'
import laneData from '../../../resources/champion-lanes.json'
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
  type LcuState,
} from '../../shared/contracts'

async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new Error(result.error)
  return result.data
}
const sameKey = (a: MatchupKey, b: MatchupKey) =>
  a.myChampionId === b.myChampionId && a.enemyChampionId === b.enemyChampionId && a.role === b.role
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
  const trigger = useRef<HTMLButtonElement>(null)
  const [active, setActive] = useState(0)
  const [laneFilter, setLaneFilter] = useState<Role | 'ALL'>('ALL')
  const lanesById: Record<string, string[]> = laneData.lanes
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  const filtered = champions.filter(
    (c) =>
      (laneFilter === 'ALL' || lanesById[c.id]?.includes(laneFilter)) &&
      normalizeChampionSearch(`${c.name} ${c.nameJa} ${c.slug}`).includes(
        normalizeChampionSearch(query),
      ),
  )
  return (
    <div
      className="picker"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <span className="eyebrow">{label}</span>
      <button
        className="picker-button"
        ref={trigger}
        disabled={disabled}
        aria-label={`${label}を選択`}
        aria-expanded={open}
        onClick={() => {
          setQuery('')
          setActive(0)
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
          <div className="picker-lanes" role="group" aria-label={`${label}のレーン絞り込み`}>
            {(['ALL', ...ROLES] as const).map((lane) => (
              <button
                key={lane}
                type="button"
                aria-pressed={laneFilter === lane}
                onClick={() => {
                  setLaneFilter(lane)
                  setActive(0)
                  root.current?.querySelector('input')?.focus()
                  root.current?.querySelector('.picker-results')?.scrollTo(0, 0)
                }}
              >
                {lane === 'ALL' ? 'All' : lane}
              </button>
            ))}
          </div>
          <input
            autoFocus
            aria-label={`${label}を検索`}
            placeholder="日本語・英語で検索…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const next = Math.max(
                  0,
                  Math.min(filtered.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)),
                )
                setActive(next)
                const candidate = root.current
                  ?.querySelectorAll('.picker-results button')
                  .item(next)
                candidate?.scrollIntoView({ block: 'nearest' })
              }
              if (e.key === 'Enter' && filtered[active]) {
                e.preventDefault()
                onChange(filtered[active].id)
                setOpen(false)
                trigger.current?.focus()
              }
            }}
          />
          <p className="picker-help" role="status">
            {filtered[active]?.name ?? '候補なし'} · ↑ ↓ で選択 · Enterで決定
          </p>
          <div className="picker-results">
            {filtered.map((c, index) => (
              <button
                key={c.id}
                className={active === index ? 'keyboard-active' : ''}
                onClick={() => {
                  onChange(c.id)
                  setOpen(false)
                  trigger.current?.focus()
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
  const [libraryView, setLibraryView] = useState<{
    role: Role
    query: string
    laneFilter: Role | 'ALL'
  }>({ role: 'TOP', query: '', laneFilter: 'ALL' })
  const libraryScroll = useRef(0)
  const [detailRole, setDetailRole] = useState<Role | 'ALL'>('ALL')
  const [championData, setChampionData] = useState<ChampionPage | null>(null)
  const [counterBody, setCounterBody] = useState('')
  const [counterStatus, setCounterStatus] = useState('')
  const [championLoading, setChampionLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const [backupStatus, setBackupStatus] = useState('')
  const [bookDirty, setBookDirty] = useState(false)
  const [bookSaving, setBookSaving] = useState(false)
  const [page, setPage] = useState<
    'notebook' | 'champions' | 'settings' | 'search' | 'select' | 'history' | 'book'
  >('notebook')
  const [lcu, setLcu] = useState<LcuState>({
    status: 'disconnected',
    phase: null,
    sessionId: null,
    role: null,
    ownChampionId: null,
    enemyChampionIds: [],
    message: 'League Clientを確認中…',
  })
  const titles = {
    book: 'Notebook',
    notebook: 'Match up',
    champions: 'Champion Library',
    settings: 'Settings',
    search: 'Search Notes',
    select: 'Champ Select',
    history: 'Match History',
  }
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
  const noteDirty = editing
    ? body !== editing.body || category !== editing.category
    : body.trim().length > 0
  const counterDirty =
    page === 'champions' &&
    championDetailOpen &&
    championData?.championId === championId &&
    counterBody !== championData.counterStrategy
  const [loadoutDirty, setLoadoutDirty] = useState(false)
  const [loadoutSaving, setLoadoutSaving] = useState(false)
  const [loadoutEpoch, setLoadoutEpoch] = useState(0)
  const dirty = noteDirty || counterDirty || bookDirty || loadoutDirty
  const selectedChampion = byId.get(championId)
  const activeNotes = page === 'champions' ? championData?.notes : matchup?.notes
  const activeLoading = page === 'champions' ? championLoading : loading
  const ready =
    page === 'champions'
      ? !championLoading && championData?.championId === championId
      : !loading && !!matchup && sameKey(key, matchup)

  useEffect(() => {
    window.scrollTo(0, page === 'champions' && !championDetailOpen ? libraryScroll.current : 0)
  }, [page, championDetailOpen, championId])

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
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const r = await window.notebook.getLcuState()
        if (!cancelled && r.ok) setLcu(r.data)
      } catch {
        if (!cancelled)
          setLcu({
            status: 'error',
            phase: null,
            sessionId: null,
            role: null,
            ownChampionId: null,
            enemyChampionIds: [],
            message: '接続状態を取得できません。',
          })
      }
      if (!cancelled) timer = setTimeout(poll, 2000)
    }
    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
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
    setCounterStatus('')
    setError('')
    setStatus('')
    unwrap(window.notebook.getChampionPage(championId))
      .then((data) => {
        if (!cancelled) {
          setChampionData(data)
          setCounterBody(data.counterStrategy)
        }
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
      if (dirty || busy || bookSaving || loadoutSaving) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty, busy, bookSaving, loadoutSaving])

  function resetEditor() {
    setEditing(null)
    setBody('')
    setCategory('General')
    setDeleting(null)
  }
  function navigate(action: () => void) {
    if (busy || bookSaving || loadoutSaving) return
    if (dirty) setPendingNavigation(() => action)
    else {
      resetEditor()
      setCounterBody(championData?.counterStrategy ?? '')
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
  async function addComfortPick() {
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      await unwrap(window.notebook.saveMyPick(key))
      setSummaries(await unwrap(window.notebook.listMatchups()))
      setStatus('Comfort Picksに追加しました')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function saveCounter() {
    if (!ready || busy || !counterDirty) return
    setBusy(true)
    setError('')
    setCounterStatus('')
    try {
      const data = await unwrap(
        window.notebook.saveChampionCounter({ championId, body: counterBody }),
      )
      setChampionData(data)
      setCounterBody(data.counterStrategy)
      setCounterStatus('対策を保存しました')
    } catch (e) {
      setCounterStatus(e instanceof Error ? e.message : '対策を保存できませんでした。')
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

  const notesPanel = (
    <section className="notes-panel panel" id="personal-notes">
      <div className="section-title">
        <div className="notes-title">
          <h2>
            {page === 'champions'
              ? 'Champion Notes'
              : `${mine?.name ?? ''}で${enemy?.name ?? ''}と戦うメモ`}
          </h2>
          <span className="count">{activeNotes?.length ?? 0}</span>
        </div>
        <span className="save-status" role="status">
          {busy ? '保存中…' : noteDirty ? '未保存の変更があります' : status || 'この端末に保存'}
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
            <h3>メモを追加しよう！</h3>
            <p>下の入力欄から、メモを追加していこう！</p>
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
                    aria-label={`メモ${note.id}をPin`}
                    aria-pressed={!!note.pinned}
                    onClick={() =>
                      void mutate(
                        async () => {
                          const result = await window.notebook.pinNote({
                            scope: page === 'champions' ? 'champion' : 'matchup',
                            id: note.id,
                            pinned: !note.pinned,
                          })
                          if (!result.ok) return result
                          return page === 'champions'
                            ? window.notebook.getChampionPage(championId)
                            : window.notebook.getMatchup(key)
                        },
                        note.pinned ? 'Pinを解除しました' : '重要メモをPinしました',
                      )
                    }
                  >
                    {note.pinned ? '★ Pinned' : '☆ Pin'}
                  </button>
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
            if (!e.nativeEvent.isComposing && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
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
    <div className={`app-shell${page === 'book' ? ' book-view' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-symbol" src="./icon.png" alt="RiftNote" />
          <div>RiftNote</div>
        </div>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="メインナビゲーション">
          <button
            className={page === 'search' ? 'active' : ''}
            onClick={() => navigate(() => setPage('search'))}
          >
            <span>⌕</span>Search
          </button>
          <button
            className={page === 'book' ? 'active' : ''}
            onClick={() => {
              if (page !== 'book') navigate(() => setPage('book'))
            }}
          >
            <span>▥</span>Notebook
          </button>
          <button
            className={page === 'notebook' ? 'active' : ''}
            onClick={() => navigate(() => setPage('notebook'))}
          >
            <span>▤</span>Match up
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
            className={page === 'history' ? 'active' : ''}
            onClick={() => navigate(() => setPage('history'))}
          >
            <span>◷</span>Match History
          </button>
          <button
            className={page === 'select' ? 'active' : ''}
            onClick={() => navigate(() => setPage('select'))}
          >
            <span>◇</span>Champ Select
            {lcu.status === 'champ-select' && <span className="connection-dot" />}
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
            {titles[page]}
          </div>
          <span className="offline-badge">
            <span className="connection-dot" />
            OFFLINE READY
          </span>
        </header>
        <main>
          <div className={`lcu-banner ${lcu.status}`} role="status">
            <span>{lcu.message}</span>
            {lcu.status === 'champ-select' && page !== 'select' && (
              <button onClick={() => navigate(() => setPage('select'))}>
                Champ Selectを開く →
              </button>
            )}
          </div>
          <div className="page-heading">
            <div>
              <h1>{titles[page]}</h1>
              {page !== 'select' && page !== 'champions' && (
                <p>
                  {page === 'notebook'
                    ? 'チャンピオン・対面・レーンごとのメモと評価を管理します。'
                    : page === 'search'
                      ? 'チャンピオン名・本文・レーン・カテゴリーで探す。'
                      : page === 'history'
                        ? '最近の試合から対面を選び、気づきをメモに残します。'
                        : 'このNotebookについて。'}
                </p>
              )}
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
          {page === 'book' ? (
            <KnowledgeBook
              onDirtyChange={setBookDirty}
              onSavingChange={setBookSaving}
              paused={!!pendingNavigation}
            />
          ) : page === 'history' ? (
            <MatchHistory
              champions={champions}
              onOpen={(next, draft) =>
                navigate(() => {
                  setKey(next)
                  setPage('notebook')
                  setBody(draft)
                  setCategory('振り返り')
                  setTimeout(() => {
                    editor.current?.focus()
                    editor.current?.setSelectionRange(draft.length, draft.length)
                  }, 0)
                })
              }
            />
          ) : page === 'search' ? (
            <NoteSearch
              champions={champions}
              onOpen={(hit) =>
                hit.key
                  ? choose(hit.key)
                  : navigate(() => {
                      setChampionId(hit.championId)
                      setChampionDetailOpen(true)
                      setPage('champions')
                    })
              }
            />
          ) : page === 'select' ? (
            <ChampSelect
              key={`${lcu.status}-${lcu.sessionId}`}
              state={lcu}
              champions={champions}
              onOpen={choose}
            />
          ) : page === 'settings' ? (
            <section className="settings-panel panel">
              <h2>ローカルデータ</h2>
              <h3>バックアップ・復元</h3>
              <p>
                メモ・Notebookの章と記事・対策・評価・Favorite Champions・Comfort
                Picks・ビルド・ルーンをJSONに保存します。復元は現在の内容を置き換え、復元前のデータは自動退避します。
              </p>
              {(['exportBackup', 'restoreBackup'] as const).map((operation) => (
                <button
                  key={operation}
                  className="primary"
                  style={{ marginRight: 12, marginBottom: 8 }}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    setError('')
                    setBackupStatus('')
                    try {
                      const path = await unwrap(window.notebook[operation]())
                      if (path) {
                        if (operation === 'restoreBackup') {
                          await initialize()
                          setKey({ ...key })
                          setReload((value) => value + 1)
                        }
                        setBackupStatus(
                          operation === 'exportBackup'
                            ? `保存しました：${path}`
                            : `復元しました。復元前のバックアップ：${path}`,
                        )
                      }
                    } catch (e) {
                      setError((e as Error).message)
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  {operation === 'exportBackup' ? 'バックアップを保存' : 'バックアップから復元'}
                </button>
              ))}
              <p
                role="status"
                aria-label="バックアップ処理結果"
                style={{ overflowWrap: 'anywhere' }}
              >
                {busy ? '処理中…' : backupStatus}
              </p>
              <hr />
              <p>メモはこのPCのSQLiteデータベースへ保存されます。</p>
              <label>保存先</label>
              <code>{info?.databasePath ?? '読み込み中…'}</code>
              <label>Champion Data</label>
              <p>
                Data Dragon {info?.catalogVersion} · {champions.length} champions
              </p>
              <p>
                チャンピオン名とアイコンは同梱済みです。Notebookはインターネットなしで利用できます。
              </p>
              <h2>League Client連携</h2>
              <p>{lcu.message}</p>
              <p>
                自動接続できない場合はLeagueClient.exeがあるフォルダーを選択してください。クライアント起動中に生成されるlockfileを読み取ります。
              </p>
              <button
                className="primary"
                onClick={async () => {
                  try {
                    const r = await window.notebook.selectLeagueFolder()
                    if (!r.ok) setError(r.error)
                  } catch {
                    setError('フォルダーを選択できませんでした。')
                  }
                }}
              >
                Leagueのフォルダーを選択
              </button>
              <hr />
              <h2>Match History</h2>
              <p>
                League
                Clientへログインすると、最近の試合から対面メモを書けます。保存したメモはオフラインでも読めます。クラウド同期はありません。
              </p>
              <p className="muted">
                RiftNote is not endorsed by Riot Games. League of Legends and its assets are
                trademarks of Riot Games.
              </p>
            </section>
          ) : page === 'champions' && !championDetailOpen ? (
            <ChampionLibrary
              champions={champions}
              view={libraryView}
              onViewChange={setLibraryView}
              pool={pool}
              ready={poolReady}
              busy={busy}
              onOpen={(id) =>
                navigate(() => {
                  libraryScroll.current = window.scrollY
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
                <section className="counter-editor panel" aria-label="チャンピオン対策の編集">
                  <div className="section-title">
                    <h2>{selectedChampion?.name}対策</h2>
                    <span className="save-status" role="status">
                      {counterStatus}
                    </span>
                  </div>
                  <p className="muted">
                    {selectedChampion?.name}を敵にしたときの対策。Match
                    upでこのチャンピオンが相手になると表示します。
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      void saveCounter()
                    }}
                  >
                    <div className="editor-heading">
                      <label htmlFor="counter-body">{selectedChampion?.name}対策の内容</label>
                      <span>{counterBody.length.toLocaleString()} / 10,000</span>
                    </div>
                    <textarea
                      id="counter-body"
                      value={championLoading ? '' : counterBody}
                      disabled={!ready || busy}
                      maxLength={10000}
                      placeholder="例：主要スキルを使った後に近づく。パッシブが溜まっている間は戦わない。"
                      onChange={(e) => {
                        setCounterBody(e.target.value)
                        setCounterStatus('')
                      }}
                      onKeyDown={(e) => {
                        if (
                          !e.nativeEvent.isComposing &&
                          (e.ctrlKey || e.metaKey) &&
                          e.key === 'Enter'
                        ) {
                          e.preventDefault()
                          e.currentTarget.form?.requestSubmit()
                        }
                      }}
                    />
                    <div className="editor-toolbar">
                      <span className="shortcut">
                        Ctrl + Enter で保存 · 空欄で保存すると対策を削除
                      </span>
                      <button
                        className="primary"
                        type="submit"
                        disabled={!ready || busy || !counterDirty}
                      >
                        対策を保存
                      </button>
                    </div>
                  </form>
                </section>
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
                <aside className="matchup-picks">
                  <CuratedCounters
                    recommended
                    championId={key.enemyChampionId}
                    role={key.role}
                    busy={busy}
                    onSelect={(counterId, role) =>
                      choose({
                        myChampionId: counterId,
                        enemyChampionId: key.enemyChampionId,
                        role,
                      })
                    }
                  />
                  <MyPicks
                    key={`${key.enemyChampionId}-${key.role}`}
                    enemyChampionId={key.enemyChampionId}
                    role={key.role}
                    champions={champions}
                    refreshToken={summaries}
                    onSelect={choose}
                  />
                  <MatchupPool
                    champions={champions}
                    pool={pool}
                    role={key.role}
                    selectedId={key.myChampionId}
                    ready={poolReady}
                    busy={busy}
                    onSelect={(myChampionId) => choose({ ...key, myChampionId })}
                    onManage={() =>
                      navigate(() => {
                        setLibraryView((view) => ({ ...view, role: key.role }))
                        setPage('champions')
                        setChampionDetailOpen(false)
                      })
                    }
                  />
                </aside>
                <section className="matchup-detail">
                  {mine && enemy && (
                    <div className="matchup-hero panel">
                      <div className="hero-top">
                        <span className="eyebrow">対戦相手の対策</span>
                        <span className="role-badge">◇ {key.role}</span>
                      </div>
                      <div className="opponent-summary">
                        <div className="opponent-heading">
                          <Portrait champion={enemy} large />
                          <div>
                            <h2>
                              <span>vs</span> {enemy.name}
                            </h2>
                            <p>{enemy.nameJa}対策</p>
                          </div>
                        </div>
                        <SkillCooldowns champion={enemy} />
                      </div>
                      <div className="own-pick-context">
                        <span>使用チャンピオン</span>
                        <Portrait champion={mine} />
                        <strong>{mine.name}</strong>
                      </div>
                      <div className="overview-controls">
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
                        <button
                          className="primary comfort-pick-add"
                          disabled={!ready || busy}
                          onClick={() => void addComfortPick()}
                        >
                          Comfort Picksに追加
                        </button>
                      </div>
                    </div>
                  )}
                  <LoadoutEditor
                    key={`${key.myChampionId}-${key.enemyChampionId}-${key.role}-${loadoutEpoch}`}
                    matchupKey={key}
                    onDirty={setLoadoutDirty}
                    onSaving={setLoadoutSaving}
                  />
                  {enemy && (
                    <>
                      <EnemyCounter key={enemy.id} enemy={enemy} />
                    </>
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
                disabled={bookSaving || loadoutSaving}
                onClick={() => {
                  const action = pendingNavigation
                  setBookDirty(false)
                  setLoadoutDirty(false)
                  setLoadoutEpoch((v) => v + 1)
                  setPendingNavigation(null)
                  resetEditor()
                  setCounterBody(championData?.counterStrategy ?? '')
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
