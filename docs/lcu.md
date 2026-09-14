# League Client連携（Phase 3）

## 接続の流れ

1. MainのLcuServiceが、指定済みフォルダー・既知のインストール先・LeagueClient.exeの実行パスからlockfileを探す。
2. lockfileからHTTPSポートと認証情報をMainのメモリ内だけに読み込む。
3. 127.0.0.1へのGETで `/lol-gameflow/v1/gameflow-phase` を取得。
4. ChampSelect中だけ `/lol-champ-select/v1/session` を読み、localPlayerCellIdに一致する自分のチーム情報からRoleとChampion IDを抽出する。
5. theirTeamのchampionIdが正のものだけを表示する。敵のchampionPickIntentやプレイヤー名・アカウント情報は利用しない。敵Roleは推定しない。
6. Rendererは型付きsnapshotだけを取得する。選択されたChampion IDで既存RepositoryのMy Picks / Matchup / Champion Notesを読む。

自分のChampionはchampionIdを優先し、未確定なら自分の進行中pickアクション、championPickIntentの順で取得する。ロックイン前の選択変更・取り消しも次の取得時に反映する。Ban・他プレイヤーのアクション・敵のIntentは対象外。画面で候補を手動プレビューしている場合は「LCUの選択へ戻す」で自動追従に戻る。

LCU APIは公式の長期互換性が保証された一般公開APIではないため、変換処理を独立させる。実クライアントのレスポンスに差異が出た場合はparseSessionとテストを更新する。

## ポーリングと復旧

リクエストを重ねず、完了後2秒で再取得する。接続の検出用PowerShellは最大4秒・10秒以上の間隔。HTTPSリクエストは2.5秒で打ち切り、1MBを超えるレスポンスを拒否する。中断・失敗時は前回のPick情報を消し、次回再接続する。

セッション開始と再接続に識別子を付け、Rendererの手動対面・候補選択をリセットする。選択済みの敵が消えたらメモも非表示にする。Role未確定・自分のChampion未確定では入力を促す。

## セキュリティ

接続先は127.0.0.1固定、HTTPメソッドはGETのみ。自己署名証明書の例外はこの個別HTTPSリクエストだけに限定し、ElectronやNodeのTLS検証を全体で無効にしない。リダイレクトは追従しない。認証情報や生レスポンスはIPC・ログ・DBへ渡さない。

Settingsが保存するのはユーザーがOSダイアログで選択したフォルダーのパスだけ。Rendererから任意のファイル読み込みAPIは公開しない。Windowsのアクセス権で自動検出できない場合は手動フォルダー選択を使う。

## テストと実機確認

- 変換：localPlayerCellId、自分のRole、未確定値、隠れたPickの除外、敵ID重複。
- Service：Select開始、非Select、切断、エラー、再接続、セッションの更新。
- Electron E2E：一時証明書付きHTTPSサーバー、lockfile検出、Basic認証、2つのGETだけが行われること、敵選択、My Picksプレビュー、Pin付きメモ参照、敵Pick変更、切断復帰、編集中画面の保護。
- 実際の起動中League Clientで接続とphase=None取得を確認。実際のChampion Select中の検証は未実施。

疑似LCUはテスト専用で、通常起動にデモ状態を混ぜない。テスト起動では通常のインストール先の自動探索を無効にする。

## 参考

- [Riot: League Client API](https://developer.riotgames.com/docs/lol#league-client-api)
- [Riot: LCU API Policy](https://www.riotgames.com/en/DevRel/changes-to-the-lcu-api-policy)

配布・公開時にはRiot Developer Portalの現行ポリシーとアプリ登録状況を確認する。
