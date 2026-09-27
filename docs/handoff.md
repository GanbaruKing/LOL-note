# 次の開発への引き継ぎ

## 最新：アイテム順と大きな透過R（2026-09-27）

- アイテム候補は素材・初期・消耗品 → 中間 → 完成の順、各段は合計価格の昇順、同額はID順。購入順の保存データは並べ替えない。
- item-categories.jsonにtiersを追加。ゲームデータのepicnessを使用（4=中間、5以上=完成、その他=素材・初期、Consumable/Trinketは先頭）。Vision属性だけで消耗品にしない（アンブラル グレイブ等は完成品）。
- アイコンは②の意匠を簡略化した背景透過のR単体。大きく見えるよう余白を減らし、画面内ロゴも48pxに変更。
- 検証：テスト30件、loadout E2E（段階・価格順を追加）、lint、型チェック、build、dist、diff check成功。PNGの角のalpha=0、配布EXEの小サイズRアイコンを確認。インストーラーとSHA256SUMS更新済み。再インストール・push・公開はしていない。
- 個人Comfort Picks・保存済みメモ・ビルドには変更を加えていない。

## 前回：アイコンとアイテム分類（2026-09-27）

- 採用アイコンは②「Riftの亀裂」。生成済み画像をbuild/icon.pngとpublic/icon.pngへ配置。サイドバー・ウィンドウ・配布アイコンに使用。
- アイテム選択は「すべて／ファイター／マークスマン／アサシン／メイジ／タンク／サポート」で絞り込み。検索と併用でき、分類切替は保存済み購入順に影響しない。
- resources/item-categories.jsonはCommunityDragon 16.18のgame/items.cdtb.bin.jsonのmItemAttributes由来。1=Fighter、2=Marksman、4=Assassin、8=Tank、16=Mage、32=Support。複数分類対応、未分類は「すべて」で表示。既存アイテムの追加・削除・価格変更なし。
- 更新コマンド npm run data:item-categories。同梱loadout.jsonと同パッチに固定。分類更新は個人DBに触れない。
- 検証：テスト29件、loadout E2E（分類切替・検索併用・複数分類・保存・アイコン描画）、lint、型チェック、build成功。配布EXEから抽出したアイコンも②に更新されたことを目視確認。

## 前回のUI修正（2026-09-27）

- ビルドとルーンの個別折りたたみを廃止し、「ビルド・ルーン」全体を一括で折りたたむ。
- ルーン選択は左にメイン（4段）、右にサブ（3段）と能力値シャード。系統・ルーンは丸いアイコン、選択状態は金色の枠。名前・説明はツールチップとアクセシブル名で確認できる。
- Comfort Picksの折りたたみを追加。LibraryはFavorite Champions全体ではなく「各Roleのプール一覧」だけを折りたたみ、見出しとレーン選択は常時表示。
- 保存形式・個人データは変更していない。
- 検証：関連E2E 8件（loadout / matchup-pool / notebook / phase23）、lint、型チェック、build、dist成功。折りたたみ範囲、入力保持、左右2列の配置、狭い画面の表示を確認。今回のUI修正後に全16件を再実行したとは主張しない。
- 更新用インストーラーとSHA256SUMSを再生成済み。再インストール・push・公開はしていない。

## 前回の更新（2026-09-27）

- 開発ブランチは `codex/matchup-build-runes`。以下の旧引き継ぎよりこの節を優先。
- LibraryとMatch upのFavorite Championsを折りたたみ対応。おすすめピック（旧カウンターピック）をMatch up左側のComfort Picks上へ移動、折りたたみ可能。
- 中央はビルド・ルーン → 共通対策 → メモ。タブ分割や固定のメモ移動ボタンは追加していない。
- ビルドの購入順とルーン・シャードをアイコンで選択し、対面×Roleごとに保存。補足メモ、未保存確認、オフライン画像同梱。
- Match Historyの新規メモは日付と試合IDだけ、カテゴリー「振り返り」。既存メモは変更しない。
- DBはv6（カテゴリー制約更新）、バックアップはv3（loadouts追加、旧v1/v2読込可）。旧バックアップ復元時はビルド・ルーンが空になる。
- 個人Comfort Picks・個人DB・取り込みファイルにはアクセスしていない。再取り込み禁止は継続。
- 配布物：`dist/RiftNote-Setup-0.1.0-x64.exe` とSHA256SUMSを更新済み。再インストール・push・公開はしていない。梱包内に個人ファイルがないこと、アイテム253枚・ルーン等74枚の同梱を確認。
- 検証：テスト28件、E2E全16件、lint、型チェック、build、dist、diff check成功。画像同梱・保存失敗時の保持・未保存移動確認・再起動・旧v5メモ移行・バックアップ往復を確認。

## 以前の引き継ぎ（更新前の記録）

