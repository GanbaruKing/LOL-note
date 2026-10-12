# セキュリティ

RiftNoteは個人用のオフラインNotebookです。メモをクラウドへ送信する機能はありません。League Client連携は同じPCの127.0.0.1に対する読み取り専用通信です。

## 報告

脆弱性は、このリポジトリの **Security → Report a vulnerability** から非公開で報告してください。公開IssueにはAPIキー、Leagueのlockfile、個人のバックアップやDBを添付しないでください。

## 保護と制限

- 画面はsandbox / contextIsolationを有効化し、Node.jsへの直接アクセスを禁止しています。IPCは送信元と入力を検証します。
- 配布版の画面からの通信・フレーム・新しいウィンドウ・画面遷移を制限しています。外部リンクは同梱したHTTPS出典だけを既定ブラウザーで開きます。
- LCUの認証情報はMainプロセスのメモリー内で使用し、IPC・DB・ログに渡しません。自己署名TLS証明書の例外は127.0.0.1への個別リクエストだけに限定しています。
- DB、下書き、バックアップは暗号化されていません。同じWindowsアカウントで動くソフトウェアやPCの管理者からの読み取りを防ぐものではありません。パスワード等を記録しないでください。
- 自動バックアップと削除済み項目にもメモが残ります。共有する場合は内容を確認してください。
- インストーラーは未署名です。GitHub Releasesの配布物とSHA256SUMS.txtを使用してください。チェックサムは発行者の署名の代わりではありません。
- 監査やテストは未知の脆弱性がないことを保証しません。最新リリースを使用してください。

## 0.2.0 公開前確認（2026-10-12）

`npm audit`で開発依存を含む既知の脆弱性は0件、`npm audit --omit=dev`も0件。Electronを44.7.0へ更新しました。`global-agent`はビルド依存内の未修正sprintf-jsを除くため4.1.3に固定し、bootstrap APIの動作とWindows配布ビルドを確認しています。

Electron FusesでRunAsNode、NODE_OPTIONS、Node CLI inspectorを無効化し、ASAR整合性検証とASAR限定ロードを有効化しています。未署名のため、PC上で実行ファイル自体を書き換えられる攻撃者への完全な防御ではありません。

自動テストでHTML文字列の非実行、許可されない外部URLの拒否、別ウィンドウからのIPC拒否、Renderer通信の拒否を確認しました。バックアップの入力検証とトランザクションによる復元もテストしています。

Git履歴のテキストと配布ASARを検査し、典型的な秘密情報や個人DB等の混入を検出していません。この検査は独立した侵入テストや全形式の機密情報検出ではありません。クリーンなWindowsでのインストール・更新・アンインストールは未検証です。

参考: [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)、[Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
