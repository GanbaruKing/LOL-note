# Windows配布

## ビルド

Windows x64、Node.js 24以降、npmを用意する。

```powershell
npm ci
npm run dist
```

`dist/LOL-Note-Setup-0.1.0-x64.exe` がインストーラー、`dist/win-unpacked/LOL Note.exe` が展開済みアプリ。初回はElectron・NSISのダウンロードが必要。利用者のPCにはNode.js不要。

electron-builder 26.15.3 + NSISの案内付きインストーラーを使用。ユーザー単位でインストールし、インストール先を選べる。デスクトップ・スタートメニューにLOL Noteのショートカットを作る。アプリの保存先は旧名の `lol-matchup-companion` を維持し、アンインストールでも消さない。

同梱対象は `out/`、package情報、LICENSEと実行時依存。開発ツール・統計収集データ・APIキー・個人DBは含めない。アプリ独自のNアイコンを使用。自動更新・自動公開は設定していない。

## リリース確認

```powershell
npm test
npm run lint
npm run test:e2e
npm run dist
git diff --check
Get-FileHash dist/LOL-Note-Setup-0.1.0-x64.exe -Algorithm SHA256
```

生成物をGitにコミットしない。配布時はインストーラーとSHA256をリリースへ添付する。現時点は署名なし。公開配布の前にコード署名証明書の設定と、クリーンなWindows環境でインストール・更新・アンインストールを確認する。

## 採用理由

既存のelectron-vite出力をそのまま梱包でき、NSISのユーザー単位インストールとショートカット作成が使えるためelectron-builderを採用した。設定は [electron-builder v26 NSIS](https://www.electron.build/v26/docs/nsis/) に基づく。SQLiteはNode組み込みを使い、ネイティブアドオンの再ビルドは不要。

## 2026-09-16の検証結果

- Build / Lint / Git diffチェック成功。29 unit tests、10 E2E成功。設定画面の最終調整後にバックアップE2Eを再実行して成功。
- 配布用exeを直接起動し、isPackaged、LOL Noteの製品名、Settings、IPCと同梱173体のカタログを確認。個人メモの編集は行っていない。
- app.asarの275エントリーを確認し、個人DB・.env・統計収集データ・テストコードが同梱されていないことを確認。
- インストーラー生成成功。SHA256はdist/SHA256SUMS.txtに保存。署名は未付与。
- クリーンなWindows環境でのインストール・更新・アンインストールとショートカットの実操作は未検証。

### 統計機能削除後の再検証

統計画面・IPC・取り込み・収集CLIを削除。Build / Lint / 23 unit tests / 9 E2E / Git diffチェック成功。統計を含まないインストーラーを再生成し、梱包済みMain/Preloadから統計APIがなくなったことを確認した。SHA256SUMS.txtも更新済み。

### 初期カウンターメモ追加後の再検証

167体・197組の静的メモを同梱。24 unit tests / 10 E2E / Build / Lint成功。候補の最終修正後にデータテストと配布ビルドを再実行した。app.asarの275エントリーを検査し、出典API・根拠データの同梱と、個人DB・.env・調査用ファイル・テストコードの除外を確認。インストーラーとSHA256SUMS.txtを更新。今回の配布exeそのものの起動・インストール試験は未実施。

### 2026-09-22 操作改善

メモへの固定ボタン、Libraryの検索条件・戻る位置の保持、かな/全角検索、キーボードでのPick選択、カウンター候補からの対面ページ移動を追加。24 unit tests成功。11 E2Eを実行し、検索条件保持に合わせた既存テストの修正後、該当テストと新規操作テストを再実行して成功。最終調整後も1000×720で入力欄全体が表示されること、横スクロールが発生しないことを確認した。Build / Lint成功。既存DBの形式変更はない。配布版のインストール・更新の実操作は未検証。

続く表示整理で、敵を主役にした見出しへ変更。重複するPick変更ボタン、難易度選択、Library側の初期カウンター、ナビのMatch up件数を削除。11 E2E / Build / Lint成功。既存データは保持し、難易度の保存形式もバックアップ互換性のため維持する。

### 2026-09-23 ノートブック試作

画面限定の明るいテーマ、章・記事の整理、書式付き閲覧、自動保存、検索、お気に入りを追加。26 unit tests成功。既存11 E2Eに加え、ノートブックの作成・保存失敗・再試行・再起動・章削除を検証した。Backup v2に新しい内容を含め、v1の読み込みとトランザクション失敗時のロールバックも確認。Build / Lint成功。1000×720でも横にはみ出さないことを確認。DB schemaはv5を維持。配布exeのインストール・更新の実操作は未検証。
