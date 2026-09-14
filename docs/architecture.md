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

## 拡張点

LCUは独立したLcuServiceをMainに追加する。認証情報をRendererへ渡さない。LCUが得たChampion IDを既存Notebookの入力に使う。統計はStatisticsProviderに隔離し、Repositoryへ外部API依存を持ち込まない。現時点で空のServiceクラスは作らない。

## 参照資料

- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Node SQLite](https://nodejs.org/api/sqlite.html)
- [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon)
