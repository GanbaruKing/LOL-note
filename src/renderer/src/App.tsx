import { unwrap } from './apiResult'
import SettingsPage from './SettingsPage'
import { discardDraft, listDraftKeys, useDurableDraft } from './drafts'
import NoteContent, { ReviewDetails, ReviewTag } from './NoteContent'
import { splitReviewNote, joinReviewNote, type ReviewInfo } from '../../shared/reviewNote'
import LoadoutEditor, { type LoadoutEditorHandle } from './LoadoutEditor'
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
import ChampionPicker, { Portrait } from './ChampionPicker'
import {
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
  type SearchHit,
} from '../../shared/contracts'

const sameKey = (a: MatchupKey, b: MatchupKey) =>
  a.myChampionId === b.myChampionId && a.enemyChampionId === b.enemyChampionId && a.role === b.role
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
  const [detailQuery, setDetailQuery] = useState('')
  const [detailRole, setDetailRole] = useState<Role | 'ALL'>('ALL')
  const [championData, setChampionData] = useState<ChampionPage | null>(null)
  const [counterBody, setCounterBody] = useState('')
  const [counterStatus, setCounterStatus] = useState('')
  const [championLoading, setChampionLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const [protectionError, setProtectionError] = useState('')
  const [bookArticleId, setBookArticleId] = useState<string | undefined>()
  const [searchTarget, setSearchTarget] = useState<string | null>(null)
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
  const [verifiedPatch, setVerifiedPatch] = useState('')
  const [reviewInfo, setReviewInfo] = useState<ReviewInfo | null>(null)
  type NoteSnapshot = {
    body: string
    review: ReviewInfo | null
    category: Category
    start: number
    end: number
  }
  const noteUndo = useRef<NoteSnapshot[]>([])
  const noteRedo = useRef<NoteSnapshot[]>([])
  const [editing, setEditing] = useState<Note | null>(null),
    [deleting, setDeleting] = useState<number | null>(null)
  const [info, setInfo] = useState<{ databasePath: string; catalogVersion: string } | null>(null)
  const [pendingNoteEdit, setPendingNoteEdit] = useState<Note | null>(null)
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)
  const generation = useRef(0),
    editor = useRef<HTMLTextAreaElement>(null)
  const byId = new Map(champions.map((c) => [c.id, c]))
  const mine = byId.get(key.myChampionId),
    enemy = byId.get(key.enemyChampionId)
  const noteDirty = editing
    ? joinReviewNote(body, reviewInfo) !==
        joinReviewNote(splitReviewNote(editing).body, splitReviewNote(editing).review) ||
      category !== editing.category ||
      verifiedPatch !== (editing.verifiedPatch ?? '')
    : body.trim().length > 0 || reviewInfo !== null || verifiedPatch !== ''
  const counterDirty =
    page === 'champions' &&
    championDetailOpen &&
    championData?.championId === championId &&
    counterBody !== championData.counterStrategy
  const loadoutEditor = useRef<LoadoutEditorHandle>(null)
  const pageSaveInFlight = useRef(false)
  const [pageSaveStatus, setPageSaveStatus] = useState('')
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

  const draftKey =
    page === 'notebook'
      ? `note:${key.myChampionId}:${key.enemyChampionId}:${key.role}`
      : page === 'champions' && championDetailOpen
        ? `champion:${championId}`
        : ''
  const noteDraft = useDurableDraft(
    draftKey,
    {
      body,
      category,
      reviewInfo,
      verifiedPatch,
      editingId: editing?.id ?? null,
      editingUpdatedAt: editing?.updatedAt,
      editingBody: editing?.body,
      counterBody: counterDirty ? counterBody : undefined,
    },
    noteDirty || !!counterDirty,
    ready && !busy,
  )
  const [initialDrafts, setInitialDrafts] = useState(listDraftKeys)
  function openDraft(id: string) {
    const [scope, own, enemy, role] = id.split(':')
    navigate(() => {
      if (scope === 'champion') {
        setChampionId(Number(own))
        setChampionDetailOpen(true)
        setPage('champions')
      } else if (scope === 'book') setPage('book')
      else {
        setKey({ myChampionId: Number(own), enemyChampionId: Number(enemy), role: role as Role })
        setPage('notebook')
      }
      setInitialDrafts([])
    })
  }
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
    let active = true
    const refresh = async () => {
      try {
        const result = await window.notebook.getProtectionStatus()
        if (active) setProtectionError(result.ok ? result.data.error : result.error)
      } catch {
        if (active) setProtectionError('自動バックアップの状態を確認できませんでした。')
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 60000)
    return () => {
      active = false
      clearInterval(timer)
    }
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
    noteUndo.current = []
    noteRedo.current = []
    setEditing(null)
    setBody('')
    setCategory('General')
    setVerifiedPatch('')
    setReviewInfo(null)
    setDeleting(null)
  }
  function navigate(action: () => void) {
    if (busy || bookSaving || loadoutSaving) return
    if (dirty) setPendingNavigation(() => action)
    else {
      resetEditor()
      setPageSaveStatus('')
      setCounterBody(championData?.counterStrategy ?? '')
      action()
    }
  }
  function openSearchHit(hit: SearchHit) {
    navigate(() => {
      if (hit.scope === 'book') {
        setBookArticleId(hit.articleId)
        setPage('book')
        return
      }
      if (hit.key) {
        setKey(hit.key)
        setPage('notebook')
      } else {
        setChampionId(hit.championId)
        setDetailQuery('')
        setDetailRole('ALL')
        setChampionDetailOpen(true)
        setPage('champions')
      }
      setSearchTarget(
        hit.scope === 'counter'
          ? '#counter-body'
          : hit.scope === 'loadout'
            ? '.loadout-editor'
            : `[data-note-id="${hit.id}"]`,
      )
    })
  }
  useEffect(() => {
    if (!searchTarget || !ready) return
    const timer = setTimeout(() => {
      const element = document.querySelector(searchTarget)
      if (!element) return
      element.querySelectorAll('details').forEach((d) => {
        d.open = true
      })
      element.scrollIntoView({ block: 'center' })
      setSearchTarget(null)
    }, 50)
    return () => clearTimeout(timer)
  }, [searchTarget, ready, page, matchup, championData])
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
  const pageSaveSupported = page === 'notebook' || (page === 'champions' && championDetailOpen)
  const pageDirty = noteDirty || counterDirty || (page === 'notebook' && loadoutDirty)
  async function savePage(): Promise<boolean> {
    if (
      !pageSaveSupported ||
      !!noteDraft.candidate ||
      !ready ||
      busy ||
      pendingNavigation ||
      pendingNoteEdit ||
      pageSaveInFlight.current
    )
      return false
    const loadout = page === 'notebook' ? loadoutEditor.current?.draft() : undefined
    if (!noteDirty && !counterDirty && !loadout) return true
    const note = noteDirty
      ? {
          ...(editing ? { id: editing.id } : {}),
          category,
          body: joinReviewNote(body, reviewInfo),
          verifiedPatch,
        }
      : undefined
    pageSaveInFlight.current = true
    setBusy(true)
    setError('')
    setPageSaveStatus('')
    try {
      const result = await unwrap(
        window.notebook.savePage(
          page === 'notebook'
            ? { scope: 'matchup', key, note, loadout }
            : { scope: 'champion', championId, note, ...(counterDirty ? { counterBody } : {}) },
        ),
      )
      if (result.matchup) setMatchup(result.matchup)
      if (result.championPage) {
        setChampionData(result.championPage)
        setCounterBody(result.championPage.counterStrategy)
        setCounterStatus('保存済み')
      }
      if (result.loadout) loadoutEditor.current?.saved(result.loadout)
      noteDraft.clear()
      setInitialDrafts(listDraftKeys())
      if (note) resetEditor()
      setLoadoutDirty(false)
      setPageSaveStatus('ページの変更を保存しました')
      setStatus('ページの変更を保存しました')
      // Refresh failure must not make an already-committed note look unsaved.
      try {
        setSummaries(await unwrap(window.notebook.listMatchups()))
      } catch {
        /* Saved content is already reflected above. */
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ページを保存できませんでした。')
      setPageSaveStatus('保存できませんでした。入力は保持されています。')
      return false
    } finally {
      setBusy(false)
      pageSaveInFlight.current = false
    }
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        pageSaveSupported &&
        !event.isComposing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 's'
      ) {
        event.preventDefault()
        void savePage()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  function startNoteEdit(note: Note) {
    noteUndo.current = []
    noteRedo.current = []
    setDeleting(null)
    setEditing(note)
    const draft = splitReviewNote(note)
    setBody(draft.body)
    setReviewInfo(draft.review)
    setCategory(note.category)
    setVerifiedPatch(note.verifiedPatch ?? '')
    setTimeout(() => editor.current?.focus({ preventScroll: true }), 0)
  }
  function edit(note: Note) {
    if (busy || editing?.id === note.id) return
    if (noteDirty) setPendingNoteEdit(note)
    else startNoteEdit(note)
  }
  function noteSnapshot(): NoteSnapshot {
    return {
      body,
      review: reviewInfo,
      category,
      start: editor.current?.selectionStart ?? 0,
      end: editor.current?.selectionEnd ?? 0,
    }
  }
  function rememberNoteChange() {
    noteUndo.current.push(noteSnapshot())
    if (noteUndo.current.length > 100) noteUndo.current.shift()
    noteRedo.current = []
  }
  function undoNote(redo = false) {
    const source = redo ? noteRedo : noteUndo
    const target = redo ? noteUndo : noteRedo
    const snapshot = source.current.pop()
    if (!snapshot) return
    target.current.push(noteSnapshot())
    setBody(snapshot.body)
    setReviewInfo(snapshot.review)
    setCategory(snapshot.category)
    requestAnimationFrame(() => editor.current?.setSelectionRange(snapshot.start, snapshot.end))
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
  const detailMatchups = (championData?.matchups ?? [])
    .filter((m) => {
      if (!m.notes.length || (detailRole !== 'ALL' && m.role !== detailRole)) return false
      const opponent = byId.get(m.enemyChampionId)
      const haystack = normalizeChampionSearch(
        `${opponent?.name ?? ''} ${opponent?.nameJa ?? ''} ${opponent?.slug ?? ''} ${m.notes.map((n) => splitReviewNote(n).body).join(' ')}`,
      )
      return detailQuery
        .trim()
        .split(/\s+/)
        .every((word) => haystack.includes(normalizeChampionSearch(word)))
    })
    .sort(
      (a, b) =>
        (byId.get(a.enemyChampionId)?.name ?? '').localeCompare(
          byId.get(b.enemyChampionId)?.name ?? '',
          'en',
        ) || ROLES.indexOf(a.role) - ROLES.indexOf(b.role),
    )

  const noteEditor = (
    <form
      className="note-editor"
      onSubmit={(e) => {
        e.preventDefault()
        void savePage()
      }}
    >
      <div className="editor-heading">
        <label htmlFor="note-body">{editing ? 'メモを編集' : '新しいメモ'}</label>
        <span>{body.length.toLocaleString()} / 10,000</span>
      </div>
      {category === '振り返り' && <span className="category-badge">振り返り</span>}
      {reviewInfo && <ReviewDetails review={reviewInfo} />}
      <label className="patch-field">
        確認パッチ（任意）
        <input
          aria-label="確認パッチ"
          placeholder="例：16.18"
          maxLength={8}
          value={verifiedPatch}
          disabled={!ready || busy || !!noteDraft.candidate}
          onChange={(e) => setVerifiedPatch(e.target.value)}
        />
      </label>
      <textarea
        id="note-body"
        ref={editor}
        value={body}
        disabled={!ready || busy || !!noteDraft.candidate}
        maxLength={10000 - joinReviewNote('', reviewInfo).length}
        placeholder={
          page === 'champions'
            ? '例：基本コンボ、スキルの使い方、練習したい操作。'
            : '例：相手が主要スキルを使った後にトレードする。'
        }
        onChange={(e) => {
          rememberNoteChange()
          setBody(e.target.value)
        }}
        onKeyDown={(e) => {
          if (
            !e.nativeEvent.isComposing &&
            (e.ctrlKey || e.metaKey) &&
            (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')
          ) {
            e.preventDefault()
            undoNote(e.shiftKey || e.key.toLowerCase() === 'y')
            return
          }
          if (
            !e.nativeEvent.isComposing &&
            e.key === 'Backspace' &&
            (reviewInfo || category === '振り返り') &&
            e.currentTarget.selectionStart === 0 &&
            e.currentTarget.selectionEnd === 0
          ) {
            e.preventDefault()
            rememberNoteChange()
            setReviewInfo(null)
            setCategory('General')
            return
          }
          if (!e.nativeEvent.isComposing && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.form?.requestSubmit()
          }
        }}
      />
      <div className="editor-toolbar">
        <span className="shortcut">Ctrl + Enter / Ctrl + S でページを保存</span>
        {(editing || body.length > 0 || category !== 'General') && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              noteDraft.clear()
              resetEditor()
              setStatus('メモ入力をキャンセルしました')
              setPageSaveStatus('')
            }}
          >
            キャンセル
          </button>
        )}
        <button className="primary" type="submit" disabled={!ready || busy || !body.trim()}>
          {busy ? '保存中…' : editing ? '変更を保存' : '＋ メモを保存'}
        </button>
      </div>
    </form>
  )

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
      {noteDraft.error && (
        <p role="alert" className="error-banner">
          {noteDraft.error}
        </p>
      )}
      {noteDraft.candidate && (
        <div className="recovery-banner" role="status">
          <p>このページに未保存の下書きがあります。</p>
          <button
            disabled={!ready || busy}
            onClick={() =>
              noteDraft.restore((draft) => {
                const target =
                  activeNotes?.find(
                    (n) =>
                      n.id === draft.editingId &&
                      n.updatedAt === draft.editingUpdatedAt &&
                      n.body === draft.editingBody,
                  ) ?? null
                setEditing(target)
                setBody(draft.body)
                setCategory(draft.category)
                setReviewInfo(draft.reviewInfo)
                setVerifiedPatch(draft.verifiedPatch ?? '')
                if (draft.counterBody !== undefined) setCounterBody(draft.counterBody)
                if (draft.editingId && !target)
                  setStatus(
                    '元のメモが変更または削除されているため、新しいメモとして復元しました。',
                  )
              })
            }
          >
            下書きを復元
          </button>
          <button onClick={noteDraft.clear}>下書きを破棄</button>
        </div>
      )}
      {status === 'メモを削除しました' && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const r = await unwrap(window.notebook.listTrash())
              const latest = r.find((t) =>
                page === 'champions'
                  ? t.scope === 'champion' && t.championId === championId
                  : t.key && sameKey(t.key, key),
              )
              if (!latest) throw new Error('復元対象が見つかりません。')
              await unwrap(window.notebook.restoreTrash(latest.id))
              if (page === 'champions')
                setChampionData(await unwrap(window.notebook.getChampionPage(championId)))
              else setMatchup(await unwrap(window.notebook.getMatchup(key)))
              setSummaries(await unwrap(window.notebook.listMatchups()))
              setStatus('メモを復元しました')
            } catch (e) {
              setError(e instanceof Error ? e.message : '復元できませんでした。')
            } finally {
              setBusy(false)
            }
          }}
        >
          削除を取り消す
        </button>
      )}
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
              data-note-id={note.id}
            >
              <div className="note-meta">
                <ReviewTag note={note} />
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
              {editing?.id === note.id ? noteEditor : <NoteContent note={note} />}
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
      {!editing && noteEditor}
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
            <span>◈</span>Library
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
            {(lcu.status === 'champ-select' || lcu.status === 'in-game') && (
              <span className="connection-dot" />
            )}
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
          <span className="version">v0.2</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="muted">Workspace</span>
            <span className="slash">/</span>
            {titles[page]}
          </div>
          {pageSaveSupported && (
            <div className="page-save" role="group" aria-label="ページの保存">
              <span role="status" aria-label="ページ保存状態">
                {busy || loadoutSaving
                  ? '保存中…'
                  : pageDirty
                    ? '未保存の変更があります'
                    : pageSaveStatus || '保存済み'}
              </span>
              <button
                className="primary"
                disabled={!ready || busy || loadoutSaving || !pageDirty}
                onClick={() => void savePage()}
              >
                ページの変更を保存
              </button>
            </div>
          )}
          <span className="offline-badge">
            <span className="connection-dot" />
            OFFLINE READY
          </span>
        </header>
        <main>
          <div className={`lcu-banner ${lcu.status}`} role="status">
            <span>{lcu.message}</span>
            {(lcu.status === 'champ-select' || lcu.status === 'in-game') && page !== 'select' && (
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
                      ? 'チャンピオン名・本文・レーンで探す。'
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
          {protectionError && (
            <p className="error-banner" role="alert">
              {protectionError}
            </p>
          )}
          {initialDrafts.length > 0 && (
            <div className="recovery-banner">
              <span>前回の未保存の下書きがあります。</span>
              {initialDrafts.map((id) => (
                <button key={id} onClick={() => openDraft(id)}>
                  {id.startsWith('book')
                    ? 'Notebook'
                    : (byId.get(Number(id.split(':')[1]))?.name ?? 'メモ')}
                  の下書きを開く
                </button>
              ))}
              <button onClick={() => setInitialDrafts([])}>閉じる</button>
            </div>
          )}
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
              initialArticleId={bookArticleId}
            />
          ) : page === 'history' ? (
            <MatchHistory
              champions={champions}
              onOpenExisting={openSearchHit}
              onOpen={(next, draft) =>
                navigate(() => {
                  setKey(next)
                  setPage('notebook')
                  setBody('')
                  setReviewInfo(draft)
                  setCategory('振り返り')
                  setTimeout(() => {
                    editor.current?.focus()
                    editor.current?.setSelectionRange(0, 0)
                  }, 0)
                })
              }
            />
          ) : page === 'search' ? (
            <NoteSearch champions={champions} onOpen={openSearchHit} />
          ) : page === 'select' ? (
            <ChampSelect
              key={lcu.sessionId ?? lcu.status}
              state={lcu}
              champions={champions}
              onOpen={choose}
            />
          ) : page === 'settings' ? (
            <SettingsPage
              champions={champions}
              info={info}
              lcu={lcu}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
              onRestored={async () => {
                await initialize()
                setKey({ ...key })
                setReload((n) => n + 1)
              }}
            />
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
                  setDetailQuery('')
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
                      void savePage()
                    }}
                  >
                    <div className="editor-heading">
                      <label htmlFor="counter-body">{selectedChampion?.name}対策の内容</label>
                      <span>{counterBody.length.toLocaleString()} / 10,000</span>
                    </div>
                    <textarea
                      id="counter-body"
                      value={championLoading ? '' : counterBody}
                      disabled={!ready || busy || !!noteDraft.candidate}
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
                        Ctrl + Enter でページを保存 · 空欄で保存すると対策を削除
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
                  <p className="muted">
                    {selectedChampion?.name}で記録した対面ごとのメモ · 相手の名前 A–Z順
                  </p>
                  <input
                    aria-label="対面メモを検索"
                    placeholder="相手のチャンピオン名・メモ本文で検索"
                    value={detailQuery}
                    maxLength={200}
                    onChange={(e) => setDetailQuery(e.target.value)}
                  />
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
                          {m.notes.map((note) => (
                            <div className="matchup-note-preview" key={note.id}>
                              <ReviewTag note={note} />
                              <NoteContent note={note} />
                            </div>
                          ))}
                        </article>
                      )
                    })
                  ) : (
                    <p className="empty">条件に一致する対面メモはありません。</p>
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
                    ref={loadoutEditor}
                    pageBusy={busy}
                    onSavePage={savePage}
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
      {pendingNoteEdit && (
        <div className="modal-backdrop">
          <div
            className="modal panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="note-switch-title"
          >
            <h2 id="note-switch-title">入力中のメモを破棄しますか？</h2>
            <p>メモの入力だけを破棄して、選んだメモを編集します。</p>
            <div>
              <button autoFocus onClick={() => setPendingNoteEdit(null)}>
                入力を続ける
              </button>
              <button
                className="danger"
                onClick={() => {
                  startNoteEdit(pendingNoteEdit)
                  setPendingNoteEdit(null)
                }}
              >
                メモを破棄して編集
              </button>
            </div>
          </div>
        </div>
      )}
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
                  if (page === 'book') discardDraft('book')
                  noteDraft.clear()
                  loadoutEditor.current?.discard()
                  const action = pendingNavigation
                  setBookDirty(false)
                  setLoadoutDirty(false)
                  setPageSaveStatus('')
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
