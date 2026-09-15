# 次のチャットへの引き継ぎ

更新: 2026-09-15。この文書は新しいチャットで最初に読むための現状整理です。

## 最優先のユーザー方針

**統計収集機能は後回し。ユーザーが再開を依頼するまで、追加収集・最適化・アプリへのJSON v2接続を進めない。** 実装と取得データは残す。現在はアプリ本体を開発している。最新の実装状況は下記の追記を参照する。

2026-09-15の後続タスクで、ユーザーがPhase 5「試合履歴からの振り返り」の開発を承認。`feature/match-history-review`で初期版を実装した。統計機能は引き続き保留。

## 最新追記：Match upのChampion Pool

- 現ブランチは`feature/matchup-champion-pool`。`42fb0b9`から分岐。
- ユーザー依頼によりMatch up左側のTop Matchup PicksをChampion Poolへ置換。
- 追加指定でMatch up側の表示名を「Favorite Champions」へ変更。Champion Library側のMy Champion Poolはそのまま。
- Comfort Picksの「自分の評価が高い順」を削除。空状態は「敵チャンピオン名に対して得意なピックを追加しましょう。」と表示する。
- 現在のRoleのプールを自信度順に表示し、選択すると自分Championだけを切り替える。未保存メモの確認は既存動作を使用。
- 「プールを編集」から同じRoleのChampion Libraryへ移動できる。既存プールを共有し、DB変更なし。
- Champ Selectの統計表示は引き続き存在。統計収集の保留方針は継続。
- 追加依頼で製品名をLOL Noteへ変更。ウィンドウ・HTML title・サイドバー・package名を更新し、userData/sessionDataは従来のlol-matchup-companionフォルダーを使用して既存データを引き継ぐ。
- Build・28 unit tests・全9件のE2E・Lint・Git diffチェック成功。初回の保存フォルダー作成と再起動後のプール保持も確認した。

## 追記：敵チャンピオンへの共通対策

- この機能の実装時のブランチは`feature/champion-counter-notes`。`af0d887`から分岐。
- ユーザー依頼: Champion LibraryのChampion Notesとは別に敵チャンピオンへの共通対策を書き、Match upでその敵を選んだとき表示する。
- Champion詳細に共通対策の文章欄（最大10,000文字）を追加。敵Champion単位で1件保存し、自分Champion・Roleに依存しない。空欄で保存すると削除する。
- Match upのMy Notesの上に敵への対策を表示。Champion Notesとの同時編集、保存失敗時の入力保持、未保存移動確認に対応。
- 表示名はユーザーの追加指定により「共通対策」から「Darius対策」のようなチャンピオン名＋対策へ変更。Champion LibraryとMatch upの両方に適用。
- schema v5のchampion_countersを追加。既存ノートは移行時に保持する。
- 保存先・実装の説明はdatabase.md、architecture.md、READMEを参照。
- 検証: Build・28 unit tests・全8件のE2E・Lint成功。画面写真はテストデータ。

## 追記：試合履歴の初期版

- この機能の実装時のブランチ: `feature/match-history-review`。下記の旧Git記録のHEAD `78b977e`から分岐した。
- Match Historyで直近20試合のうちサモナーズリフトを表示し、対面を自動選択して既存メモに振り返りを追記する。
- ユーザーは「履歴なら対面を自動特定できるのでは」と指摘し、調査を依頼。手動選択を基本にせず、自動判定を基本にした。
- 実LCUの3試合を読み取り、lane欠損・JUNGLE重複・CARRY/SUPPORT表記を確認。序盤の位置・CS・Smiteで補正し、3試合のTOP対面を判定できた。ユーザーによる正解確認は未実施。
- 詳細: [match-history.md](match-history.md)。判定はヒューリスティックであり、必要なら画面でRole・相手を修正できる。
- Build、27 unit tests、全7件のE2E、Lint、Git diffチェックが成功。既存のPhase 2/3 E2Eは統計フィルターを誤って数えていたため、Comfort Picks内に検査対象を限定して再実行・成功。
- 試合別DB・履歴キャッシュ・記入済み状態は未実装。日時・結果・K/D/A・試合IDは通常ノート本文へ入る。個人DBを変更する実機試験は行っていない。

以下は統計保留時点の記録。現ブランチとPhase 5の状況は上記を優先する。

## 作業場所・Git

- ローカル: `C:\Users\kaboc\OneDrive\ドキュメント\ChatGPT\LOLマッチアップ2`
- Repository: https://github.com/GanbaruKing/LOL-note
- 現在のブランチ: `feature/global-statistics-collector`
- 引き継ぎ文書追加前のHEAD: `318e117`（統計CLIの操作手順）
- 実装コミット: `618f86a`（独立統計CLI）
- 設計コミット: `66b01f4`
- 上記ブランチはGitHubへpush済み。文書作成開始時点のworking treeはclean。
- 現在のブランチには過去の統計フィルターなどの変更も含む。mainと同一ではない。古いmainから始めて直近のUI変更を落とさないよう、branch/log/diffを確認してから分岐する。
- ローカル.envとdataはGitに入っていない。別worktreeや別PCでは自動で引き継がれない。今回の続きは同じ作業フォルダーを選ぶのが簡単。

ユーザーのGit方針: mainは起動可能に保つ。大きな機能はfeature branch。意味の明確なfeat/fix/docs等のコミット。大規模変更前にdiffとarchitectureを確認し、既存変更を削除しない。完成時にBuild/Test/Lint/Git diffを確認する。GitHub自体を就職活動用ポートフォリオにするため、README・設計理由・セットアップ・スクリーンショットを整備する。

