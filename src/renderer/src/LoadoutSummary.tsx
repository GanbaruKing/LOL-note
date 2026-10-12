import type { Loadout } from '../../shared/loadout'
import { shardNames } from '../../shared/loadout'
import catalog from '../../../resources/loadout.json'
export default function LoadoutSummary({ loadout }: { loadout: Loadout }) {
  const runes = catalog.trees.flatMap((t) => t.slots.flatMap((s) => s.runes))
  const ids = [...loadout.primaryRunes, ...loadout.secondaryRunes, ...loadout.shards].filter(
    Boolean,
  )
  return (
    <section className="loadout-summary" aria-label="保存したビルド・ルーン">
      <h3>保存したビルド・ルーン</h3>
      {!loadout.items.length && !ids.length && !loadout.buildNotes && !loadout.runeNotes && (
        <p className="muted">まだ保存していません。</p>
      )}
      <ol className="summary-icons">
        {loadout.items.map((id, i) => {
          const item = catalog.items.find((x) => x.id === id)
          return (
            <li key={i} title={item?.name ?? `未収録アイテム ${id}`}>
              <img src={`./${item?.icon ?? `items/${id}.png`}`} alt={item?.name ?? String(id)} />
              <small>{i + 1}</small>
            </li>
          )
        })}
      </ol>
      {loadout.buildNotes && <p className="note-body">{loadout.buildNotes}</p>}
      <div className="summary-icons">
        {ids.map((id, i) => (
          <img
            key={i}
            src={`./runes/${id}.png`}
            alt={runes.find((r) => r.id === id)?.name ?? shardNames[id] ?? String(id)}
            title={runes.find((r) => r.id === id)?.name ?? shardNames[id]}
          />
        ))}
      </div>
      {loadout.runeNotes && <p className="note-body">{loadout.runeNotes}</p>}
    </section>
  )
}
