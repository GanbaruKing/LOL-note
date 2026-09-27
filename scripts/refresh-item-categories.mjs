import { readFile, writeFile } from 'node:fs/promises'

// Keep shop classification on the same patch as the bundled item catalogue.
const { version, items } = JSON.parse(await readFile('resources/loadout.json', 'utf8'))
const patch = version.split('.').slice(0, 2).join('.')
const source = `https://raw.communitydragon.org/${patch}/game/items.cdtb.bin.json`
const response = await fetch(source, { signal: AbortSignal.timeout(60000) })
if (!response.ok) throw new Error(`Shop data: ${response.status}`)
const raw = await response.json()
const roles = { 1: 'fighter', 2: 'marksman', 4: 'assassin', 8: 'tank', 16: 'mage', 32: 'support' }
const categories = {}
for (const item of items) {
  const entry = raw[`Items/${item.id}`]
  if (!entry) throw new Error(`Missing item ${item.id}`)
  categories[item.id] = [
    ...new Set(
      (entry.mItemAttributes ?? []).map((id) => {
        if (!roles[id]) throw new Error(`Unknown shop attribute ${id}`)
        return roles[id]
      }),
    ),
  ]
}
await writeFile(
  'resources/item-categories.json',
  JSON.stringify({ version, source, categories }, null, 2) + '\n',
)
console.log(`Saved shop classifications for ${items.length} items (${version})`)
