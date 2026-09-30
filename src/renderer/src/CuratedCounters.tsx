import Collapsible from './Collapsible'
import { useState } from 'react'
import catalog from '../../../resources/champions.json'
import data from '../../../resources/counter-notes.json'
import type { Role } from '../../shared/contracts'

export default function CuratedCounters({
  recommended = false,
  championId,
  role,
  onSelect,
  busy = false,
}: {
  recommended?: boolean
  championId: number
  role?: Role
  busy?: boolean
  onSelect?: (championId: number, role: Role) => void
}) {
  const [error, setError] = useState('')
  const entries = data.entries.filter(
    (entry) => entry.championId === championId && (!role || entry.role === role),
  )
  return (
    <section className="curated-counters panel" aria-label="初期カウンターメモ">
      <Collapsible
        id={recommended ? 'recommended-picks' : 'curated-counters'}
        title={
          recommended
            ? 'Recommended Picks'
            : `${catalog.champions.find((c) => c.id === championId)?.name}へのカウンターピック`
        }
      >
        {recommended && (
          <p>
            {catalog.champions.find((c) => c.id === championId)?.name} · {role}
          </p>
        )}
        <p className="muted">初期メモ · {data.checkedAt}確認</p>
        {entries.length ? (
          entries.map((entry) => (
            <article key={`${entry.role}-${entry.counterId}`} className="curated-counter">
              <div className="section-title">
                <img
                  className="portrait"
                  src={`./champions/${catalog.champions.find((c) => c.id === entry.counterId)?.slug}.png`}
                  alt=""
                />
                <strong>{catalog.champions.find((c) => c.id === entry.counterId)?.name}</strong>
                <span>{entry.role}</span>
                {onSelect && (
                  <button
                    className="counter-use"
                    disabled={busy}
                    onClick={() => onSelect(entry.counterId, entry.role as Role)}
                    aria-label={`${catalog.champions.find((c) => c.id === entry.counterId)?.name}で対面メモを開く`}
                  >
                    このピックでメモを開く →
                  </button>
                )}
              </div>
              <p>{entry.reason}</p>
              <details>
                <summary>根拠・出典</summary>
                <p className="muted">
                  {entry.basis === 'wiki-matchup'
                    ? 'Wikiの相性解説とOP.GGを照合。'
                    : 'OP.GGの傾向とWikiのスキル仕様からの考察。'}{' '}
                  {entry.role === 'BOTTOM' || entry.role === 'SUPPORT'
                    ? 'BOTは相方との組み合わせにも左右されます。'
                    : entry.role === 'JUNGLE'
                      ? 'ジャングル全体の相性で、1対1の勝敗だけを示すものではありません。'
                      : ''}
                </p>
                {entry.evidence.map((item) => (
                  <p key={item.patch} className="muted">
                    OP.GG {item.patch} · {item.games.toLocaleString()}試合 · 候補側の対戦勝率{' '}
                    {item.counterWinRate.toFixed(2)}% · Emerald+ / 全地域
                  </p>
                ))}
                <p className="muted">試合全体の勝率です。レーンの勝率を示すものではありません。</p>
                <div className="counter-sources">
                  {entry.sources.map((source, index) => (
                    <button
                      key={source.url}
                      onClick={async () => {
                        setError('')
                        try {
                          const result = await window.notebook.openCounterSource(source.url)
                          if (!result.ok) setError(result.error)
                        } catch {
                          setError('出典を開けませんでした。')
                        }
                      }}
                    >
                      {source.label}
                      {index > 1 ? '' : ' ↗'}
                    </button>
                  ))}
                </div>
              </details>
            </article>
          ))
        ) : (
          <p className="muted">
            {role ? 'このレーン' : 'このチャンピオン'}
            で十分な根拠を確認できた候補は、まだ登録されていません。
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <p className="muted">
          パッチや熟練度によって相性は変わります。個人メモとは別に表示しています。
        </p>
      </Collapsible>
    </section>
  )
}
