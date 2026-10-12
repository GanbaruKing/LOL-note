import { useEffect, useState } from 'react'
import type { Champion, TrashNote } from '../../shared/contracts'
import NoteContent from './NoteContent'
export default function ProtectionPanel({
  champions,
  onRestored,
}: {
  champions: Champion[]
  onRestored: () => void
}) {
  const [trash, setTrash] = useState<TrashNote[]>([])
  const [protection, setProtection] = useState<{
    directory: string
    lastBackup: string | null
    error: string
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function refresh() {
    try {
      const [t, p] = await Promise.all([
        window.notebook.listTrash(),
        window.notebook.getProtectionStatus(),
      ])
      if (!t.ok) throw new Error(t.error)
      if (!p.ok) throw new Error(p.error)
      setTrash(t.data)
      setProtection(p.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保護状態を読み込めませんでした。')
    }
  }
  useEffect(() => {
    void refresh()
  }, [])
  return (
    <section aria-label="データ保護">
      <h3>自動バックアップ</h3>
      <p>起動時・5分ごと・終了時に、変更がある場合だけ保存します。最新20世代を保持します。</p>
      <p className="muted">
        同じPC内のバックアップです。PC故障への備えには、手動で別の保存先にも書き出してください。
      </p>
      <p role="status">
        {protection?.lastBackup
          ? `最終バックアップ：${new Date(Number(/auto-(\d+)-/.exec(protection.lastBackup)?.[1])).toLocaleString('ja-JP')}`
          : 'バックアップを確認中…'}
      </p>
      {(error || protection?.error) && (
        <p role="alert" className="error-banner">
          {error || protection?.error}
        </p>
      )}
      <button
        onClick={async () => {
          const r = await window.notebook.openBackupFolder()
          if (!r.ok) setError(r.error)
        }}
      >
        自動バックアップのフォルダーを開く
      </button>
      <details>
        <summary>削除済みメモ（{trash.length}件）</summary>
        <p>復元すると元の対面・チャンピオンへ戻します。</p>
        {trash.map((t) => (
          <article className="note-card" key={t.id}>
            <strong>
              {champions.find((c) => c.id === t.championId)?.name}
              {t.key
                ? ` vs ${champions.find((c) => c.id === t.key?.enemyChampionId)?.name} · ${t.key.role}`
                : ' · Champion Notes'}
            </strong>
            <small>削除日時：{new Date(t.deletedAt).toLocaleString('ja-JP')}</small>
            <NoteContent note={t.note} />
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError('')
                try {
                  const r = await window.notebook.restoreTrash(t.id)
                  if (!r.ok) throw new Error(r.error)
                  await refresh()
                  onRestored()
                } catch (e) {
                  setError(e instanceof Error ? e.message : '復元できませんでした。')
                } finally {
                  setBusy(false)
                }
              }}
            >
              このメモを復元
            </button>
          </article>
        ))}
      </details>
    </section>
  )
}
