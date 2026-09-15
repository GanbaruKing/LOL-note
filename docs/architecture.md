# アーキテクチャ

Renderer (React) → window.notebook → Preload → 検証付きIPC → Main → NotebookRepository → SQLite。

## Main

アプリとウィンドウのライフサイクル、DB接続、migration、入力検証、例外の安全な変換。DBはOSのuserData配下へ置く。接続できなければエラーを表示し、空DBで上書きするような復旧はしない。

## Preload

listChampions / listMatchups / getMatchup / saveOverview / addNote / updateNote / deleteNote / getInfoと、チャンピオン単体用のgetChampionPage / addChampionNote / updateChampionNote / deleteChampionNoteを公開。汎用的なinvoke、SQL、ファイルアクセスを公開しない。

## Renderer

プール用にはlistPool / savePool / removePoolの限定IPCを追加。MainでChampion ID、Role、自信度を検証し、SQLiteのv3テーブルへ保存する。

Champion選択、対面選択、Role、ノート編集フォーム、処理中・保存失敗・空状態。Node.jsやSQLiteをimportしない。

## 選定理由

ReactとTypeScriptは状態管理とAPIの契約を明示できる。electron-viteはMain/Preload/Rendererを分けてビルドできるためMVPで採用。配布用ツールはPhase 6で決める。CSSは通常のCSSを使い、現段階ではTailwindなどの追加抽象化を置かない。

SQLiteはElectron同梱Nodeの `node:sqlite` を使用。ネイティブアドオンのABI再ビルドを不要にする。ただしNode組み込みSQLiteのAPI成熟度とElectron更新への追随は継続して確認する。同期APIは小規模な個人ノート用途に限定し、大量集計は将来Workerなどへ移す。

ChampionDataはData Dragonからビルド前に取り込み、同梱して起動時ネットワーク依存をなくす。手動更新スクリプトと取得バージョンを残す。

## Phase 2 / 3

MyPicks.tsxは敵Champion×Roleに対する自分の候補を管理する。NoteSearch.tsxは単体/対面メモを横断して検索し、元のページへ戻す。ChampSelect.tsxはLCU snapshotに応じて確認できる敵Pickを表示し、選択された組み合わせの同じRepositoryを読む。統計データや別のノートコピーは作らない。

Mainの限定IPCにMy Picks、Pin、検索、LCU snapshot、フォルダー選択を追加。ハンドラーは非同期処理の失敗も安全なResultに変換する。LcuServiceはアプリのライフサイクルで起動・停止する。詳細はlcu.mdを参照。

## 参照資料

- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Node SQLite](https://nodejs.org/api/sqlite.html)
- [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon)

## Phase 5初期版

MatchHistory.tsx → getMatchHistory / getHistoryMatchの限定IPC → HistoryService → LCUの履歴GET。history-roles.tsが履歴のlane/roleと序盤の位置・CS・SmiteからRoleを判定する。履歴・生タイムラインは永続化せず、選択した対面と試合情報を既存のMatch up入力欄へ渡す。保存は従来のNotebookRepositoryを使用する。認証情報やPUUIDはMain内に留める。[使い方・判定方法・検証範囲](match-history.md)。

## Match upのChampion Pool

MatchupPool.tsxはAppが取得した既存のpoolを現在のRoleで絞り、自信度降順で表示する。選択は既存のchoose/navigateへ渡し、敵・Roleと未保存メモ確認を保持する。編集ボタンからChampion Libraryへ遷移し、initialRoleで同じRoleを開く。データベースやIPCの追加はない。

## 敵チャンピオンへの共通対策

Champion Libraryの詳細でChampion Notesと独立した共通対策を編集する。入力状態は別管理し、一方の保存で他方の未保存入力を消さない。ページ移動・ウィンドウ終了時には両方の未保存変更を確認する。

Match upのEnemyCounter.tsxは敵Champion IDを使ってgetChampionCounterを読み、自分Champion・Roleと無関係に同じ対策を表示する。敵変更時はコンポーネントを作り直し、旧取得結果を無視する。保存はsaveChampionCounter → NotebookRepository → champion_counters（schema v5）。

## バックアップとWindows配布

Settings → 限定IPC → Mainのファイルダイアログ → NotebookRepository。backup.tsで形式・列・値を検証し、6テーブルを一括置換する。復元前の自動JSON退避とSQLiteトランザクションで既存データを保護する。設定・認証とは分離する。詳細は[backup.md](backup.md)。

electron-viteのoutをelectron-builderでNSISに梱包する。アプリ名はLOL Note、保存先は互換性のためlol-matchup-companionのまま。詳細は[release.md](release.md)。
