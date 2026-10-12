import { setTimeout as delay } from 'node:timers/promises'
export async function fetchData(url, options) {
  let failure
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) })
      if (response.ok || (response.status < 500 && response.status !== 429)) return response
      failure = new Error(`HTTP ${response.status}: ${url}`)
    } catch (error) {
      failure = error
    }
    if (attempt < 2) await delay(500 * (attempt + 1))
  }
  throw failure
}
