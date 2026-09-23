import data from '../../../resources/champion-cooldowns.json'
import type { Champion } from '../../shared/contracts'

type Spell = { key: string; name: string; cooldown: number[] }
const champions: Record<string, Spell[]> = data.champions

export default function SkillCooldowns({ champion }: { champion: Champion }) {
  const spells = champions[champion.id]
  return (
    <section className="skill-cooldowns" aria-label={`${champion.name}のスキルCD`}>
      <div className="skill-cooldowns-title">
        <h3>Skill CD</h3>
        <span>基礎CD・秒 / ランク順</span>
      </div>
      {spells ? (
        <table>
          <thead className="sr-only">
            <tr>
              <th>スキル</th>
              <th>クールダウン（秒）</th>
            </tr>
          </thead>
          <tbody>
            {spells.map((spell) => {
              const special = spell.cooldown.some((value) => value < 1)
              const values =
                new Set(spell.cooldown).size === 1 ? [spell.cooldown[0]] : spell.cooldown
              return (
                <tr key={spell.key}>
                  <th scope="row">
                    <kbd>{spell.key}</kbd>
                    <span title={spell.name}>{spell.name}</span>
                  </th>
                  <td>{special ? '特殊' : values.join(' / ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p>CDデータ未収録</p>
      )}
      <p className="skill-cooldowns-help">
        スキルヘイスト適用前。再使用・チャージ・変身などで変化します。
      </p>
      <small>Data Dragon {data.version}</small>
    </section>
  )
}