- 引き継ぎ前の実装HEADはc06b299、ブランチはcodex/luxury-notebook。開始時の作業ツリーはクリーン。今回の文書更新はこの後のコミットになる。
- 最新依頼「メモの文字が小さくて読みにくい」まで完了。本文・入力欄は16px、行間・文字色も調整済み。未処理の機能依頼はなく、次の変更はユーザーと相談する。
- 最新配布物はdist/RiftNote-Setup-0.1.0-x64.exeとdist/SHA256SUMS.txt。0.1.0、署名なし。文字サイズ変更版をユーザーがインストールしたかは未確認。新しいチャットで勝手に再インストールしない。
- 最後の変更ではlint/build、knowledge.e2e.tsとusability.e2e.tsの計3件、dist、diff checkが成功。CD追加時にはcooldowns.e2e.tsも成功。直近変更後に全E2Eを一括実行したとは主張しない。
- ナビ順はSearch → Notebook → Match up → Champions → Match History → Champ Select → Settings。
- Notebookの白/金の試作は撤回し、全画面ダーク＋紫に統一。英語のNotebook表記。装飾コピーTHE PERSONAL PLAYBOOK、YOUR PERSONAL LEAGUE COMPENDIUM、「学んだことを、一冊の知識に。」「チャンピオン自身の知識と、対面ごとのメモ。」は削除済み。
- Match upのチャンピオン候補は2列表示。自分・相手それぞれAll/TOP/JUNGLE/MID/BOTTOM/SUPPORTで絞り込み、検索と併用・フィルター保持が可能。
- 表示名・実行ファイル・インストーラーはRiftNote。GitHub URL、appId、既存保存先、バックアップformat識別子lol-noteは互換性のため維持。

### 個人Comfort Picksの取り込み：重要

- ユーザーの旧Obsidian TOPノートから314組を個人用Comfort Picksへ取り込み済み。不利欄は自分/敵を反転、有利欄はそのまま、五分6件は除外。メモ本文は取り込んでいない。アプリ本体・初期データ・Gitには含めない。
- 当初は外部スクリプトでDBへ追加し直接照会で314件を確認したが、実際のインストール版では0件だった。保存先文字列は一致し、DB整合性も正常だったが、食い違いの根本原因は未特定。フォーカス時再読み込みだけでは解決しなかった。
- 実アプリから診断バックアップを出して0件を確認。その最新データの既存テーブル/Notebookを維持し、my_picksだけ314件追加したファイルを作成。ユーザーが「反映してよい」と明示承認後、Settingsのバックアップ復元で反映した。
- 最後は起動中の実画面で敵K'Sante / TOPにKayle・Singed・Poppy・Yorickの4件が表示されることを確認済み。既存メモ等が復元前の自動バックアップと一致することも確認した。DB照会やテスト用コピーだけでユーザー環境に反映済みと判断しない。
- 個人用ファイルdist/RiftNote-personal-comfort-picks.jsonはGit無視で、インストーラーにも含まれない。公開・配布しない。取り込み時点のスナップショットなので、後日再適用すると以降の編集を戻してしまう。再取り込みしない。
- 自動バックアップはアプリ保存フォルダー内backupsにある。通常開発で個人ファイルを再読込する必要はない。

### CD表示の制限と更新

- SkillCooldowns.tsxが敵の右にQ/W/E/Rのランク別基礎CDを表示。狭い画面では下へ折り返す。Data Dragon 16.18.1固定で、自動更新や試合中の残り時間表示ではない。
- 現実装はCD配列に1秒未満が含まれると「特殊」にする暫定ルール。正規の短いCDも省略され得る。変身・再使用・チャージ回復・攻撃速度依存などを完全には表さない。精度改善を頼まれたらスキルごとの検証が必要。
- 主なファイルはsrc/renderer/src/SkillCooldowns.tsx、resources/champion-cooldowns.json、scripts/refresh-cooldowns.mjs、tests/cooldowns.e2e.ts。
- 文字サイズはsrc/renderer/src/styles.cssとknowledge-book.css。チャンピオン選択はApp.tsx内ChampionPicker。

更新: 2026-09-27。製品名は **RiftNote**。

## ユーザー方針

- ユーザーの依頼で統計機能を削除済み。画面・IPC・サンプル・取り込み・収集CLIを撤去。個人ノートと既存の未追跡データ・.envは保持する。
- 現在はWindowsアプリ本体を開発。今回、インストーラー、バックアップ・復元、Git・README整理をまとめて進めることが承認された。
- mainは起動可能に保ち、大きな変更はfeature branch。完成時はBuild・Test・Lint・Git diffを確認する。
- APIキーを含むtools/stats/.envや取得データは読まない。個人DB・旧ノートは通常開発では読まない。ユーザーが個人データの取り込み・調査を明示依頼した範囲でのみ扱い、Gitや配布用初期データには含めない。

## Gitと実行

- Repository: https://github.com/GanbaruKing/LOL-note
- 現在の作業ブランチ: codex/luxury-notebook。表示整理305b02fから分岐。
- mainへの統合準備として変更をコミットする。push・GitHub Release公開は行わない。
- 続ける前にgit status / git log / git branchを確認する。古いmainから直近のUI変更を落とさない。
- Node.js 24以降。npm ci → npm run dev。配布版はnpm run dist。

## 現在の機能

