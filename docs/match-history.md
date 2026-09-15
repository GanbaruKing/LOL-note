# 試合履歴からの振り返り

## 使い方

1. League Clientにログインして、左のMatch Historyを開く。
2. 最近の試合を選択する。Roleと同じRoleの対戦相手を自動選択する。
3. 必要ならRoleや相手を修正して「この対面のメモを書く」を押す。
4. Match upの入力欄に入った日時・結果・K/D/A・試合IDに、気づきを追記して保存する。

直近20試合を取得し、mapId=11かつgameMode=CLASSICの試合を表示する。他モードや必要情報が欠けた試合は除外件数を表示する。試合の詳細は選択時だけ読み込む。履歴自体は保存せず、保存ボタンで記録した対面メモは既存SQLiteに残りオフラインで利用できる。

対面単位のノートを使うため、試合ごとの独立した振り返りDBや記入済み判定は設けていない。試合情報は編集可能な本文になる。履歴を開いたり試合を選んだりしただけではDBへ書き込まない。

## 自動判定の調査結果（2026-09-15）

[LCUから抽出されたSwagger（Client 26.16）](https://lcu.kebs.dev/swagger)で、履歴詳細のparticipantsにteamId・championId・timeline.lane/role、別エンドポイントの試合タイムラインにparticipantFramesの位置・CSがあることを確認した。[元スキーマ](https://github.com/KebsCS/lcu-and-riotclient-api/blob/main/lcu/swagger.json)。これはRiot公式の公開APIサポート契約ではなく、クライアントの仕様変更に追随する必要がある。

実際に起動中のLCUから直近のサモナーズリフト3試合を確認した。全員のlaneがNONEの試合、同じチームにJUNGLEが2人ある試合が存在した。またBOTのroleはCARRY/SUPPORTだった。古いDUO_CARRY/DUO_SUPPORTだけを読む実装では不足する。LCUのこの構造にはMatch-v5のteamPositionはなかった。

試合詳細とタイムラインを使い、3試合についてAatrox対Sion、Mordekaiser対Ornn、Singed対K’SanteのTOP対面を自動判定できた。ユーザーによる正解確認や、多数試合での精度測定は未実施。認証情報・PUUID・プレイヤー名・生レスポンスは記録していない。

## 判定ルール

- 5人のチームごとに判定する。配列の並び順やチャンピオンの一般的な得意Roleからは決めない。
- 履歴のlane/roleを正規化する。BOTTOM/BOTのCARRY・DUO_CARRYをBOTTOM、SUPPORT・DUO_SUPPORTをSUPPORTとする。NONEは未判定。
- チーム内でSmite所持者が1人ならJUNGLEとし、他のJUNGLE表記は解除する。
- 3〜10分付近の位置を1分につき1サンプルにまとめ、TOP/MID/BOTTOMのレーン領域への滞在を数える。3サンプル以上、次候補より2サンプル以上多い、レーン領域内サンプルの60%以上という条件で補正する。
- BOTTOMへの滞在者が2人なら、5分以降の最後のサンプルのCS差が10以上ある場合に、CSの多い側をBOTTOM、少ない側をSUPPORTとする。
- チーム内で同じRoleが重複した場合は、そのRoleの判定を解除する。
- 自分のRoleに一致する敵が1人なら画面で自動選択する。未判定の場合は手動選択とし、判定済みでも修正できる。

位置の領域・サンプル数・CS差はこのアプリのヒューリスティックで、Riot公式の判定式ではない。短い試合、ローム、スワップ、特殊な編成、CSを取るサポート等では誤判定・未判定があり得る。タイムライン取得に失敗しても、履歴情報と手動選択で振り返りを続けられる。

## プロセス境界・通信

Renderer → 限定IPC getMatchHistory / getHistoryMatch → HistoryService → 既存のloopback限定GET。

- current-summonerで自分を識別し、participantIdentitiesのPUUIDからparticipantIdを対応づける。
- 取得前後のログインアカウントが変わったら結果を返さない。
- クライアント未起動、未ログイン、取得失敗、形式不正を安全なエラーにする。
- 詳細の試合IDは正の安全な整数だけを許可する。RendererにURLや認証情報を渡さない。
- 履歴リストは最大20件。1リクエスト2.5秒、通常レスポンス1MiB、タイムラインのみ8MiBを上限とする。
- 異なる試合の連続選択・更新・画面移動では古い非同期応答を無視する。
- Riot APIキーや独立統計CLIは使わない。

追加したGET:

- `/lol-summoner/v1/current-summoner`
- `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19`
- `/lol-match-history/v1/games/{gameId}`
- `/lol-match-history/v1/game-timelines/{gameId}`

## 検証

Unit testsで本人識別、データ除外、個人識別情報の除去、Role表記差、欠損や重複レーンの補正、判定不能ケース、切断・アカウント切替・ID検証を確認する。

疑似LCUを使ったElectron E2Eで、自動対面選択、手動修正、入力への引き継ぎ、未保存確認、保存と再起動後の永続化、連続選択、取得失敗と空履歴を確認する。画面写真はテストデータで生成する。

実装時の結果: Build・27 unit tests・全7件のE2E・Lint・Git diffチェック成功。既存Phase 2/3 E2Eの広すぎるセレクターをComfort Picks内に限定し、統計フィルターを数えてしまう問題を修正した。

![試合履歴の画面（テストデータ）](screenshots/match-history.png)
