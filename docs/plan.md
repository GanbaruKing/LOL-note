<!-- この文書は初期計画の記録です。2026-09-16に統計機能は削除しました。現状はhandoff.mdを参照してください。 -->

# 初期調査と実装計画

## 現状（2026-09-14）

作業ディレクトリには `.git` のみ。コミット、既存アプリ、DB、テスト、独自のAGENTS.mdはない。Node.js 24.16.0 / npm 11.13.0 を確認した。既存構成の改修ではなく、新規の最小構成を作成する。

## 設計上の改善点

- Notebookをアプリの中心に置き、LCUの接続を起動条件にしない。
- データの重複を避け、matchupsの `(my_champion_id, enemy_champion_id, role)` を一意にする。ノートからmatchupを参照する。
- 日本語表示名・英語表示名と数値Champion IDを分ける。
- DBをRendererから隔離する。TypeScriptの型だけに頼らず、IPC入力をMainでも検証する。
- DBマイグレーションと永続化テストを最初から用意する。
- MVPは実際に動く機能だけ表示する。未実装の接続状態や統計を実データのように表示しない。

## 推奨ディレクトリ（Phase 1で採用）

```
src/
  main/           # Electron起動、IPC、SQLite repository
  preload/        # contextBridgeによるNotebook API
  shared/         # DTO、入力検証、共通定数
  renderer/src/   # React画面・CSS
resources/        # 同梱Championカタログ
public/champions/ # 同梱アイコン
scripts/          # Data Dragon更新処理
tests/            # Repository統合テスト、Electron E2E
docs/             # 設計・説明
```

## Phase 1の実装順

1. Electron / React / TypeScriptの起動とプロセス境界。
2. SQLite migration・Champion登録・Matchup / Note Repository。
3. 名前検索つきChampion選択、Role選択、Matchupページ。
4. メモCRUD・カテゴリー・保存状態・入力エラー・空状態。
5. 永続化・対面/Roleの分離・不正入力のテスト。
6. READMEと各ファイルの責務の説明。

受け入れ条件：League Clientなし・ネットワークなしでメモCRUDができ、アプリ再起動後も残る。自分/敵/Roleで別ノートになる。保存失敗時に入力を失わない。

## 後続Phase（この実装には含めない）

2. Champion単体ノート、Pool、My Picks、全文検索、Favorite。
3. LcuService、接続状態、Champ Select検知、Role・敵Pickの取得。敵Roleは自動断定せず、Notebookと同じAPIで閲覧する。
4. StatisticsProvider。出典・Patchを表示、games >= 100を勝率降順にし、My Picksとは別表示。
5. Match Historyを起点にした振り返り。
6. 配布方式の選定（Electron Forge候補）、Installer、署名、Logging、公開準備。GitHubへの公開は別作業。

## 進捗更新：Phase 4初期版

Phase 1〜3の主要機能に加えて、Phase 4のJSON StatisticsProvider、統計表示、ファイル取り込みを実装。実統計の自動収集・Riot API集計は未実装。次の段階で実データの取得元を選定する。ユーザーから実際のチャンピオン選択画面で自動検知を確認できたとの報告あり。
