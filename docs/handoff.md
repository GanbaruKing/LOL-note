# 次の開発への引き継ぎ

更新: 2026-09-16。製品名は **LOL Note**。

## ユーザー方針

- 統計収集は後回し。明示的に再開を依頼されるまで、追加収集・最適化・JSON v2接続を進めない。既存の実装・データは保持する。
- 現在はWindowsアプリ本体を開発。今回、インストーラー、バックアップ・復元、Git・README整理をまとめて進めることが承認された。
- mainは起動可能に保ち、大きな変更はfeature branch。完成時はBuild・Test・Lint・Git diffを確認する。
- APIキーを含むtools/stats/.envや取得データ、個人DBは読んだりGitに追加したりしない。

## Gitと実行

- Repository: https://github.com/GanbaruKing/LOL-note
- 今回の作業ブランチ: feature/windows-release-backup。直前のUI変更8105fb6から分岐。
- mainへの統合準備として変更をコミットする。push・GitHub Release公開は行わない。
- 続ける前にgit status / git log / git branchを確認する。古いmainから直近のUI変更を落とさない。
- Node.js 24以降。npm ci → npm run dev。配布版はnpm run dist。

## 現在の機能

Electron / React / TypeScript / node:sqlite。ノートはオフラインで利用できる。

- Match up: 自分×敵×Roleのメモ、カテゴリー、難易度、評価、Pin。
- Champion Library: 日英検索、レーン別表示、Champion Notes、対面メモ一覧、Champion Pool。
- 敵チャンピオンへの対策: Champion Notesとは独立した1体1文章。「Darius対策」のように表示し、Match upで敵に選ぶと表示。最大10000文字、空欄保存で削除。未保存入力は別々に保護する。
- Match up左側はFavorite Champions。現在Roleのプールを自信度順に表示し、自分のチャンピオンだけ切り替える。「プールを編集」で同じRoleのLibraryを開く。
- Comfort Picks: 敵×Roleごとの得意ピック。空表示は「敵チャンピオン名に対して得意なピックを追加しましょう。」。評価順という説明文は表示しない。
- Search: Champion Notesと対面メモの横断検索。対策欄は検索対象外。
- LCU: 読み取り専用の接続、Champ Select検知、自分のhover/確定Pick、敵Pick参照。ゲーム側操作は行わない。
- Match History: 最近20試合のうちサモナーズリフト。履歴と序盤の位置・CS・Smiteから対面を推定し、修正可能。試合情報を通常の対面メモへ渡す。履歴DB・キャッシュ・記入済み管理は未実装。
- 統計JSON v1の表示はChamp Selectのみ。独立CLIのJSON v2は未接続。
- Settings: JSONバックアップ・復元。メモ、対策、評価、Pin、プール、Comfort Picksが対象。復元前に自動退避し、単一トランザクションで置換。不正データはロールバック。ローカルのLeague設定と統計は対象外。
- Windows x64 NSISインストーラー: npm不要、スタートメニュー・デスクトップショートカット、専用Nアイコン。署名なし、自動公開・自動更新なし。

## 保存先と境界

- 製品名変更後もuserData/sessionDataは %APPDATA%/lol-matchup-companion。既存notebook.sqliteを継続使用する。
- DB schema v5。今回バックアップ追加に伴うDB移行はない。
- MainのみDB・ファイル・LCU認証を扱う。preloadは限定API。送信元URL・フレーム検証、sandbox/contextIsolation、CSPを維持する。
- バックアップ仕様: docs/backup.md。配布手順: docs/release.md。
- リリース梱包対象はout、package情報、LICENSE、実行時依存のみ。distはGit対象外。

## 検証と今後

npm test（29件）、npm run lint、npm run test:e2e（10件）、npm run dist、git diff --checkで確認する。E2Eは専用DB・疑似LCUを使用する。スクリーンショットはテストデータ。

次に残るのはクリーンなWindowsでのインストール・更新・アンインストール試験、公開配布に向けたコード署名、必要ならGitHub Release公開。統計収集は引き続き保留。機能面では履歴の記入済み管理や対策欄の検索対応が候補だが未着手。
