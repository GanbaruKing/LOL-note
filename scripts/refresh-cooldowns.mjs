import { readFile, writeFile } from 'node:fs/promises'

const catalog = JSON.parse(await readFile('resources/champions.json', 'utf8'))
const base = `https://ddragon.leagueoflegends.com/cdn/${catalog.version}/data/ja_JP/champion`
const champions = {}
for (let i = 0; i < catalog.champions.length; i += 8) {
  await Promise.all(
    catalog.champions.slice(i, i + 8).map(async (champion) => {
      const response = await fetch(`${base}/${champion.slug}.json`, {
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) throw new Error(`${champion.slug}: ${response.status}`)
      const data = (await response.json()).data[champion.slug]
      if (data.spells.length !== 4) throw new Error(`Unexpected spells: ${champion.slug}`)
      champions[champion.id] = data.spells.map((spell, index) => {
        if (
          !Array.isArray(spell.cooldown) ||
          !spell.cooldown.length ||
          spell.cooldown.some((value) => !Number.isFinite(value) || value < 0)
        ) {
          throw new Error(`Invalid cooldown: ${champion.slug} ${spell.id}`)
        }
        return { key: ['Q', 'W', 'E', 'R'][index], name: spell.name, cooldown: spell.cooldown }
      })
    }),
  )
}
await writeFile(
  'resources/champion-cooldowns.json',
  JSON.stringify({ version: catalog.version, source: base, champions }, null, 2) + '\n',
)
console.log(`Saved cooldowns for ${Object.keys(champions).length} champions (${catalog.version}).`)
