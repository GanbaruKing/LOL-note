import { useDurableDraft } from './drafts'
import { ITEM_TIERS, itemTier, compareShopItems } from '../../shared/itemShop'
import itemCategories from '../../../resources/item-categories.json'
import { useEffect, useState, useImperativeHandle, type Ref } from 'react'
import data from '../../../resources/loadout.json'
import { emptyLoadout, shardRows, shardNames, type Loadout } from '../../shared/loadout'
import type { MatchupKey } from '../../shared/contracts'
import Collapsible from './Collapsible'

export interface LoadoutEditorHandle {
  discard: () => void
  draft: () => Loadout | undefined
  saved: (value: Loadout) => void
}
export default function LoadoutEditor({
  matchupKey,
  ref,
  pageBusy,
  onSavePage,
  onDirty,
  onSaving,
}: {
  matchupKey: MatchupKey
  ref: Ref<LoadoutEditorHandle>
  pageBusy: boolean
  onSavePage: () => Promise<boolean>
  onDirty: (dirty: boolean) => void
  onSaving: (saving: boolean) => void
}) {
  const [value, setValue] = useState<Loadout>(emptyLoadout)
  const [saved, setSaved] = useState<Loadout>(emptyLoadout)
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('')
  const [query, setQuery] = useState(''),
    [picker, setPicker] = useState(false)
  const [itemCategory, setItemCategory] = useState('all')
  const categoryTabs = [
    ['all', 'すべて'],
    ['fighter', 'ファイター'],
    ['marksman', 'マークスマン'],
    ['assassin', 'アサシン'],
    ['mage', 'メイジ'],
    ['tank', 'タンク'],
    ['support', 'サポート'],
  ]
  const categoriesById: Record<string, string[]> = itemCategories.categories
  const filteredItems = data.items
    .filter(
      (x) =>
        !('retired' in x && x.retired) &&
        (itemCategory === 'all' || categoriesById[x.id]?.includes(itemCategory)) &&
        x.name.normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').toLowerCase()),
    )
    .sort(compareShopItems)
  const dirty = JSON.stringify(value) !== JSON.stringify(saved)
  const recovery = useDurableDraft(
    `loadout:${matchupKey.myChampionId}:${matchupKey.enemyChampionId}:${matchupKey.role}`,
    value,
    dirty,
    ready && !pageBusy,
  )
  const [template, setTemplate] = useState<Loadout | null>(null)
  const [templateAction, setTemplateAction] = useState<'save' | 'copy' | null>(null)
  useEffect(() => {
    let active = true
    window.notebook
      .getTemplate({ championId: matchupKey.myChampionId, role: matchupKey.role })
      .then((r) => {
        if (!active) return
        if (r.ok) setTemplate(r.data)
        else setError(r.error)
      })
      .catch(() => {
        if (active) setError('雛形を読み込めませんでした。')
      })
    return () => {
      active = false
    }
  }, [matchupKey])
  useImperativeHandle(
    ref,
    () => ({
      discard: recovery.clear,
      draft: () => (ready && dirty ? value : undefined),
      saved: (next) => {
        recovery.clear()
        setSaved(next)
        setValue(next)
        setStatus('保存済み')
        setError('')
      },
    }),
    [ready, dirty, value, recovery.clear],
  )
  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])
  useEffect(() => {
    let active = true
    window.notebook
      .getLoadout(matchupKey)
      .then((r) => {
        if (!active) return
        if (!r.ok) throw new Error(r.error)
        setValue(r.data)
        setSaved(r.data)
        setReady(true)
      })
      .catch((e) => {
        if (active) setError(String(e.message ?? e))
      })
    return () => {
      active = false
    }
  }, [matchupKey])
  const update = (patch: Partial<Loadout>) => {
    setValue((v) => ({ ...v, ...patch }))
    setStatus('')
  }
  async function save() {
    setSaving(true)
    onSaving(true)
    setError('')
    try {
      if (!(await onSavePage()))
        throw new Error('ページを保存できませんでした。入力は保持されています。')
      setStatus('保存済み')
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。')
    } finally {
      setSaving(false)
      onSaving(false)
    }
  }
  const primary = data.trees.find((t) => t.id === value.primary),
    secondary = data.trees.find((t) => t.id === value.secondary)
  const icon = (x: { name: string; icon: string }) => <img src={`./${x.icon}`} alt="" />
  const treeSelector = (kind: 'primary' | 'secondary') => (
    <div
      className="rune-tree-selector"
      role="group"
      aria-label={kind === 'primary' ? 'メイン系統' : 'サブ系統'}
    >
      {data.trees.map((t) => (
        <button
          key={t.id}
          title={t.name}
          aria-label={`${kind === 'primary' ? 'メイン' : 'サブ'}：${t.name}`}
          aria-pressed={value[kind] === t.id}
          disabled={value[kind === 'primary' ? 'secondary' : 'primary'] === t.id}
          onClick={() =>
            update(
              kind === 'primary'
                ? { primary: t.id, primaryRunes: [] }
                : { secondary: t.id, secondaryRunes: [] },
            )
          }
        >
          {icon(t)}
        </button>
      ))}
    </div>
  )
  return (
    <section className="loadout-editor panel" aria-label="ビルド・ルーン">
      <Collapsible
        id="loadout"
        title={
          <>
            <span>ビルド・ルーン</span>
            <span className="loadout-status" role="status" aria-label="ビルド・ルーン保存状態">
              {saving ? '保存中…' : dirty ? '未保存' : status}
            </span>
          </>
        }
      >
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {!ready && <p>ビルド・ルーンを読み込んでいます。</p>}
        {recovery.error && <p role="alert">{recovery.error}</p>}
        {recovery.candidate && (
          <div className="recovery-banner">
            <p>ビルド・ルーンの下書きがあります。</p>
            <button onClick={() => recovery.restore(setValue)}>ビルドの下書きを復元</button>
            <button onClick={recovery.clear}>ビルドの下書きを破棄</button>
          </div>
        )}
        <fieldset disabled={!ready || saving || pageBusy || !!recovery.candidate}>
          <div className="template-toolbar">
            <button onClick={() => setTemplateAction('save')}>現在の内容を共通の雛形に保存</button>
            <button disabled={!template} onClick={() => setTemplateAction('copy')}>
              共通の雛形からコピー
            </button>
            <small>自分のチャンピオン・レーンごとに保存</small>
          </div>
          {templateAction && (
            <div className="recovery-banner">
              <p>
                {templateAction === 'save'
                  ? 'このチャンピオン・レーンの雛形を現在の内容で保存します。'
                  : '編集中のビルド・ルーンを雛形の内容で置き換えます。対面への保存はページ保存で確定します。'}
              </p>
              <button
                onClick={async () => {
                  if (templateAction === 'copy') {
                    if (template) setValue(structuredClone(template))
                    setTemplateAction(null)
                    return
                  }
                  setSaving(true)
                  onSaving(true)
                  try {
                    const r = await window.notebook.saveTemplate({
                      championId: matchupKey.myChampionId,
                      role: matchupKey.role,
                      loadout: value,
                    })
                    if (!r.ok) throw new Error(r.error)
                    setTemplate(structuredClone(value))
                    setStatus('雛形を保存しました')
                    setTemplateAction(null)
                  } catch (e) {
                    setError(e instanceof Error ? e.message : '雛形を保存できませんでした。')
                  } finally {
                    setSaving(false)
                    onSaving(false)
                  }
                }}
              >
                実行する
              </button>
              <button onClick={() => setTemplateAction(null)}>キャンセル</button>
            </div>
          )}
          <section className="build-section" aria-label="ビルド">
            <h3>ビルド</h3>
            <p className="muted">購入順に追加してください。素材・消耗品も記録できます。</p>
            <ol className="build-path">
              {value.items.map((id, i) => {
                const item = data.items.find((x) => x.id === id)!
                return (
                  <li key={`${i}-${id}`}>
                    {icon(item)}
                    <span>
                      {i + 1}. {item.name}
                    </span>
                    <div>
                      <button
                        aria-label={`${i + 1}番目を前へ`}
                        disabled={i === 0}
                        onClick={() => {
                          const items = [...value.items]
                          ;[items[i - 1], items[i]] = [items[i], items[i - 1]]
                          update({ items })
                        }}
                      >
                        ←
                      </button>
                      <button
                        aria-label={`${i + 1}番目を後ろへ`}
                        disabled={i === value.items.length - 1}
                        onClick={() => {
                          const items = [...value.items]
                          ;[items[i + 1], items[i]] = [items[i], items[i + 1]]
                          update({ items })
                        }}
                      >
                        →
                      </button>
                      <button
                        aria-label={`${i + 1}番目を削除`}
                        onClick={() => update({ items: value.items.filter((_, j) => i !== j) })}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                )
              })}
            </ol>
            <button aria-expanded={picker} onClick={() => setPicker(!picker)}>
              アイテムを選ぶ
            </button>
            {picker && (
              <div className="item-picker">
                <label>
                  アイテム検索
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="アイテム名"
                  />
                </label>
                <div className="item-category-tabs" role="group" aria-label="アイテムの分類">
                  {categoryTabs.map(([id, label]) => (
                    <button
                      key={id}
                      aria-pressed={itemCategory === id}
                      onClick={() => setItemCategory(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="item-filter-count" role="status" aria-label="アイテム検索結果">
                  {filteredItems.length}件
                </span>
                {!filteredItems.length && (
                  <p className="muted">
                    該当するアイテムがありません。分類や検索を変更してください。
                  </p>
                )}
                <div className="item-shop-results">
                  {ITEM_TIERS.map((label, tier) => {
                    const items = filteredItems.filter((x) => itemTier(x.id) === tier)
                    return items.length ? (
                      <section className="item-tier" key={tier} aria-label={label} data-tier={tier}>
                        <h4>
                          {label}
                          <small>価格の安い順</small>
                        </h4>
                        <div className="item-grid">
                          {items.map((x) => (
                            <button
                              key={x.id}
                              aria-label={x.name}
                              data-item-id={x.id}
                              data-gold={x.gold}
                              title={`${x.name} · ${x.gold}G`}
                              disabled={value.items.length >= 24}
                              onClick={() => update({ items: [...value.items, x.id] })}
                            >
                              {icon(x)}
                              <span>{x.name}</span>
                              <small className="item-price">{x.gold.toLocaleString()} G</small>
                            </button>
                          ))}
                        </div>
                      </section>
                    ) : null
                  })}
                </div>
                <small>購入順は最大24個</small>
              </div>
            )}
            <label>
              ビルドの補足
              <textarea
                maxLength={10000}
                value={value.buildNotes}
                onChange={(e) => update({ buildNotes: e.target.value })}
                placeholder="初手・購入タイミング・状況別の変更など"
              />
            </label>
          </section>
          <section className="runes-section" aria-label="ルーン">
            <h3>ルーン</h3>
            <div className="rune-picker">
              <div className="rune-columns">
                <div className="rune-column rune-primary">
                  <h4>メイン · {primary?.name ?? '系統を選択'}</h4>
                  {treeSelector('primary')}
                  {primary && (
                    <div aria-label="メインルーン">
                      <p className="rune-hint">各段から1個</p>
                      {primary.slots.map((slot, i) => (
                        <div className="rune-row" key={i}>
                          {slot.runes.map((r) => (
                            <button
                              key={r.id}
                              title={`${r.name}：${r.longDesc.replace(/<[^>]*>/g, '')}`}
                              aria-label={r.name}
                              aria-pressed={value.primaryRunes[i] === r.id}
                              onClick={() => {
                                const runes = Array.from(
                                  { length: 4 },
                                  (_, j) => value.primaryRunes[j] ?? 0,
                                )
                                runes[i] = r.id
                                update({ primaryRunes: runes })
                              }}
                            >
                              {icon(r)}
                              <span>{r.name}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {!primary && (
                    <p className="rune-placeholder">
                      メイン系統を選ぶと
                      <br />
                      ルーンを選択できます。
                    </p>
                  )}
                </div>
                <div className="rune-column rune-secondary">
                  <h4>サブ · {secondary?.name ?? '系統を選択'}</h4>
                  {treeSelector('secondary')}
                  {secondary && (
                    <div aria-label="サブルーン">
                      <p className="rune-hint">異なる段から2個</p>
                      {secondary.slots.slice(1).map((slot, i) => (
                        <div className="rune-row" key={i}>
                          {slot.runes.map((r) => (
                            <button
                              key={r.id}
                              title={`${r.name}：${r.longDesc.replace(/<[^>]*>/g, '')}`}
                              aria-label={r.name}
                              aria-pressed={value.secondaryRunes.includes(r.id)}
                              onClick={() => {
                                if (value.secondaryRunes.includes(r.id)) {
                                  update({
                                    secondaryRunes: value.secondaryRunes.filter(
                                      (id) => id !== r.id,
                                    ),
                                  })
                                  return
                                }
                                const runes = value.secondaryRunes.filter(
                                  (id) => !slot.runes.some((x) => x.id === id),
                                )
                                update({ secondaryRunes: [...runes.slice(-1), r.id] })
                              }}
                            >
                              {icon(r)}
                              <span>{r.name}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {!secondary && <p className="rune-placeholder">サブ系統を選択</p>}
                  <div className="rune-shards">
                    <h4>能力値シャード</h4>
                    {shardRows.map((row, i) => (
                      <div className="rune-row shard-row" key={i}>
                        {row.map((id) => (
                          <button
                            key={id}
                            aria-label={shardNames[id]}
                            title={shardNames[id]}
                            aria-pressed={value.shards[i] === id}
                            onClick={() => {
                              const shards = Array.from(
                                { length: 3 },
                                (_, j) => value.shards[j] ?? 0,
                              )
                              shards[i] = id
                              update({ shards })
                            }}
                          >
                            <img src={`./runes/${id}.png`} alt="" />
                            <span>{shardNames[id]}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() =>
                  update({
                    primary: null,
                    secondary: null,
                    primaryRunes: [],
                    secondaryRunes: [],
                    shards: [],
                  })
                }
              >
                ルーン選択をクリア
              </button>
            </div>
            <label>
              ルーンの補足
              <textarea
                maxLength={10000}
                value={value.runeNotes}
                onChange={(e) => update({ runeNotes: e.target.value })}
                placeholder="採用理由・対面による変更など"
              />
            </label>
          </section>
          <div className="editor-toolbar">
            <small>Data Dragon {data.version}</small>
            <button className="primary" disabled={!dirty} onClick={() => void save()}>
              ビルド・ルーンを保存
            </button>
          </div>
        </fieldset>
      </Collapsible>
    </section>
  )
}
