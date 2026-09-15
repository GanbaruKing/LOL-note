import { setTimeout as delay } from 'node:timers/promises'
import type { Store, Cached } from '../storage/store.js'
import type { Config } from '../config/index.js'

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(
      `Riot request failed (HTTP ${status}); response/URL omitted to protect account identifiers`,
    )
  }
}
interface Clock {
  now: () => number
  sleep: (ms: number) => Promise<unknown>
}
export class Client {
  private requests = 0
  constructor(
    private store: Store,
    private config: Config,
    private runId: string,
    private key: string,
    private transport: typeof fetch = fetch,
    private clock: Clock = { now: Date.now, sleep: (ms) => delay(ms) },
  ) {}

  private cooldown(scope: string, until: number) {
    this.store.db
      .prepare(
        'INSERT INTO cooldowns VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET until_at=MAX(until_at,excluded.until_at)',
      )
      .run(scope, until)
  }
  private async waitUntil(until: number) {
    while (until > this.clock.now())
      await this.clock.sleep(Math.min(60000, until - this.clock.now()))
  }
  private async wait(host: string, method: string) {
    const row = this.store.db
      .prepare('SELECT MAX(until_at) AS until_at FROM cooldowns WHERE scope IN (?,?,?)')
      .get('*', host, `${host}:${method}`) as { until_at: number | null }
    await this.waitUntil(row.until_at ?? 0)
  }
  private headers(host: string, method: string, h: Headers) {
    for (const [prefix, scope] of [
      ['app', host],
      ['method', `${host}:${method}`],
    ]) {
      const counts = new Map(
        (h.get(`x-${prefix}-rate-limit-count`) ?? '')
          .split(',')
          .map((s) => s.split(':').map(Number))
          .map(([n, sec]) => [sec, n]),
      )
      for (const part of (h.get(`x-${prefix}-rate-limit`) ?? '').split(',')) {
        const [limit, seconds] = part.split(':').map(Number)
        if (limit > 0 && seconds > 0 && (counts.get(seconds) ?? 0) >= limit - 1)
          this.cooldown(scope, this.clock.now() + seconds * 1000)
      }
    }
  }
  async get(host: string, path: string, method: string, cacheKey: string): Promise<Cached> {
    if (!/^[a-z0-9]+$/.test(host)) throw new Error('Invalid routing host')
    const cached = this.store.cached(cacheKey)
    if (cached) {
      this.store.count(this.runId, 'responseCacheHits')
      return cached
    }
    this.store.db
      .prepare("INSERT OR IGNORE INTO jobs(key,status) VALUES(?,'pending')")
      .run(cacheKey)
    while (true) {
      const job = this.store.db
        .prepare('SELECT attempts,next_at,status_code,status FROM jobs WHERE key=?')
        .get(cacheKey) as {
        attempts: number
        next_at: number
        status_code: number | null
        status: string
      }
      if (job.status === 'failed')
        throw new Error(
          'Request previously failed; resolve the cause and use collect --retry-failed',
        )
      if (job.attempts >= this.config.maxAttempts)
        throw new Error(
          'Retry limit reached; inspect status and use collect --retry-failed after resolving the cause',
        )
      if (this.requests >= this.config.requestBudget)
        throw new Error(
          'Request budget reached; progress saved. Resume collect for another budget.',
        )
      await this.waitUntil(job.next_at)
      await this.wait(host, method)
      this.requests++
      this.store.count(this.runId, 'riotRequests')
      this.store.count(this.runId, `requests:${method}`)
      this.store.db
        .prepare("UPDATE jobs SET status='leased',attempts=attempts+1 WHERE key=?")
        .run(cacheKey)
      // Serialize requests and persist spacing, including across process restarts.
      this.cooldown(host, this.clock.now() + this.config.requestIntervalMs)
      let response: Response | undefined
      try {
        response = await this.transport(`https://${host}.api.riotgames.com${path}`, {
          headers: { 'X-Riot-Token': this.key },
          signal: AbortSignal.timeout(20000),
          redirect: 'error',
        })
      } catch {
        /* Retry network errors without exposing headers or URLs. */
      }
      if (response) this.headers(host, method, response.headers)
      if (response?.ok) {
        let value: unknown
        try {
          value = await response.json()
        } catch {
          throw new Error('Riot returned malformed JSON; progress saved')
        }
        const fetchedAt = this.clock.now()
        this.store.saveResponse(cacheKey, value, fetchedAt)
        return { value, fetchedAt }
      }
      const status = response?.status ?? 0
      this.store.count(this.runId, `errors:${status}`)
      if (
        [400, 401, 403, 405, 415].includes(status) ||
        (status >= 400 && status < 500 && ![404, 429].includes(status))
      ) {
        this.store.db
          .prepare("UPDATE jobs SET status='failed',status_code=? WHERE key=?")
          .run(status, cacheKey)
        throw new ApiError(status)
      }
      const backoff =
        Math.min(60000, 1000 * 2 ** Math.min(job.attempts, 10)) + Math.floor(Math.random() * 500)
      let waitMs = backoff
      if (status === 429) {
        const raw = response!.headers.get('retry-after')
        const retry = raw === null ? NaN : Number(raw)
        waitMs = Math.max(backoff, Number.isFinite(retry) ? retry * 1000 : 120000)
        const type = response!.headers.get('x-rate-limit-type')
        this.cooldown(
          type === 'method' ? `${host}:${method}` : type === 'application' ? host : '*',
          this.clock.now() + waitMs,
        )
      }
      const exhausted =
        job.attempts + 1 >=
        (status === 404 ? Math.min(3, this.config.maxAttempts) : this.config.maxAttempts)
      this.store.db
        .prepare('UPDATE jobs SET status=?,next_at=?,status_code=? WHERE key=?')
        .run(exhausted ? 'failed' : 'pending', this.clock.now() + waitMs, status, cacheKey)
      if (exhausted) throw new ApiError(status)
    }
  }
}