## アプリ本体の実装状況

Windows向けElectron + React + TypeScript + SQLiteのLoL対面ノートアプリ。Node.js 24以降。個人ノートはオフラインで利用可能。

- Match up: 自分×敵×Roleのノート、概要・難易度・自分の評価、カテゴリー。
- Champions: チャンピオン一覧、レーン絞り込み、選択したチャンピオン自体のメモ。
- レーン別Champion Pool、検索、Pin。
- Comfort Picks: 得意な対面の候補。Match up overviewから追加し、対面の「自分の評価」を使う。
- LCUによるクライアント接続・Champ Select検出。自分の確定前hover/選択も検出。ユーザーから実際の選択画面で動いたとの報告あり。
- 統計Phase 4: JSON v1のインポート・条件指定・勝率上位10体表示。自動的に世界全体の最新統計を取得しているわけではない。
- 試合履歴を使う振り返り、配布用Installerなどは今後の工程。

UIについての継続的な好み:

- Notebookというナビ表記をMatch upへ変更した。
- Championsは対面選択を入口にせず、チャンピオンそのものに焦点を当てる。
- Championsはキャラクターが並び、クリックすると詳細へ進む構成。レーン別の見やすさを重視。
- 「次の対面に、前の気づきを」「蓄積した知識を、今の対面へ」などの宣伝調フレーズは不要。説明的で自然な文言を好む。
- My Notesの空状態はメモ追加を促す素直な文言にする。
- 候補の手動優先順位は不要。対面にある「自分の評価」を使う。
- 細部は後から調整しつつ開発を進める方針。

## 起動・検証

プロジェクトルートで:

```powershell
npm run dev
```

ビルド済み起動:

```powershell
npm run build
npm start
```

通常の検証:

```powershell
npm run build
npm test
npm run lint
```

直近の統計CLI実装時に、本体Build/Lintと22 unit testsが成功。UIに変更がある場合は適切なE2Eも実行する。このチャット最後の変更は引き継ぎ文書のみで、再度の全テストは行っていない。

主要資料: `docs/architecture.md`, `docs/database.md`, `docs/lcu.md`, `docs/statistics.md`, README。`docs/plan.md` は初期計画の履歴を含み、「未実装」等の一部は古いので現状判定にはコードとこの文書を併用する。

## 保留した統計CLIの状態

`tools/stats` は本体とは別のNode/TypeScript package。独立したpackage-lockとSQLiteを持つ。収集・再開・重複排除・地域/プレイヤー上限・rank/Role検証・通常勝率補正・Wilson区間・JSON v2出力まで実装済み。16テスト、Build、Lintが成功している。本体からRiot APIを呼ばず、APIキーをアプリへ配布しない。

**新JSON v2は現アプリのv1インポーターへ未接続。** 統計収集の実装済みと、アプリで利用可能な最新Globalランキングを混同しない。

認証付き試験も実施済み:

| 試験           | 結果                                                            |
| -------------- | --------------------------------------------------------------- |
| JP Master限定  | 2試合・有効対面3組、16 API calls。集計・export成功              |
| 5地域 Emerald+ | 4試合・有効対面18組、8,644 API calls。全5地域の処理とexport完了 |

5地域試験は2026-09-15 15:07 JSTに終了。多くの呼び出しがランク一覧取得（8,593ページ）で、試合数はランキングに不十分。各地域・UTC日でseed2人、seedあたり最大2試合という小規模試験だった。「全地域の処理完了」は、各地域で十分な試合を採用できたことを意味しない。

保存場所（ローカルのみ）:

- キー: `tools/stats/.env`。ユーザーが保存し、裸のキーから `RIOT_API_KEY=…` の形式へ修正済み。**キーの内容を表示・チャット記載・コミットしない。** 有効期限は未保証。
- JP試験: `tools/stats/data/pilot/`
- Global試験: `tools/stats/data/global-trial/`
- 完了状態: `tools/stats/data/global-trial/status.json`（phase: complete）
- run ID: `22cc5237-aecd-4b18-a7fc-7f2aac689081`
- Global出力: `tools/stats/data/global-trial/run/output/d247719a96bf80ab0d1c69e2/export-4c4a2829-096b-416f-a3df-bb9b73f7fffa/`
- 統計JSON・gzip・品質レポート・manifestが出力済み。

試験用の一回限りのbackground pipelineは終了済み。定期収集は設定していない。古いPIDは再利用されるため、PIDの数字だけを見てプロセスを停止しない。

`tools/stats/README.md` と `docs/global-statistics-design.md` に設計と手順がある。両文書の「認証付きpilot未実施」という記述は実装直後の記録で、上の実試験結果が最新。ユーザーが統計を再開する際は、この差分を反映してから進める。

将来の統計再開時に検討する課題: ladderのrun間再利用、取得効率改善、seed数増加、十分な試合数の確保、複数runの集計、本体のJSON v2 adapter。これらは現在の依頼対象ではない。

## 次の担当者の最初の動き

1. この文書とarchitectureを読む。
2. 現在のbranch・status・diffを確認する。
3. 統計は保留として、ユーザーが希望する次のアプリ本体の工程を確認する。
4. 必要なら `npm run dev` で現状確認し、合意した工程をfeature branchで進める。

新しいチャットがこの文書を読んだからといって、前チャットの全履歴や未追跡ファイルまで自動コピーされたとは扱わない。
