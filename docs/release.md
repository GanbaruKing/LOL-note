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
