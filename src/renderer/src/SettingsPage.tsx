import { useState } from 'react'
import { unwrap } from './apiResult'
import ProtectionPanel from './ProtectionPanel'
import type { Champion, LcuState } from '../../shared/contracts'
export default function SettingsPage({
  champions,
  info,
  lcu,
  busy,
  setBusy,
  setError,
  onRestored,
}: {
  champions: Champion[]
  info: { databasePath: string; catalogVersion: string } | null
  lcu: LcuState
  busy: boolean
  setBusy: (value: boolean) => void
  setError: (value: string) => void
  onRestored: () => Promise<void>
}) {
  const [backupStatus, setBackupStatus] = useState('')
  return (
    <section className="settings-panel panel">
      <h2>ローカルデータ</h2>
      <ProtectionPanel
        champions={champions}
        onRestored={() => {
          void onRestored()
        }}
      />
      <h3>バックアップ・復元</h3>
      <p>
        メモ・Notebookの章と記事・対策・評価・Favorite Picks・Comfort
        Picks・ビルド・ルーン・雛形・削除済みメモをJSONに保存します。復元は現在の内容を置き換え、復元前のデータは自動退避します。
      </p>
      {(['exportBackup', 'restoreBackup'] as const).map((operation) => (
        <button
          key={operation}
          className="primary"
          style={{ marginRight: 12, marginBottom: 8 }}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            setBackupStatus('')
            try {
              const path = await unwrap(window.notebook[operation]())
              if (path) {
                if (operation === 'restoreBackup') {
                  await onRestored()
                }
                setBackupStatus(
                  operation === 'exportBackup'
                    ? `保存しました：${path}`
                    : `復元しました。復元前のバックアップ：${path}`,
                )
              }
            } catch (e) {
              setError((e as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          {operation === 'exportBackup' ? 'バックアップを保存' : 'バックアップから復元'}
        </button>
      ))}
      <p role="status" aria-label="バックアップ処理結果" style={{ overflowWrap: 'anywhere' }}>
        {busy ? '処理中…' : backupStatus}
      </p>
      <hr />
      <p>メモはこのPCのSQLiteデータベースへ保存されます。</p>
      <label>保存先</label>
      <code>{info?.databasePath ?? '読み込み中…'}</code>
      <label>Champion Data</label>
      <p>
        Data Dragon {info?.catalogVersion} · {champions.length} champions
      </p>
      <p>チャンピオン名とアイコンは同梱済みです。Notebookはインターネットなしで利用できます。</p>
      <h2>League Client連携</h2>
      <p>{lcu.message}</p>
      <p>
        自動接続できない場合はLeagueClient.exeがあるフォルダーを選択してください。クライアント起動中に生成されるlockfileを読み取ります。
      </p>
      <button
        className="primary"
        onClick={async () => {
          try {
            const r = await window.notebook.selectLeagueFolder()
            if (!r.ok) setError(r.error)
          } catch {
            setError('フォルダーを選択できませんでした。')
          }
        }}
      >
        Leagueのフォルダーを選択
      </button>
      <hr />
      <h2>Match History</h2>
      <p>
        League
        Clientへログインすると、最近の試合から対面メモを書けます。保存したメモはオフラインでも読めます。クラウド同期はありません。
      </p>
      <p className="muted">
        RiftNote is not endorsed by Riot Games. League of Legends and its assets are trademarks of
        Riot Games.
      </p>
    </section>
  )
}
