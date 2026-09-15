# 設計判断

## 001: Notebookを先に完成させる

LCUはPhase 3で追加する。Phase 1ではLeague Clientの検知も行わない。画面のOFFLINE READYはローカル保存可能という意味で、LCUの接続成功を意味しない。

## 002: SQLiteの所有者はMainのみ

Node組み込みSQLiteを採用し、ネイティブアドオン再ビルドを避ける。同期SQLは小規模なノート処理に限定する。busy_timeoutは3秒。保存できなければRendererに失敗を返し、入力を保持する。ロック競合はE2Eで検証する。

## 003: 開発ビルドはelectron-vite

開発ビルドにelectron-vite、Windows配布にelectron-builder 26.15.3とNSISを採用。既存のout出力を梱包し、ユーザー単位のインストールとショートカットを作成する。Vite / TypeScriptは周辺ツールが対応するメジャーを選び、package-lock.jsonで固定する。最新メジャーを無条件に組み合わせない。

## 004: 同梱カタログ

Data Dragonの数値keyを主キーにし、173体のカタログとアイコンを同梱する。カタログ更新は `npm run data:refresh` で開発者が行う。アプリ起動時に最新情報を取得しない。カタログから消えたIDもDBから削除せず、既存メモを保護する。

## 005: Git運用

ユーザー指定の `feature/notebook` を使用する。初期リポジトリはコミットのないmasterだったため、壊れた仮実装をmainに置かず、Phase 1完成までmainは作成しない。完成後の統合は検証済みコミットを対象とする。GitHubリモートの作成・push・公開は別途設定する。

## 006: IPCとコンテンツ保護

contextIsolation=true / sandbox=true / nodeIntegration=false。トップフレームと送信元ウィンドウ・URLを確認する。新規ウィンドウ・ナビゲーション・権限要求を拒否する。CSPを設定し、メモはテキストとして描画する。開発時のみReact Refreshに必要なインラインスクリプトを許可し、productionのCSPには含めない。

## 007: Phase 2 / 3を先に完成させる

UIの細部は後で調整する方針に従い、My Picks・検索・Pin・LCUを追加した。LCUは参照だけに限定し、Pick・Ban・ロックの自動操作を実装しない。Select開始時はバナーを表示し、編集中のNotebookを強制的に切り替えない。

LCUの更新は順次ポーリングを採用。WebSocket再接続の複雑さを避け、小さな読み取り専用機能を先に完成させる。2秒周期の遅延は許容し、必要なら将来イベント購読に置き換える。
