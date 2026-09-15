import { existsSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { loadEnvFile } from 'node:process'
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { loadConfig, object, reprocessingConfig } from '../config/index.js'
import { Store, type Run } from '../storage/store.js'
import { Client } from '../collector/client.js'
import { collect } from '../collector/collect.js'
import { aggregate } from '../aggregator/aggregate.js'
import { exportJson } from '../exporter/json.js'

async function catalog(patch: string) {
  const get = async (url: string) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' })
    if (!response.ok) throw new Error(`Data Dragon HTTP ${response.status}`)
    return response.json() as Promise<unknown>
  }
  const versions = await get('https://ddragon.leagueoflegends.com/api/versions.json')
  if (!Array.isArray(versions) || versions.some((v) => typeof v !== 'string'))
    throw new Error('Invalid Data Dragon versions')
  const version = versions.find(
    (v) =>
      /^\d+\.\d+\.\d+$/.test(v) &&
      (patch === 'auto' || v.split('.').slice(0, 2).join('.') === patch),
  ) as string | undefined
  if (!version) throw new Error('Requested patch unavailable in Data Dragon')
  const data = object(
    object(await get(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`))
      .data,
  )
  const champions = Object.values(data).map((v) => Number(object(v).key))
  if (!champions.length || champions.some((n) => !Number.isSafeInteger(n) || n <= 0))
    throw new Error('Invalid champion catalog')
  return { patch: version.split('.').slice(0, 2).join('.'), champions }
}
async function main() {
  const command = process.argv[2]
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      config: { type: 'string' },
      data: { type: 'string' },
      run: { type: 'string' },
      new: { type: 'boolean' },
      preview: { type: 'boolean' },
      'retry-failed': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log(
      'npm run collect -- [--new] [--config config/default.json] [--run ID] [--retry-failed]\nnpm run aggregate -- [--run ID] [--config config/default.json] [--preview]\nnpm run export -- [--run ID] [--preview]\nAll commands accept --data PATH. Paths are relative to tools/stats when using npm scripts.',
    )
    return
  }
  if (!['collect', 'aggregate', 'export'].includes(command))
    throw new Error('Expected collect, aggregate or export')
  if (values.new && values.run) throw new Error('--new and --run cannot be combined')
  if (
    (command !== 'collect' && (values.new || values['retry-failed'])) ||
    (command === 'export' && values.config)
  )
    throw new Error('Collection options are not valid for this command')
  const root = resolve(values.data ?? 'data')
  mkdirSync(root, { recursive: true })
  const store = new Store(join(root, 'raw', 'collector.sqlite'))
  let unlock: (() => void) | undefined
  try {
    unlock = store.lock()
    if (command === 'collect') {
      if (existsSync('.env')) loadEnvFile('.env')
      const key = process.env.RIOT_API_KEY?.trim()
      if (!key)
        throw new Error(
          'RIOT_API_KEY is not set. Set it locally or use tools/stats/.env; never paste it into chat.',
        )
      const hasRun = !!store.db.prepare('SELECT 1 FROM runs LIMIT 1').get()
      let run: Run
      if (values.new || !hasRun) {
        if (values.run) throw new Error('Requested run does not exist')
        const config = loadConfig(resolve(values.config ?? 'config/default.json'))
        const current = await catalog(config.patch)
        config.patch = current.patch
        const end = Math.floor(Date.now() / 1000) * 1000
        run = {
          id: randomUUID(),
          config,
          start: end - config.lookbackHours * 3600000,
          end,
          seed: randomUUID(),
          complete: false,
          champions: current.champions,
        }
        store.saveRun(run)
      } else {
        if (values.config)
          throw new Error('Existing runs keep their configuration; use --new with --config')
        run = store.run(values.run)
      }
      if (values['retry-failed'])
        store.db
          .prepare(
            "UPDATE jobs SET attempts=0,status='pending' WHERE status='failed' OR attempts>=?",
          )
          .run(run.config.maxAttempts)
      console.log(
        `Run ${run.id}; patch ${run.config.patch}; ${new Date(run.start).toISOString()} to ${new Date(run.end).toISOString()}`,
      )
      const progress = setInterval(
        () => console.log(`Progress: ${JSON.stringify(store.metrics(run.id))}`),
        30000,
      )
      try {
        await collect(store, new Client(store, run.config, run.id, key), run)
      } finally {
        clearInterval(progress)
      }
    } else {
      const run = store.run(values.run),
        path = join(root, 'processed', 'stats.sqlite')
      if (command === 'aggregate') {
        if (values.config)
          run.config = reprocessingConfig(run.config, loadConfig(resolve(values.config)))
        const result = aggregate(store, run, path, values.preview)
        console.log(
          JSON.stringify({
            datasetId: result.datasetId,
            acceptedMatches: result.quality.acceptedMatches,
            acceptedPairs: result.quality.acceptedPairs,
          }),
        )
      } else
        console.log(`Exported: ${exportJson(path, join(root, 'output'), run.id, values.preview)}`)
    }
  } finally {
    unlock?.()
    store.close()
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Stats command failed')
  process.exitCode = 1
})
