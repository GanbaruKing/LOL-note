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

## 拡張点

統計は将来StatisticsProviderに隔離し、Repositoryへ外部API依存を持ち込まない。現時点で空のServiceクラスは作らない。

## 参照資料

- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Node SQLite](https://nodejs.org/api/sqlite.html)
- [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon)

## Phase 4

StatisticsProvider / JsonStatisticsProviderをMainに追加。統計は個人ノートDBと分離し、userData/statistics.jsonに保存する。統計の取り込み・参照は限定IPCで行い、同じStatisticsコンポーネントをMatch upとChamp Selectで利用する。詳細はstatistics.mdを参照。
