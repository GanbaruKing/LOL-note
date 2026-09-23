import { useEffect, useRef, useState } from 'react'
import type { KnowledgeBook as Book } from '../../shared/contracts'
import { emptyKnowledgeBook } from '../../shared/knowledge'
import './knowledge-book.css'

type Article = Book['articles'][number]

function ReadingPage({ body }: { body: string }) {
  return (
    <div className="book-prose">
      {body.split('\n').map((line, index) => {
        if (line.startsWith('### ')) return <h4 key={index}>{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={index}>{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={index}>{line.slice(2)}</h2>
        if (/^- \[[ x]\] /.test(line))
          return (
            <p className="book-check" key={index}>
              <span>{line[3] === 'x' ? '☑' : '☐'}</span>
              {line.slice(6)}
            </p>
          )
        if (line.startsWith('- '))
          return (
            <p className="book-bullet" key={index}>
              <span>•</span>
              {line.slice(2)}
            </p>
          )
        if (line.startsWith('> ')) return <blockquote key={index}>{line.slice(2)}</blockquote>
        return line ? <p key={index}>{line}</p> : <div className="book-paragraph-gap" key={index} />
      })}
    </div>
  )
}

export default function KnowledgeBook({
  onDirtyChange,
  onSavingChange,
  paused,
}: {
  onDirtyChange: (dirty: boolean) => void
  onSavingChange: (saving: boolean) => void
  paused: boolean
}) {
  const [book, setBook] = useState<Book>(emptyKnowledgeBook)
  const [saved, setSaved] = useState('')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [chapter, setChapter] = useState('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(true)
  const [chapterDraft, setChapterDraft] = useState('')
  const [chapterEditor, setChapterEditor] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<'article' | 'chapter' | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const serialized = JSON.stringify(book)
  const dirty = ready && serialized !== saved
  const article = book.articles.find((a) => a.id === activeId)
  const activeChapter = book.chapters.find((c) => c.id === chapter)
  const filtered = book.articles.filter(
    (a) =>
      (chapter === 'all' ||
        (chapter === 'favorites'
          ? a.favorite
          : chapter === 'unfiled'
            ? a.chapterId === null
            : a.chapterId === chapter)) &&
      `${a.title} ${a.body}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  async function load() {
    setError('')
    try {
      const result = await window.notebook.getKnowledgeBook()
      if (!mounted.current) return
      if (!result.ok) throw new Error(result.error)
      setBook(result.data)
      setSaved(JSON.stringify(result.data))
      setReady(true)
      setActiveId(result.data.articles[0]?.id ?? null)
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : '読み込めませんでした。')
    }
  }
  useEffect(() => {
    mounted.current = true
    void load()
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  async function save() {
    if (inFlight.current || !ready || !dirty) return
    const snapshot = serialized
    inFlight.current = true
    setSaving(true)
    onSavingChange(true)
    setError('')
    try {
      const result = await window.notebook.saveKnowledgeBook(JSON.parse(snapshot))
      if (!result.ok) throw new Error(result.error)
      if (mounted.current) setSaved(snapshot)
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : '保存できませんでした。')
    } finally {
      inFlight.current = false
      if (mounted.current) setSaving(false)
      onSavingChange(false)
    }
  }
  useEffect(() => {
    if (!dirty || saving || error || paused) return
    const timer = setTimeout(() => void save(), 900)
    return () => clearTimeout(timer)
    // A save captures the current document. Edits made during that save get a new timer.
  }, [serialized, saved, saving, ready, error, paused])

  function update(next: Book) {
    onDirtyChange(true)
    setBook(next)
    setError('')
  }
  function patchArticle(patch: Partial<Article>) {
    if (!article) return
    update({
      ...book,
      articles: book.articles.map((a) =>
        a.id === article.id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a,
      ),
    })
  }
  function newArticle() {
    if (book.articles.length >= 500) {
      setError('記事は500件まで作成できます。')
      return
    }
    const id = crypto.randomUUID()
    update({
      ...book,
      articles: [
        ...book.articles,
        {
          id,
          title: '無題の記事',
          body: '',
          chapterId: activeChapter?.id ?? null,
          favorite: chapter === 'favorites',
          updatedAt: new Date().toISOString(),
        },
      ],
    })
    setActiveId(id)
    setQuery('')
    setEditing(true)
  }
  function saveChapter() {
    if (!chapterDraft.trim()) return
    const id = chapterEditor === 'new' ? crypto.randomUUID() : chapterEditor!
    if (chapterEditor === 'new' && book.chapters.length >= 100) {
      setError('章は100件まで作成できます。')
      return
    }
    update({
      ...book,
      chapters:
        chapterEditor === 'new'
          ? [...book.chapters, { id, title: chapterDraft.trim() }]
          : book.chapters.map((c) => (c.id === id ? { ...c, title: chapterDraft.trim() } : c)),
    })
    setChapter(id)
    if (chapterEditor === 'new') setActiveId(null)
    setChapterEditor(null)
    setChapterDraft('')
  }
  function moveChapter(direction: number) {
    const chapters = [...book.chapters],
      index = chapters.findIndex((c) => c.id === chapter),
      to = index + direction
    if (index < 0 || to < 0 || to >= chapters.length) return
    ;[chapters[index], chapters[to]] = [chapters[to], chapters[index]]
    update({ ...book, chapters })
  }
  function moveArticle(direction: number) {
    const index = filtered.findIndex((a) => a.id === activeId),
      other = filtered[index + direction]
    if (!article || !other) return
    const articles = [...book.articles],
      a = articles.indexOf(article),
      b = articles.indexOf(other)
    ;[articles[a], articles[b]] = [articles[b], articles[a]]
    update({ ...book, articles })
  }
  function insert(prefix: string) {
    const input = bodyRef.current
    if (!input || !article) return
    const pos = input.selectionStart,
      start = article.body.lastIndexOf('\n', pos - 1) + 1
    const body = article.body.slice(0, start) + prefix + article.body.slice(start)
    if (body.length > 50000) return
    patchArticle({ body })
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(pos + prefix.length, pos + prefix.length)
    })
  }

  if (!ready)
    return (
      <section className="book-loading">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => void load()}>再読み込み</button>
          </>
        ) : (
          'Notebookを開いています…'
        )}
      </section>
    )
  return (
    <section className="knowledge-book" aria-label="Notebook">
      <header className="book-heading">
        <div>
          <h1>Notebook</h1>
        </div>
        <div className="book-save">
          <span role="status" aria-label="Notebook保存状態">
            {saving
              ? '保存中…'
              : error
                ? '未保存 · 再試行できます'
                : dirty
                  ? '変更を保存します…'
                  : 'すべて保存済み'}
          </span>
          <button disabled={!dirty || saving} onClick={() => void save()}>
            今すぐ保存
          </button>
        </div>
      </header>
      {error && (
        <p className="book-error" role="alert">
          {error} 入力はこの画面に残っています。
        </p>
      )}
      <div className="book-layout">
        <aside className="book-index">
          <div className="book-index-heading">
            <span>CONTENTS</span>
            <span>{book.articles.length} ARTICLES</span>
          </div>
          <input
            aria-label="Notebookを検索"
            placeholder="記事を検索…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setChapter('all')
            }}
          />
          <div className="book-chapters" aria-label="章の一覧">
            {[
              { id: 'all', title: 'すべての記事' },
              { id: 'favorites', title: 'お気に入り' },
              { id: 'unfiled', title: '未整理' },
              ...book.chapters,
            ].map((c, index) => (
              <button
                key={c.id}
                aria-pressed={chapter === c.id}
                onClick={() => {
                  setChapter(c.id)
                  setActiveId(
                    book.articles.find(
                      (a) =>
                        c.id === 'all' ||
                        (c.id === 'favorites'
                          ? a.favorite
                          : c.id === 'unfiled'
                            ? a.chapterId === null
                            : a.chapterId === c.id),
                    )?.id ?? null,
                  )
                  setQuery('')
                  setChapterEditor(null)
                  setDeleting(null)
                }}
              >
                <span className="chapter-number">
                  {index < 3 ? ['▤', '☆', '·'][index] : String(index - 2).padStart(2, '0')}
                </span>
                {c.title}
                <small>
                  {
                    book.articles.filter(
                      (a) =>
                        c.id === 'all' ||
                        (c.id === 'favorites'
                          ? a.favorite
                          : c.id === 'unfiled'
                            ? a.chapterId === null
                            : a.chapterId === c.id),
                    ).length
                  }
                </small>
              </button>
            ))}
          </div>
          <button
            className="book-add-chapter"
            onClick={() => {
              setChapterEditor('new')
              setChapterDraft('')
            }}
          >
            ＋ 章を作成
          </button>
          {chapterEditor && (
            <form
              className="book-chapter-form"
              onSubmit={(e) => {
                e.preventDefault()
                saveChapter()
              }}
            >
              <input
                autoFocus
                aria-label="章の名前"
                maxLength={100}
                value={chapterDraft}
                onChange={(e) => setChapterDraft(e.target.value)}
                placeholder="例：レーン戦の基礎"
              />
              <div>
                <button type="submit" disabled={!chapterDraft.trim()}>
                  決定
                </button>
                <button type="button" onClick={() => setChapterEditor(null)}>
                  キャンセル
                </button>
              </div>
            </form>
          )}
          {activeChapter && (
            <div className="book-chapter-tools">
              <button
                onClick={() => {
                  setChapterEditor(chapter)
                  setChapterDraft(activeChapter.title)
                }}
              >
                章名を変更
              </button>
              <button
                aria-label="章を上へ"
                disabled={book.chapters[0]?.id === chapter}
                onClick={() => moveChapter(-1)}
              >
                ↑
              </button>
              <button
                aria-label="章を下へ"
                disabled={book.chapters.at(-1)?.id === chapter}
                onClick={() => moveChapter(1)}
              >
                ↓
              </button>
              <button onClick={() => setDeleting('chapter')}>章を削除</button>
            </div>
          )}
          <div className="book-article-heading">
            <h2>
              {query
                ? '検索結果'
                : (activeChapter?.title ??
                  (chapter === 'favorites'
                    ? 'お気に入り'
                    : chapter === 'unfiled'
                      ? '未整理'
                      : 'すべての記事'))}
            </h2>
            <button className="book-primary-button" onClick={newArticle}>
              ＋ 記事
            </button>
          </div>
          <div className="book-articles">
            {filtered.map((a) => (
              <button
                key={a.id}
                aria-label={`${a.title}を開く`}
                aria-pressed={a.id === activeId}
                onClick={() => {
                  setActiveId(a.id)
                  setDeleting(null)
                }}
              >
                <strong>
                  {a.favorite ? '☆ ' : ''}
                  {a.title}
                </strong>
                <small>
                  {a.body
                    .replace(/[#>[\]-]/g, '')
                    .trim()
                    .slice(0, 60) || 'まだ本文がありません'}
                </small>
              </button>
            ))}
            {!filtered.length && (
              <p className="book-list-empty">
                {query ? '一致する記事はありません。' : '記事を追加して、知識をまとめましょう。'}
              </p>
            )}
          </div>
        </aside>
        <article className="book-paper">
          {article ? (
            <>
              <div className="book-paper-top">
                <span>
                  {book.chapters.find((c) => c.id === article.chapterId)?.title ?? '未整理'} / NOTE
                </span>
                <div>
                  <button aria-pressed={!editing} onClick={() => setEditing(false)}>
                    読む
                  </button>
                  <button aria-pressed={editing} onClick={() => setEditing(true)}>
                    編集
                  </button>
                </div>
              </div>
              {editing ? (
                <input
                  className="book-title"
                  aria-label="記事のタイトル"
                  maxLength={100}
                  value={article.title}
                  onChange={(e) => patchArticle({ title: e.target.value })}
                  onBlur={() => {
                    if (!article.title.trim()) patchArticle({ title: '無題の記事' })
                  }}
                />
              ) : (
                <h2 className="book-title">{article.title}</h2>
              )}
              <div className="book-article-meta">
                <label>
                  章
                  <select
                    aria-label="記事の章"
                    value={article.chapterId ?? ''}
                    onChange={(e) => patchArticle({ chapterId: e.target.value || null })}
                  >
                    <option value="">未整理</option>
                    {book.chapters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  aria-pressed={article.favorite}
                  onClick={() => patchArticle({ favorite: !article.favorite })}
                >
                  {article.favorite ? '★ お気に入り' : '☆ お気に入り'}
                </button>
                <span>{new Date(article.updatedAt).toLocaleDateString('ja-JP')} 更新</span>
              </div>
              {editing ? (
                <>
                  <div className="book-format" role="group" aria-label="本文の書式">
                    <button onClick={() => insert('## ')}>見出し</button>
                    <button onClick={() => insert('- ')}>箇条書き</button>
                    <button onClick={() => insert('- [ ] ')}>チェックリスト</button>
                    <button onClick={() => insert('> ')}>要点</button>
                    <span>「読む」で仕上がりを確認</span>
                  </div>
                  <textarea
                    ref={bodyRef}
                    aria-label="記事の本文"
                    className="book-body"
                    maxLength={50000}
                    value={article.body}
                    placeholder={
                      '## 大切なこと\n学んだことや判断の基準を書き留めましょう。\n\n- 覚えておきたいポイント\n- [ ] 次の試合で意識すること'
                    }
                    onChange={(e) => patchArticle({ body: e.target.value })}
                    onKeyDown={(e) => {
                      if (
                        !e.nativeEvent.isComposing &&
                        (e.ctrlKey || e.metaKey) &&
                        e.key === 'Enter'
                      ) {
                        e.preventDefault()
                        void save()
                      }
                    }}
                  />
                </>
              ) : article.body ? (
                <ReadingPage body={article.body} />
              ) : (
                <p className="book-list-empty">
                  まだ本文がありません。「編集」から書き始めましょう。
                </p>
              )}
              <footer className="book-paper-footer">
                <span>{article.body.length.toLocaleString()} / 50,000文字</span>
                <div>
                  <button
                    aria-label="記事を上へ"
                    disabled={filtered.findIndex((a) => a.id === activeId) <= 0}
                    onClick={() => moveArticle(-1)}
                  >
                    ↑
                  </button>
                  <button
                    aria-label="記事を下へ"
                    disabled={
                      filtered.findIndex((a) => a.id === activeId) < 0 ||
                      filtered.at(-1)?.id === activeId
                    }
                    onClick={() => moveArticle(1)}
                  >
                    ↓
                  </button>
                  <button onClick={() => setDeleting('article')}>記事を削除</button>
                </div>
              </footer>
            </>
          ) : (
            <div className="book-welcome">
              <span className="book-kicker">A PLACE FOR YOUR KNOWLEDGE</span>
              <div className="book-monogram">N</div>
              <h2>自分だけの、LoLの教科書。</h2>
              <p>
                ウェーブ管理、視界、マクロ、試合での気づき。
                <br />
                チャンピオンに縛られず、一つずつ知識を残しましょう。
              </p>
              <button className="book-primary-button" onClick={newArticle}>
                最初の記事を書く
              </button>
              <p className="book-welcome-hint">「章を作成」で整理。迷ったら未整理のままでも。</p>
            </div>
          )}
        </article>
      </div>
      {deleting && (
        <div className="modal-backdrop">
          <section
            className="book-delete"
            role="alertdialog"
            aria-modal="true"
            aria-label="Notebookの削除確認"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setDeleting(null)
              }
              if (e.key === 'Tab') {
                const buttons = e.currentTarget.querySelectorAll('button')
                if (e.shiftKey && document.activeElement === buttons[0]) {
                  e.preventDefault()
                  buttons[buttons.length - 1]?.focus()
                } else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
                  e.preventDefault()
                  buttons[0]?.focus()
                }
              }
            }}
          >
            <h2>
              {deleting === 'chapter' ? 'この章を削除しますか？' : 'この記事を削除しますか？'}
            </h2>
            <p>
              {deleting === 'chapter'
                ? '章の中の記事は「未整理」に移ります。'
                : '記事の本文も削除されます。'}
            </p>
            <button autoFocus onClick={() => setDeleting(null)}>
              キャンセル
            </button>
            <button
              className="book-primary-button"
              onClick={() => {
                if (deleting === 'chapter') {
                  update({
                    chapters: book.chapters.filter((c) => c.id !== chapter),
                    articles: book.articles.map((a) =>
                      a.chapterId === chapter ? { ...a, chapterId: null } : a,
                    ),
                  })
                  setChapter('unfiled')
                } else {
                  update({ ...book, articles: book.articles.filter((a) => a.id !== activeId) })
                  setActiveId(null)
                }
                setDeleting(null)
              }}
            >
              削除する
            </button>
          </section>
        </div>
      )}
    </section>
  )
}
