import { useEffect, useState } from 'react'
import data from '../../../resources/loadout.json'
import { emptyLoadout, shardRows, shardNames, type Loadout } from '../../shared/loadout'
import type { MatchupKey } from '../../shared/contracts'
import Collapsible from './Collapsible'

export default function LoadoutEditor({
  matchupKey,
  onDirty,
  onSaving,
}: {
  matchupKey: MatchupKey
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
  const dirty = JSON.stringify(value) !== JSON.stringify(saved)
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
      const r = await window.notebook.saveLoadout({ key: matchupKey, loadout: value })
      if (!r.ok) throw new Error(r.error)
      setSaved(r.data)
      setValue(r.data)
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
            <span className="loadout-status" role="status">
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
        <fieldset disabled={!ready || saving}>
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
                <div className="item-grid">
                  {data.items
                    .filter((x) =>
                      x.name
                        .normalize('NFKC')
                        .toLowerCase()
                        .includes(query.normalize('NFKC').toLowerCase()),
                    )
                    .map((x) => (
                      <button
                        key={x.id}
                        title={`${x.name} · ${x.gold}G`}
                        disabled={value.items.length >= 24}
                        onClick={() => update({ items: [...value.items, x.id] })}
                      >
                        {icon(x)}
                        <span>{x.name}</span>
                      </button>
                    ))}
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
