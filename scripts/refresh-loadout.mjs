import { fetchData } from './data-http.mjs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
const { version } = JSON.parse(await readFile('resources/champions.json', 'utf8'))
const base = `https://ddragon.leagueoflegends.com/cdn/${version}`
async function get(url) {
  const r = await fetchData(url, { signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw new Error(`${r.status}: ${url}`)
  return r
}
const raw = await (await get(`${base}/data/ja_JP/item.json`)).json()
const trees = await (await get(`${base}/data/ja_JP/runesReforged.json`)).json()
const items = Object.entries(raw.data)
  .filter(([, x]) => x.maps['11'] && x.gold.purchasable && !x.hideFromAll)
  .map(([id, x]) => ({ id: Number(id), name: x.name, icon: `items/${id}.png`, gold: x.gold.total }))
const downloads = items.map((x) => [x.icon, `${base}/img/item/${x.id}.png`])
for (const tree of trees) {
  for (const x of [tree, ...tree.slots.flatMap((s) => s.runes)]) {
    const original = x.icon
    x.icon = `runes/${x.id}.png`
    downloads.push([x.icon, `https://ddragon.leagueoflegends.com/cdn/img/${original}`])
  }
}
for (const [id, name] of Object.entries({
  5008: 'AdaptiveForce',
  5005: 'AttackSpeed',
  5007: 'CDRScaling',
  5010: 'MovementSpeed',
  5001: 'HealthScaling',
  5011: 'HealthPlus',
  5013: 'Tenacity',
})) {
  downloads.push([
    `runes/${id}.png`,
    `https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods/StatMods${name}Icon.png`,
  ])
}
for (const dir of ['items', 'runes']) await mkdir(`public/${dir}`, { recursive: true })
for (let i = 0; i < downloads.length; i += 12)
  await Promise.all(
    downloads
      .slice(i, i + 12)
      .map(async ([path, url]) =>
        writeFile(`public/${path}`, Buffer.from(await (await get(url)).arrayBuffer())),
      ),
  )
await writeFile('resources/loadout.json', JSON.stringify({ version, items, trees }, null, 2) + '\n')
console.log(`Saved ${items.length} items and ${trees.length} rune trees (${version})`)
