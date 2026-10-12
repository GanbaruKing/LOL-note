import { useEffect, useRef, useState } from 'react'
import { ROLES, type Champion, type Role } from '../../shared/contracts'
import { normalizeChampionSearch } from './championSearch'
import laneData from '../../../resources/champion-lanes.json'
export function Portrait({ champion, large = false }: { champion: Champion; large?: boolean }) {
  return (
    <img
      className={`portrait ${large ? 'large' : ''}`}
      src={`./champions/${champion.slug}.png`}
      alt=""
    />
  )
}
export default function ChampionPicker({
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
