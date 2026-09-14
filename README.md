# LoL Matchup Companion

League of Legendsの対面知識を蓄積する、Windows向けの個人用Notebookです。
試合後の気づきをチャンピオン・相手・Roleごとに保存し、次の対戦前に読み返せます。

![Notebookの画面。表示中のノートはテスト用の例です。](docs/screenshots/notebook.png)

## 現在の実装 — Phase 1

- 173体のチャンピオンを日本語・英語で検索して選択
- 自分 × 相手 × RoleごとのMatchupページ
- メモの追加・編集・削除、任意カテゴリー
- 難易度・5段階評価
- 保存済みMatchup一覧とChampion / Role検索
- SQLite永続化。League Clientもネット接続も不要
- 未保存変更の確認、保存失敗時の入力保持
- Championsでチャンピオン単体のメモを追加・編集・削除
- チャンピオン詳細に、保存済みの対面メモを本文付きで一覧表示
- カード形式のChampion一覧から詳細を開く
- レーン別Champion Poolへの登録・解除、自信度1〜5の保存
- 対面メモ／最近更新した一覧のレーン絞り込みと両Championのアイコン表示

初期データに個人メモや統計サンプルは挿入しません。画像のメモはE2Eテストで入力した例です。
LCU連携、My Picks、全文検索、統計、試合履歴、Installerは未実装です。

## 起動手順

Windows、Node.js 24以降、npmが必要です。初回の依存取得にはネット接続を使用します。

```powershell
npm ci
npm run dev
```

ビルド済みのアプリを起動する場合：

```powershell
npm run build
npm start
```

現段階は開発用の起動方式です。配布用exe / Installerはまだ生成しません。

## 使用方法

1. Match up上部で自分のチャンピオン・相手・Roleを選択する。
2. 「新しいメモ」に入力して保存する。Ctrl + Enterでも保存できる。
3. ノートの「編集」「削除」から管理する。
4. 保存済みの対面は左のMy Matchupsから開く。

Championsではカード一覧からチャンピオンを選ぶと、そのチャンピオン自身のメモを直接編集できます。対面やRoleを選ぶ必要はありません。下のMatchup Notesには、そのチャンピオンを自分のPickとして記録した対面メモが並びます。「チャンピオン一覧に戻る」でカード一覧へ戻れます。

一覧上部のMy Champion Poolでレーンを選び、カードの「レーンに登録」からプールへ追加します。同じチャンピオンを複数レーンへ登録でき、自信度はレーンごとに1〜5で保存します。初期値は3です。「解除」は該当レーンのプールから外す操作で、メモは削除しません。レーンは自分の登録を表し、ゲーム全体での推奨レーンを自動分類するものではありません。

![カード一覧とレーン別プール](docs/screenshots/champion-library.png)

![チャンピオン単体のメモと対面メモ一覧](docs/screenshots/champions.png)

星を再度クリックすると評価を解除できます。データはOSのアプリ保存フォルダーにある `notebook.sqlite` に保存します。具体的なパスはSettingsに表示します。バックアップはアプリ終了後にこのファイルをコピーしてください。クラウド同期はありません。

## 開発・検証

```powershell
npm run build
npm test
npm run lint
npm run test:e2e
git diff --check
```

E2EはElectronウィンドウを起動します。テスト用DBは `.test-data` に作成し、通常のノートとは分離します。`docs/screenshots/notebook.png` はテストで再生成されます。

```powershell
npm run format
npm run data:refresh
```

`data:refresh` はRiot公式Data Dragonから最新カタログとアイコンを取得します。取得済みバージョンは `resources/champions.json` に記録します。更新後は差分・テストを確認してコミットしてください。

## 技術と構成

TypeScript / React / Electron / SQLite / Vite / CSS。型契約、実行時入力検証、トランザクションで個人ノートを保護します。

```text
src/main/         Electron起動、限定IPC、SQLite Repository
src/preload/      window.notebookのAPI公開
src/shared/       型定義と入力検証
src/renderer/     React Notebook画面
resources/        Champion ID・日英名の同梱カタログ
public/champions/ 同梱アイコン
scripts/          Data Dragon更新
tests/            Repository統合テスト、Electron E2E
docs/             設計理由、実装計画、画面
```

- [初期調査とPhase計画](docs/plan.md)
- [Architectureと責務](docs/architecture.md)
- [DB設計](docs/database.md)
- [技術選定とGit運用](docs/decisions.md)
- [Notebookの流れとテスト](docs/notebook.md)

## Git運用

大きな機能は `feature/*` で実装します。mainには起動可能な検証済みコードを統合します。
機能完成時はBuild / Test / Lint / Git diffを確認し、意味のある変更単位でコミットします。
APIキー、LCU認証情報、`.env`、個人DBはコミットしません。このPhaseはAPIキー不要です。

## Assets

Champion名・画像は [Riot Games Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon) を利用しています。
LoL Matchup Companion is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.
