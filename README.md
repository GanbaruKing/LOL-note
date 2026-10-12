# RiftNote

**試用版のダウンロード:** [RiftNote 0.2.0 Pre-release](https://github.com/GanbaruKing/LOL-note/releases/tag/v0.2.0) のAssetsからWindows用exeを選んでください。[試用時の注意](docs/releases/0.2.0.md)・[セキュリティとデータの扱い](SECURITY.md)

試合履歴から対面を自動判定し、振り返りをメモに残せます。[使い方と判定方法](docs/match-history.md)を参照してください。

League of Legendsの対面知識を蓄積する、Windows向けの個人用Notebookです。
試合後の気づきをチャンピオン・相手・Roleごとに保存し、次の対戦前に読み返せます。

![Notebookの画面。表示中のノートはテスト用の例です。](docs/screenshots/notebook.png)

## 0.2.0の改善

- Searchは対面メモ・Champion Notes・共通対策・Notebookの記事・ビルド/ルーンの補足を一括検索。かな・全角・英字大小を吸収し、AND検索、保存場所、一致部分の抜粋、該当箇所への移動に対応。レーン指定時はそのレーンの対面メモ/ビルドのみを検索します。
- Champ Selectは対面決定後、共通対策・対面メモ・保存したビルド/ルーン・Champion Notesを候補一覧より上に表示。Pinは各メモ一覧の先頭に表示します。
- メモ削除直後は「削除を取り消す」。再起動後もSettingsの「削除済みメモ」から個別に復元できます。Notebookの記事はNotebook内の「削除済みの記事」から復元します。
- 起動時・5分ごと・終了時に、保存内容が変わっていれば自動バックアップ。最新20世代を保持し、手動バックアップと復元前の退避は削除しません。失敗は画面上に表示します。
- 対面メモ・Champion Notes・共通対策・ビルド/ルーン・Notebookの未保存内容を端末内に退避。再起動後に復元を選べます。退避はページ保存とは別で、JSONバックアップには含みません。「変更を破棄して移動」やキャンセルでは該当する下書きを破棄します。
- Match Historyの「記入済み」から既存の振り返りメモを開けます。判定は保存済みメモのゲームIDを使用し、タグ/ゲーム情報を外したメモは記入済みの対象外です。
- メモに任意の確認パッチ（例：16.18）を記録できます。編集時に自動で最新扱いにはしません。
- チャンピオン×レーンの共通ビルド/ルーン雛形を保存し、対面へコピーできます。雛形の更新はコピー済み対面を変更しません。
- CDは1秒未満の正の値も表示。変身・発射間隔・同じ対象への再使用制限などを個別に補足し、公式カタログのスキル説明を展開できます。0など固定CDを確定できない値は「固定CD未収録」です。試合中の残り時間や全形態を再現する機能ではありません。
- 保守のためチャンピオン選択・設定画面・下書き退避・バックアップ・検索の共通処理を分離しました。

データをまとめて更新するには `npm run data:update`。特定パッチは `npm run data:update -- --version 16.18.1`。全ダウンロードと整合性確認後に反映し、通信失敗時は元のカタログを維持します。旧アイテムは保存済みビルド用に残し、新規選択から除外します。ルーン構成が非互換になった場合は明示的な移行を要求して更新を停止します。レーン分類・初期カウンターメモは別途確認が必要です。

DBはv7、バックアップはv4です。旧v1〜v3のバックアップを読めますが、旧形式にない雛形・削除済みメモ・確認パッチは空になります。新形式は旧アプリへ取り込めません。詳しくは[改善機能の操作と検証](docs/improvements.md)。

## 主な機能

- ノートブック：チャンピオンと独立した章・記事、自動保存、全文検索、お気に入り。他画面と統一したダークデザイン。[使い方](docs/knowledge-book.md)

- 173体のチャンピオンを日本語・英語で検索して選択
- 自分 × 相手 × RoleごとのMatchupページ
- メモの追加・編集・削除、履歴メモの振り返りタグ
- 5段階評価
- 保存済みMatchup一覧とChampion / Role検索
- SQLite永続化。League Clientもネット接続も不要
- 未保存変更の確認、保存失敗時の入力保持
- Libraryでチャンピオン単体のメモを追加・編集・削除
- Libraryの「チャンピオン名＋対策」に敵としての対策を記入し、Match upでその敵を選ぶと自動表示
- 出典付き初期カウンターメモ：5レーンに対応、167体・197組の候補と短い理由を同梱。[選定基準・未収録範囲](docs/curated-counters.md)
- チャンピオン詳細に、保存済みの対面メモを本文付きで一覧表示
- カード形式のChampion一覧から詳細を開く
- レーン別Champion Poolへの登録・解除、自信度1〜5の保存
- Libraryからチャンピオンごとの対面メモをレーンで絞り込み
- Comfort Picks：敵チャンピオン・レーンごとの候補をマッチアップの「自分の評価」順に表示
- メモ横断検索：日英Champion名・本文・保存場所、スペース区切りAND検索
- 単体メモ・対面メモのPinと上位表示
- LCU自動接続・Champion Select検知、Role・確認できる敵Pickの取得
- 手動の対面選択から、同じComfort Picksと保存済みメモを参照
- Match Historyから最近の試合を表示し、Role・対戦相手の自動判定から対面メモを作成

初期データに個人メモは挿入しません。画像のメモはE2Eテストで入力した例です。

## Windows版のインストール

`RiftNote-Setup-0.2.0-x64.exe` を実行し、画面に従ってインストールします。Windows x64向けです。Node.jsやnpmは不要で、スタートメニューまたはデスクトップの「RiftNote」から起動できます。

現在のビルドは署名なしです。Windowsの警告が表示される場合があります。インストーラーの作成方法と検証範囲は[配布手順](docs/release.md)を参照してください。GitHub Releaseへの公開はまだ行っていません。

既存データは `%APPDATA%/lol-matchup-companion/notebook.sqlite` を引き継ぎます。更新やアンインストールで個人データを削除しません。

## 開発用の起動手順

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

`npm run dist` で `dist/` にWindows x64インストーラーを生成します。

## 使用方法

Match up左側の「Recommended Picks」は折りたたみ可能で、Comfort Picksの上に表示します。中央にはビルド・ルーン、共通対策、対面メモを配置しています。Comfort Picksも折りたためます。Libraryは見出しとレーン選択を残し、「TOPのプール」などの登録一覧だけを折りたためます。開閉状態は自動保存し、アプリを再起動しても前回の状態を保持します。

チャンピオン検索はひらがな・カタカナ・全角英字に対応。Match upの選択欄では↑↓で候補を選び、Enterで決定、Escで閉じられます。Libraryの検索・レーン・スクロール位置は詳細から戻っても保持します（アプリ終了まで）。カウンター候補の「このピックでメモを開く」から、その候補×相手×レーンの対面ページへ移動できます。

1. Match up上部で自分のチャンピオン・相手・Roleを選択する。
2. メモやビルド・ルーンを編集し、上部の「ページの変更を保存」でまとめて保存する。Ctrl + S、メモ欄のCtrl + Enterでもページ全体を保存できる。既存メモは「編集」でそのカード内を直接編集する。「キャンセル」は新規入力・既存メモの編集だけを取り消し、他の欄の入力を残す。Champion詳細も同じ操作。
3. ノートの「編集」「削除」から管理する。
4. 保存したメモはSearchやLibraryの対面メモ一覧からも開けます。

Libraryではカード一覧からチャンピオンを選ぶと、そのチャンピオン自身のメモを直接編集できます。対面やRoleを選ぶ必要はありません。下のMatchup Notesには、そのチャンピオンを自分のPickとして記録した対面メモが並びます。「チャンピオン一覧に戻る」でカード一覧へ戻れます。

一覧上部のFavorite Picksでレーンを選び、カードの「レーンに登録」からプールへ追加します。同じチャンピオンを複数レーンへ登録でき、自信度はレーンごとに1〜5で保存します。初期値は3です。「解除」は該当レーンのプールから外す操作で、メモは削除しません。レーンは自分の登録を表し、ゲーム全体での推奨レーンを自動分類するものではありません。

Match up左側のFavorite Picksには、選択中のRoleに登録したチャンピオンを自信度順に表示します。クリックすると相手とRoleを保ったまま自分のチャンピオンを切り替えます。「プールを編集」から同じRoleの登録画面へ移動できます。

![カード一覧とレーン別プール](docs/screenshots/champion-library.png)

![チャンピオン単体のメモと対面メモ一覧](docs/screenshots/champions.png)

星を再度クリックすると評価を解除できます。データはOSのアプリ保存フォルダーにある `notebook.sqlite` に保存します。具体的なパスはSettingsに表示します。クラウド同期はありません。

### バックアップ・復元

Settingsの「バックアップを保存」で、ノートブックの章と記事・対面メモ・Champion Notes・チャンピオン対策・評価・Pin・Favorite Picks・Comfort PicksをJSONへ保存できます。

「バックアップから復元」は現在の内容を置き換えます。確認後、復元前のデータを保存先フォルダー内の `backups/` に自動退避します。不正なファイルや書き込み失敗時は既存データを保持します。Leagueのフォルダー設定、履歴、認証情報は対象外です。[形式と復元の詳細](docs/backup.md)。

![バックアップ設定。表示パスは説明用の例です。](docs/screenshots/backup.png)

### ビルド・ルーン

Match upの「ビルド・ルーン」でアイテムをアイコンから選び、購入順に追加します。「すべて／ファイター／マークスマン／アサシン／メイジ／タンク／サポート」で絞り込み、名前検索と併用できます。複数の分類を持つアイテムは各タブに表示します。上から「素材・初期・消耗品」「中間アイテム」「完成アイテム」に分け、各段は合計価格の安い順です。価格はアイコンの下にも表示します。素材や消耗品を含め最大24個、左右ボタンで並べ替えできます。ビルド・ルーンは見出しでまとめて開閉します。ルーンは左にメイン、右にサブと能力値シャードを並べた縦型の選択画面です。系統を選び、各段の丸いアイコンから選択します。名前と説明はアイコンにマウスを重ねて確認できます。サブルーンは異なる段から2個まで選択します。途中までの選択も保存できます。

各欄に補足メモを書き、上部の「ページの変更を保存」で編集中の対面メモと一緒に、自分×相手×Roleごとに保存します。既存の「ビルド・ルーンを保存」「メモを保存」ボタンもページ全体を保存します。Champion詳細も、メモと共通対策をまとめて保存できます。保存失敗時は全項目の入力を保持し、一部だけ保存されることはありません。未保存のまま移動すると確認します。Notebookの自動保存、評価・Pin・削除・プール・Comfort Picksの即時反映は従来どおりです。

ビルド・ルーンはバックアップ対象です。カタログとアイコンはData Dragon 16.18.1を同梱し、オフライン対応。アイテム更新は `npm run data:loadout`、分類更新は `npm run data:item-categories` です。分類は同パッチのゲーム内 `mItemAttributes` を[CommunityDragon](https://raw.communitydragon.org/16.18/game/items.cdtb.bin.json)から取得して同梱しています。分類のないアイテムも「すべて」では選べます。

### チャンピオン対策

Libraryでチャンピオンを選び、Champion Notesの下にある「Darius対策」などの欄に対策を記入して保存します。自分がAatroxでもGarenでも、Dariusが敵に選ばれるとMatch upのMy Notesの上に「Darius対策」として表示されます。Roleにも依存しません。

最大10,000文字で、Ctrl + Enterでも保存できます。空欄で保存すると共通対策を削除します。Champion Notesとは別に保存され、両方を編集中でも片方の保存で他方の入力は消えません。

![敵チャンピオンへの共通対策（テストデータ）](docs/screenshots/matchup-counters.png)

### Comfort Picks・Search・Pin

対面見出しの評価欄横にある「Comfort Picksに追加」で、表示中の自分Champion・相手・レーンを登録します。左側のComfort Picksから得意な対面を選べます。マッチアップの「自分の評価」を参照して星を表示し、評価の高い順（未評価は末尾）に並びます。メモのPinボタンで重要な情報を上に置けます。Searchから本文も含めて検索できます。レーンを指定すると、そのレーンの対面メモが対象になり、レーンに属さない単体メモは除外します。

### Champ Select

League Clientが起動していれば自動接続します。接続できない場合はSettingsからLeagueClient.exeのあるフォルダーを指定してください。APIキーは不要です。

Champion Select Activeの通知から画面を開き、対面だと思う敵Championを自分で選択します。自分のPickとRoleが未確定なら手動で指定できます。Comfort Picksをクリックすると候補Championのメモをプレビューできます。ゲーム側のPickやロック操作は行いません。

敵Pick・自分のPick・レーンを選ぶと、画面上部の「Match upを開く →」から選択中の対面ページへ移動できます。メモがまだない対面でも、ビルド・ルーンやメモを編集できます。

編集中のNotebookを自動で切り替えません。切断・Select終了・敵Pick変更時は古い対面表示をクリアします。

![疑似LCUを使ったChamp Select画面](docs/screenshots/champ-select.png)

実際のLeague Clientに接続し、Champion Select外のphase取得を確認済みです。Champion Select中の遷移はローカルHTTPS疑似LCUで検証し、実際の選択画面で自動検知が動いたとのユーザー報告もあります。

### Match History

League ClientへログインしてMatch Historyを開き、最近の試合を選択します。履歴と序盤の位置・CS・サモナースペルからRoleと対戦相手を自動判定します。必要なら修正し、「この対面のメモを書く」から気づきを追記して保存します。新規メモには「振り返り」タグを付け、日付（時刻なし）とゲームIDを本文とは別の情報欄に表示します。

直近20試合のうちサモナーズリフトの試合が対象です。履歴取得にはLeague Clientが必要ですが、保存したメモはオフラインでも読めます。判定できない場合はRoleと相手を選べます。[判定の詳細と検証範囲](docs/match-history.md)。

![試合履歴の画面。テストデータを表示しています。](docs/screenshots/match-history.png)

## 開発・検証

```powershell
npm run build
npm test
npm run lint
npm run test:e2e
git diff --check
```

E2EはElectronウィンドウを起動します。テスト用DBは `.test-data` に作成し、通常のノートとは分離します。`docs/screenshots/notebook.png` はテストで再生成されます。

LCU E2EはGit for Windows同梱のOpenSSL（他OSはPATH上のopenssl）で一時証明書を生成します。実クライアントには接続せず、テスト用HTTPSサーバーだけで検証します。証明書・lockfile・テストDBはGit対象外です。

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
- [LCUの構造・接続・検証範囲](docs/lcu.md)

## Git運用

大きな機能は `feature/*` で実装します。mainには起動可能な検証済みコードを統合します。
機能完成時はBuild / Test / Lint / Git diffを確認し、意味のある変更単位でコミットします。
APIキー、LCU認証情報、`.env`、個人DBはコミットしません。このPhaseはAPIキー不要です。

## Assets

Champion名・画像は [Riot Games Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon) を利用しています。
RiftNote is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.

All Championsはレーンタブと名前検索を組み合わせて絞り込めます。レーン分類は同梱データを使用し、分類未収録のチャンピオンはAllに表示します。分類元：[Meraki Analytics](https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json)。

### メモとMatch Historyの振り返り

メモのカテゴリー選択・カテゴリー検索は廃止し、履歴から作成したメモにだけ「振り返り」タグを表示します。日付とゲームIDは本文から分けて一つの小さな情報欄に表示します。本文の先頭でBackspaceを1回押すと、この情報欄と「振り返り」タグをまとめて削除できます。Ctrl+Zでタグも含めて復元、Ctrl+Shift+Z / Ctrl+Yでやり直せます。本文の編集も操作順に戻せます。削除ボタンはありません。本文は残り、変更はページ保存で確定します。Undo履歴は保存・キャンセル・メモの切替でリセットされます。

以前の自動入力形式（日付と試合IDの2行）も、振り返りメモであれば読み出し時に分離して表示します。一般の本文を自動で削除・書き換えたり、個人データを一括移行したりしません。既存バックアップとの互換性のため、内部のカテゴリー値と保存形式は維持しています。

### Libraryの対面メモと試合中の参照

LibraryのMatchup Notesにはメモがある対面だけを表示し、相手チャンピオンの英語名A–Z順に並べます。専用検索欄で相手の英語名・日本語名・メモ本文を検索でき、レーン絞り込みとも併用できます。

Champ Selectは、ピック画面で取得した情報を試合開始後も保持してメモを参照できます。試合中は最後に取得したPick情報を表示し、ロビーなどへ戻るとリセットします。ピック画面を取得していない試合途中のアプリ起動や、接続切断・取得失敗後の情報復元には未対応です。
