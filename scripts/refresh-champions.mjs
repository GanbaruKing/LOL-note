import { fetchData } from './data-http.mjs'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'

const base = 'https://ddragon.leagueoflegends.com'
async function json(url) {
  const response = await fetchData(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`${response.status}: ${url}`)
  return response.json()
}
const versions = await json(`${base}/api/versions.json`)
const version = process.env.RIFTNOTE_DATA_VERSION || versions[0]
if (!versions.includes(version)) throw new Error(`Unknown Data Dragon version: ${version}`)
const [en, ja] = await Promise.all(
  ['en_US', 'ja_JP'].map((locale) => json(`${base}/cdn/${version}/data/${locale}/champion.json`)),
)
const champions = Object.values(en.data)
  .map((c) => ({
    id: Number(c.key),
    slug: c.id,
    name: c.name,
    nameJa: ja.data[c.id]?.name ?? c.name,
    title: ja.data[c.id]?.title ?? c.title,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))
await mkdir('resources', { recursive: true })
await mkdir('public/champions', { recursive: true })
for (let i = 0; i < champions.length; i += 10) {
  await Promise.all(
    champions.slice(i, i + 10).map(async (champion) => {
      const response = await fetchData(`${base}/cdn/${version}/img/champion/${champion.slug}.png`, {
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) throw new Error(`Icon: ${champion.slug}: ${response.status}`)
      await writeFile(
        `public/champions/${champion.slug}.png`,
        Buffer.from(await response.arrayBuffer()),
      )
    }),
  )
}
await writeFile(
  'resources/champions.json',
  JSON.stringify(
    { version, source: `${base}/cdn/${version}/data/en_US/champion.json`, champions },
    null,
    2,
  ) + '\n',
)
console.log(`Saved ${champions.length} champions and icons (${version}).`)
