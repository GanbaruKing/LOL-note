import { createServer } from 'node:https'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Test-only ephemeral credentials and certificate. Never accesses the installed League client.
export async function createMockLcu(folder: string) {
  mkdirSync(folder, { recursive: true })
  const key = join(folder, 'key.pem'),
    cert = join(folder, 'cert.pem')
  const bundled = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'
  execFileSync(
    existsSync(bundled) ? bundled : 'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-subj',
      '/CN=localhost',
      '-days',
      '1',
    ],
    { windowsHide: true, stdio: 'ignore' },
  )
  const scenario = {
    phase: 'None',
    own: 266,
    intent: 0,
    role: 'top',
    enemies: [122, 86],
    broken: false,
  }
  const paths: string[] = []
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    paths.push(`${req.method} ${req.url}`)
    if (req.headers.authorization !== `Basic ${Buffer.from('riot:test-only').toString('base64')}`) {
      res.writeHead(401).end()
      return
    }
    if (scenario.broken) {
      res.writeHead(503).end()
      return
    }
    res.setHeader('content-type', 'application/json')
    if (req.url === '/lol-gameflow/v1/gameflow-phase') res.end(JSON.stringify(scenario.phase))
    else if (req.url === '/lol-champ-select/v1/session')
      res.end(
        JSON.stringify({
          gameId: 1,
          localPlayerCellId: 0,
          myTeam: [
            {
              cellId: 0,
              assignedPosition: scenario.role,
              championId: scenario.own,
              championPickIntent: scenario.intent,
            },
          ],
          theirTeam: scenario.enemies.map((championId) => ({ championId })),
        }),
      )
    else res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Mock failed to listen')
  writeFileSync(join(folder, 'lockfile'), `LeagueClient:1:${address.port}:test-only:https`)
  return {
    scenario,
    paths,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
