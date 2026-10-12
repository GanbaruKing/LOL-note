import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const root = resolve('.')
mkdirSync('.test-data', { recursive: true })
const stage = mkdtempSync(resolve('.test-data', 'catalog-update-'))
for (const folder of ['resources', 'public', 'scripts'])
  cpSync(join(root, folder), join(stage, folder), { recursive: true })
const argument = process.argv.indexOf('--version')
const version = argument >= 0 ? process.argv[argument + 1] : undefined
if (argument >= 0 && !/^\d+\.\d+\.\d+$/.test(version ?? ''))
  throw new Error('Use --version 16.18.1')
for (const script of [
  'refresh-champions',
  'refresh-cooldowns',
  'refresh-loadout',
  'refresh-item-categories',
]) {
  const result = spawnSync(process.execPath, [join(stage, 'scripts', `${script}.mjs`)], {
    cwd: stage,
    stdio: 'inherit',
    env: { ...process.env, RIFTNOTE_DATA_VERSION: version ?? '' },
  })
  if (result.status !== 0)
    throw new Error(`Stopped at ${script}. Original catalogues are unchanged. Staging: ${stage}`)
}
const json = (base, name) =>
  JSON.parse(readFileSync(join(base, 'resources', name + '.json'), 'utf8'))
const next = json(stage, 'champions')
for (const name of ['champion-cooldowns', 'loadout', 'item-categories'])
  if (json(stage, name).version !== next.version) throw new Error('Catalogue version mismatch')
const oldLoadout = json(root, 'loadout'),
  nextLoadout = json(stage, 'loadout')
// Removed item IDs stay readable in saved builds, but cannot be added from the shop.
for (const item of oldLoadout.items)
  if (!nextLoadout.items.some((x) => x.id === item.id))
    nextLoadout.items.push({ ...item, retired: true })
// A changed rune layout needs an explicit migration to avoid invalidating saved pages.
for (const tree of oldLoadout.trees)
  for (const [i, slot] of tree.slots.entries())
    for (const rune of slot.runes) {
      if (
        !nextLoadout.trees
          .find((t) => t.id === tree.id)
          ?.slots[i]?.runes.some((r) => r.id === rune.id)
      )
        throw new Error(
          `Rune layout changed (${rune.id}). Add a compatibility migration before publishing. Originals are unchanged. Staging: ${stage}`,
        )
    }
writeFileSync(join(stage, 'resources', 'loadout.json'), JSON.stringify(nextLoadout, null, 2) + '\n')
const previous = join(stage, 'previous')
mkdirSync(previous)
for (const dir of ['resources', 'public'])
  cpSync(join(root, dir), join(previous, dir), { recursive: true })
try {
  for (const dir of ['resources', 'public'])
    cpSync(join(stage, dir), join(root, dir), { recursive: true })
} catch (error) {
  for (const dir of ['resources', 'public'])
    cpSync(join(previous, dir), join(root, dir), { recursive: true })
  throw error
}
console.log(
  `Catalogues updated to ${next.version}. Previous files: ${previous}. Run tests and rebuild before distributing.`,
)
