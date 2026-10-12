import { useEffect, useRef, useState } from 'react'
const prefix = 'riftnote:draft:v1:'
export function discardDraft(key: string) {
  try {
    localStorage.removeItem(prefix + key)
  } catch {
    /* The UI keeps normal saving available. */
  }
}
export function listDraftKeys(): string[] {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length))
  } catch {
    return []
  }
}
export function useDurableDraft<T>(key: string, value: T, dirty: boolean, ready: boolean) {
  const [candidate, setCandidate] = useState<T | null>(null)
  const [loadedKey, setLoadedKey] = useState('')
  const [error, setError] = useState('')
  const written = useRef(false)
  useEffect(() => {
    written.current = false
    setCandidate(null)
    setLoadedKey('')
    if (!key) return
    try {
      const raw = localStorage.getItem(prefix + key)
      if (raw) setCandidate(JSON.parse(raw).value as T)
      setLoadedKey(key)
      setError('')
    } catch {
      setError('下書きを読み込めませんでした。通常の保存を使用してください。')
    }
  }, [key])
  useEffect(() => {
    if (!ready || !key || loadedKey !== key || candidate) return
    try {
      if (dirty) {
        localStorage.setItem(
          prefix + key,
          JSON.stringify({ value, updatedAt: new Date().toISOString() }),
        )
        written.current = true
      } else if (written.current) {
        localStorage.removeItem(prefix + key)
        written.current = false
      }
      setError('')
    } catch {
      setError('下書きを退避できませんでした。ページを保存してください。')
    }
  }, [value, dirty, ready, key, loadedKey, candidate])
  function clear() {
    try {
      if (key) localStorage.removeItem(prefix + key)
      setCandidate(null)
      written.current = false
    } catch {
      setError('下書きを削除できませんでした。')
    }
  }
  function restore(apply: (value: T) => void) {
    if (candidate) {
      apply(candidate)
      setCandidate(null)
      written.current = true
    }
  }
  return { candidate, error, clear, restore }
}