- Notebook：チャンピオン非依存の章・記事。章名変更・所属変更・上下移動・検索・お気に入り・書式付き閲覧・自動保存。他画面と統一したダークテーマ。サイドバーはSearch → Notebookの順。詳細はdocs/knowledge-book.md。settingsのknowledge-bookキーで保存するためDBはv5のまま。バックアップはv2に更新し、v1読込にも対応。

Electron / React / TypeScript / node:sqlite。ノートはオフラインで利用できる。

- Match up: 自分×敵×Roleのメモ、カテゴリー、評価、Pin。敵チャンピオンの右にQ/W/E/Rのランク別基礎CDを表示。resources/champion-cooldowns.jsonにData Dragon 16.18.1の173体分を同梱し、オフライン表示。1秒未満など通常CDとして解釈できない値は「特殊」。変身後・チャージ回復・条件付き短縮を含む完全なスキル仕様ではない。更新はnpm run data:cooldowns（champions.jsonと同版）。
- Champion Library: 日英検索、レーン別表示、Champion Notes、対面メモ一覧、Champion Pool。
- 敵チャンピオンへの対策: Champion Notesとは独立した1体1文章。「Darius対策」のように表示し、Match upで敵に選ぶと表示。最大10000文字、空欄保存で削除。未保存入力は別々に保護する。
- 初期カウンターメモ: resources/counter-notes.jsonに167体・197組。5レーン別、短い理由と出典付き。Match up / Champ Selectに表示し、個人DBには挿入しない。選定方法と未収録6体・一部Roleの扱いはdocs/curated-counters.md。統計収集機能は復活させていない。
- Match up左側はFavorite Champions。現在Roleのプールを自信度順に表示し、自分のチャンピオンだけ切り替える。「プールを編集」で同じRoleのLibraryを開く。
- Comfort Picks: 敵×Roleごとの得意ピック。空表示は「敵チャンピオン名に対して得意なピックを追加しましょう。」。評価順という説明文は表示しない。
- Search: Champion Notesと対面メモの横断検索。対策欄は検索対象外。
- LCU: 読み取り専用の接続、Champ Select検知、自分のhover/確定Pick、敵Pick参照。ゲーム側操作は行わない。
- Match History: 最近20試合のうちサモナーズリフト。履歴と序盤の位置・CS・Smiteから対面を推定し、修正可能。試合情報を通常の対面メモへ渡す。履歴DB・キャッシュ・記入済み管理は未実装。
- Settings: JSONバックアップ・復元。ノートブックの章と記事、メモ、対策、評価、Pin、プール、Comfort Picksが対象。復元前に自動退避し、単一トランザクションで置換。不正データはロールバック。ローカルのLeague設定は対象外。
- Windows x64 NSISインストーラー: npm不要、スタートメニュー・デスクトップショートカット、専用Nアイコン。署名なし、自動公開・自動更新なし。

## 保存先と境界

- 製品名変更後もuserData/sessionDataは %APPDATA%/lol-matchup-companion。既存notebook.sqliteを継続使用する。
- DB schema v5。今回バックアップ追加に伴うDB移行はない。
- MainのみDB・ファイル・LCU認証を扱う。preloadは限定API。送信元URL・フレーム検証、sandbox/contextIsolation、CSPを維持する。
- バックアップ仕様: docs/backup.md。配布手順: docs/release.md。
- リリース梱包対象はout、package情報、LICENSE、実行時依存のみ。distはGit対象外。

メモ本文・入力欄・対策・初期カウンター理由・Notebook本文は16px。対面メモと対策の行間は2倍で、長文を読みやすくしている。

## 検証と今後

検証コマンドはnpm test、npm run lint、npm run test:e2e、npm run dist、git diff --check。E2Eの現在の件数はnpx playwright test --listで確認する。E2Eは専用DB・疑似LCUを使用する。スクリーンショットはテストデータ。

操作改善: メモへの固定ショートカットはユーザー依頼で削除。Comfort Picksはウィンドウへ戻った際にも再読み込みする。未保存表示、Libraryの検索・レーン・詳細から戻る位置の保持、ひらがな/全角検索、Match up選択の矢印/Enter/Esc操作。初期カウンターから候補×敵×Roleの対面ページを開ける。未保存確認を経由し、ゲーム内Pick操作は行わない。UIの保持状態はアプリ終了まで。

Match upの自分・相手のチャンピオン選択はAll＋5レーンで絞り込み可能。Libraryと同じ主要レーン分類を使用し、名前検索と併用できる。各選択欄で絞り込みを保持し、対面のROLEは変更しない。

Match upの見出しは敵を主役にした「vs Darius」形式。自分のPickは小さな補足行に表示する。変更は上部の選択欄から行う。重複する変更ボタン・難易度選択・ナビのMatch up件数は削除済み。既存の難易度データはバックアップ互換性のため保持。カウンター見出しは「Dariusへのカウンターピック」、個人メモは「AatroxでDariusと戦うメモ」と対象を明記する。

次に残るのはクリーンなWindowsでのインストール・更新・アンインストール試験、公開配布に向けたコード署名、必要ならGitHub Release公開。統計機能は削除済み。機能面では履歴の記入済み管理や対策欄の検索対応が候補だが未着手。
