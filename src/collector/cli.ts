import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  closeSync,
  unlinkSync,
  existsSync,
} from 'node:fs'
import { resolve, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { parseArgs } from 'node:util'
import { aggregate, normalizeMatch, RiotClient, CollectorError, type CollectedMatch } from './riot'
import { parseStatistics } from '../main/statistics'
import catalog from '../../resources/champions.json'

function atomic(file: string, data: unknown) {
  writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), 'utf8')
  renameSync(`${file}.tmp`, file)
}
async function main() {
  const { values } = parseArgs({
    options: {
      'riot-id': { type: 'string' },
      patch: { type: 'string' },
      count: { type: 'string', default: '100' },
      help: { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log(
      'npm run stats:collect -- [--riot-id "名前#タグ"] [--patch 16.18] [--count 100]\nJP1 / Ranked Solo-Duoの履歴標本。最大1000件。出力: .riot-data/statistics.json\nRIOT_API_KEYを同じターミナルで設定してください。キーを引数には指定しません。',
    )
    return
  }
  const client = new RiotClient(process.env.RIOT_API_KEY ?? '')
  const count = Number(values.count)
  if (!Number.isInteger(count) || count < 1 || count > 1000)
    throw new CollectorError('countは1〜1000にしてください。')
  const patch = values.patch ?? catalog.version.split('.').slice(0, 2).join('.')
  if (!/^\d+\.\d+$/.test(patch)) throw new CollectorError('patchは16.18のように指定してください。')
  let riotId = values['riot-id']
  if (!riotId) {
    const rl = createInterface({ input: stdin, output: stdout })
    try {
      riotId = await rl.question('収集元のRiot ID（名前#タグ）: ')
    } finally {
      rl.close()
    }
  }
  const split = riotId.lastIndexOf('#'),
    name = riotId.slice(0, split).trim(),
    tag = riotId.slice(split + 1).trim()
  if (split < 1 || !name || !tag || name.length > 100 || tag.length > 100)
    throw new CollectorError('Riot IDを名前#タグ形式で入力してください。')
  const directory = resolve('.riot-data'),
    cache = join(directory, 'matches')
  mkdirSync(cache, { recursive: true })
  const lock = join(directory, 'collector.lock')
  let handle: number
  try {
    handle = openSync(lock, 'wx')
  } catch {
    throw new CollectorError(
      '収集ツールは既に実行中です。強制終了後の場合は .riot-data/collector.lock を確認してください。',
    )
  }
  try {
    console.log(`JP1 / Solo-Duo / Patch ${patch} / 最大${count}試合。取得は約1.3秒間隔です。`)
    const account = (await client.get(
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
    )) as { puuid?: unknown }
    if (!account || typeof account.puuid !== 'string' || !account.puuid)
      throw new CollectorError('Riot IDの応答形式が正しくありません。')
    const matchIds = new Set<string>()
    for (let start = 0; start < count; start += 100) {
      const pageSize = Math.min(100, count - start)
      const page = await client.get(
        `/lol/match/v5/matches/by-puuid/${encodeURIComponent(account.puuid)}/ids?queue=420&start=${start}&count=${pageSize}`,
      )
      if (
        !Array.isArray(page) ||
        page.some((id) => typeof id !== 'string' || !/^[A-Z0-9]+_\d+$/.test(id))
      )
        throw new CollectorError('試合一覧の応答形式が正しくありません。')
      for (const id of page) if (/^JP1_\d+$/.test(id)) matchIds.add(id)
      if (page.length < pageSize) break
    }
    const matches: CollectedMatch[] = []
    let processed = 0,
      excluded = 0
    for (const id of matchIds) {
      const file = join(cache, `${id}.json`)
      let raw: unknown
      if (existsSync(file)) {
        try {
          raw = JSON.parse(readFileSync(file, 'utf8'))
        } catch {
          throw new CollectorError(
            '試合キャッシュが壊れています。.riot-data/matchesを確認してください。',
          )
        }
      } else {
        raw = await client.get(`/lol/match/v5/matches/${id}`)
      }
      const match = normalizeMatch(raw, id)
      if (match && !existsSync(file)) {
        // Store only fields needed for aggregation, never names, PUUIDs or the complete API payload.
        const source = raw as {
          metadata: { matchId: string }
          info: Record<string, unknown> & { participants: Record<string, unknown>[] }
        }
        const fields = ['platformId', 'queueId', 'mapId', 'gameMode', 'gameDuration', 'gameVersion']
        atomic(file, {
          metadata: { matchId: id },
          info: {
            ...Object.fromEntries(fields.map((f) => [f, source.info[f]])),
            participants: source.info.participants.map((p) =>
              Object.fromEntries(
                ['championId', 'teamId', 'teamPosition', 'win', 'gameEndedInEarlySurrender'].map(
                  (f) => [f, p[f]],
                ),
              ),
            ),
          },
        })
      }
      if (match?.patch === patch) matches.push(match)
      else excluded++
      processed++
      console.log(`${processed}/${matchIds.size}件確認・対象${matches.length}・対象外${excluded}`)
    }
    if (!matches.length)
      throw new CollectorError('対象パッチの有効なJP1試合がありません。既存の出力は変更しません。')
    const data = parseStatistics(aggregate(matches, patch))
    atomic(join(directory, 'statistics.json'), data)
    console.log(
      `完了: ${matches.length}試合 / ${data.rows.length}対面 / 100試合以上の対面${data.rows.filter((r) => r.games >= 100).length}件\n${join(directory, 'statistics.json')}\nアプリのStatistics「統計JSONを取り込む」でこのファイルを選んでください。`,
    )
  } finally {
    closeSync(handle)
    unlinkSync(lock)
  }
}
main().catch((e) => {
  console.error(
    e instanceof CollectorError
      ? e.message
      : '収集を完了できませんでした。入力・保存先を確認してください。取得済みキャッシュは保持されます。',
  )
  process.exitCode = 1
})
