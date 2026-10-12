import type { Result } from '../../shared/contracts'
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new Error(result.error)
  return result.data
}
