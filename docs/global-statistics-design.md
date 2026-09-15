# Global対面統計 V1 設計案

調査日: 2026-09-15。設計承認後、V1を `tools/stats` に実装。認証付き実データ収集は未実施。以下は承認時の設計を残し、DB tableの統合や直列実行など実装上の整理は[CLI README](../tools/stats/README.md)に記録する。

## 方針と既存コードとの関係

TypeScript / Node.js 24 / SQLiteで独立CLIを作る。Riot API → collector → raw SQLite → processor → aggregator → JSON exporter → 将来アプリ、という流れにする。アプリにはAPIキーも収集処理も含めない。

既存の `src/collector` はJPの指定プレイヤー履歴を取得する試作であり、Global統計ではない。現在のアプリはschemaVersion 1のwins/gamesを読み、勝率順に表示する。今回の補正済み統計はschemaVersion 2として別契約を定義する。アプリ対応は後続作業とし、既存JSONの意味を変更しない。

同じ言語・テスト環境を利用できるためTypeScriptを採用する。新CLIはElectron・個人ノートDB・rendererに依存しない。SQLiteは単一収集プロセスからバッチ書き込みし、並列ネットワーク処理とDB書き込みを分離する。

## 1. 使用endpoint

公式APIリファレンスの現行定義を確認した。League DTOにはPUUIDがあり、旧summoner ID変換を前提にしない。[Riot API reference](https://developer.riotgames.com/apis)

| 目的                     | GET endpoint                                                                                         | routing  |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | -------- |
| Emerald・Diamond候補一覧 | `/lol/league/v4/entries/RANKED_SOLO_5x5/{tier}/{division}?page=N`                                    | platform |
| Master以上               | `/lol/league/v4/{masterleagues,grandmasterleagues,challengerleagues}/by-queue/RANKED_SOLO_5x5`       | platform |
| 対面選手のランク確認     | `/lol/league/v4/entries/by-puuid/{encryptedPUUID}`                                                   | platform |
| 試合ID                   | `/lol/match/v5/matches/by-puuid/{puuid}/ids?queue=420&startTime=...&endTime=...&start=...&count=100` | regional |
| 詳細                     | `/lol/match/v5/matches/{matchId}`                                                                    | regional |

KR・JP1はASIA、NA1はAMERICAS、EUW1・EUN1はEUROPEに向ける。表示名JP/NA/EUNEとAPIコードを設定で対応させる。TimelineはV1対象外。Champion辞書・パッチ候補はData Dragonを使うが、実際の対象判定はmatchのgameVersionのmajor.minorで行う。実行開始時にパッチを固定し、地域間の更新時差で旧パッチが混入しても除外する。[routing・Data Dragon](https://developer.riotgames.com/docs/lol)

## 2. Globalのサンプリング

V1のGlobalは「設定した主要地域から収集した標本」。全世界の全試合や世界人口比に比例した統計とは表示しない。

初期地域はKR/JP1/NA1/EUW1/EUN1。地域ごとに同じ日次試合採用上限を設け、日付ごとの枠も固定する。候補を全部検証した後、勝敗に依存しないhash(runSeed, matchId)順で地域・日付の枠へ採用する。最初に取得できた試合から埋めない。地域の不足分を別地域で補填しない。

統合は採用試合の整数wins/gamesを合算する。事後的な地域重み付けはV1ではしない。枠が均等でも対面ごとの地域比率は均等にならないため、全体・対面別の地域gamesを出力する。地域未完了・枠未達をcoverageに残し、未完了の収集を完全なGlobalとして公開しない。

## 3. ランクプレイヤー取得とEmerald+の定義

地域ごとにEmerald/DiamondのI～IVを空ページまで取得し、Master/Grandmaster/Challenger一覧を加える。PUUIDで重複排除し、ページ・取得日時・完了状態を保存する。ページ先頭だけを母集団にせず、一覧全体から再現可能なhash抽選でseedを選ぶ。地域内のtier/division枠は取得した一覧の人数に比例させる。巡回中の昇降格により一覧は完全な同時点スナップショットにはならない。

**集計対象は、同Roleの対面両者が近接したランクスナップショットでEmerald以上と確認できた組。** seedがEmeraldだから同じ試合の全員もEmerald、と推定しない。Solo/Duoだけを確認し、未ランク・取得失敗・古すぎるランク情報の組は採用しない。

Match-v5から試合時点のtierを復元する設計にはしない。metadataに `rankBasis: current_rank_snapshot` を明記する。初期設定は収集対象を直近48時間、rank cache TTLを24時間とし、matchとsnapshotの距離上限も48時間で検証する。これらは設定可能。過去に保存したrank snapshotは再集計時に置き換えない。10人全員がEmerald+であることは要求しない。

## 4. Match IDの集め方

1. 日次の固定時間窓とseed一覧をrunに保存する。
2. 各seedのその窓の履歴をページングし、hashで最大20試合を選ぶ。最新20試合だけにはしない。上限は設定可能。
3. `match_jobs.match_id` の一意制約でキューへ入れる。発見元は別テーブルに保存する。
4. raw取得済みIDをスキップし、未取得だけ詳細取得する。
5. role検証後、必要な両選手のrankをcache/ladder snapshotから確認。不足だけAPI取得する。
6. 候補集合を確定して地域枠を適用し、採用集合を永続化する。

窓を重ねて遅延試合を拾っても、同一datasetでmatchIdは一度だけ採用する。参加者を際限なく新seedへ追加するsnowball収集はしない。集計中の新着で順位が揺れないよう、集計は確定済みdatasetを入力にする。

## 5. 偏りとデータ品質

| 問題             | V1で行うこと                                                                                                 | 残る限界                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| ヘビープレイヤー | seed一人あたりの上限、日ごとにseed抽選を変更。全参加者についても地域・日別最大20採用試合を上限にhash順で採用 | 複数アカウント・参加者間の相関・選択確率の差は残る |
| 同じ試合         | raw/jobのmatchId一意制約、採用集合と正規化行にも一意制約                                                     | API失敗後の再通信はあり得るが二重加算しない        |
| 地域集中         | 地域・日別枠、地域別進捗、対面ごとの地域構成                                                                 | 世界人口比の推定ではない                           |
| 時間・ランク     | 固定時間窓、tier/division層化、rank取得時刻記録                                                              | 現在rankは試合時rankの近似                         |

全参加者上限は他選手の採用機会にも影響するため完全な無作為標本にはならない。上限前後の件数、unique players、最多選手の寄与率、tier分布、地域/日別採用数、除外理由数を品質レポートに保存する。勝った試合や特定チャンピオンだけを優先収集しない。

初期除外: queue≠420、map≠11、対象patch外、10人でない、team/勝敗矛盾、champion不明、早期終了フラグ、試合時間300秒未満。通常の降参は一律除外しない。時間だけで全remakeを判別できるとは扱わない。

RoleはteamPositionを主とする。両チーム各Role一人、対戦相手は別teamを必須とする。teamPosition欠損時にlaneやchampionから推定しない。individualPositionが有効値で矛盾する組も保守的に除外する（除外率を記録）。構造不正は試合全体、rank不足やRole矛盾は該当ペアを除外し、理由を区別する。これは実際のレーン滞在やスワップを証明するものではない。公式もteamPositionを推奨している。[Match-v5](https://developer.riotgames.com/apis#match-v5)

LoLalyticsは選択tierに属するチャンピオンのみを数えると説明し、Emerald+全体勝率が50%にならないことを示している。本案の「対面両者のtierを確認する」母集団とは異なるので数値一致は目標にしない。[LoLalytics](https://lolalytics.com/)

OP.GGはゲーム会社の公式APIから収集すると説明している。両サイトのseed選定、地域配分、内部補正式の詳細は今回の公開資料では確認できていない。本案は独自の設計提案であり、両社の内部方式を再現したという主張はしない。[OP.GG Help](https://help.op.gg/hc/en-us/articles/31091405109401-Can-I-use-OP-GG-data)

## 6. DB構造と再集計

| 保存先・table                    | 主キー / 主な内容                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| raw/collector.sqlite: runs       | run_id、設定JSON/hash、seed、時間窓、version、状態                                     |
| ladder_pages / ladder_entries    | snapshot/platform/tier/division/page、PUUID、取得時刻、完了状態                        |
| rank_snapshots                   | platform/PUUID/fetched_at、queue、tier、division、取得結果                             |
| history_pages / match_sources    | run/seed/window/page、matchId発見元、cursor                                            |
| match_jobs                       | match_id UNIQUE、routing、status、attempts、next_attempt_at、lease期限                 |
| raw_matches                      | match_id PRIMARY KEY、圧縮response JSON、取得時刻、checksum                            |
| processed/stats.sqlite: datasets | dataset_id、config hash、処理version、raw対象集合、状態                                |
| dataset_matches                  | UNIQUE(dataset_id, match_id)、採否・理由・地域・日付                                   |
| participants                     | UNIQUE(dataset_id, match_id, participant_id)、role/champion/team/win/rank snapshot参照 |
| matchup_pairs                    | UNIQUE(dataset_id, match_id, role)、両者と勝者。1試合最大5行                           |
| champion_totals / matchup_totals | dataset/region/role/champion[/opponent]、games/wins                                    |

正規化pairは一組一行、出力時に両方向を生成する。両方向は独立した二試合ではない。集計はdataset単位で作り直し、加算の再実行による二重計上を避ける。transaction完了後だけreadyにする。途中datasetをexportしない。

rawはAPIレスポンスを保持し、後からルール変更に使える。PUUID等はローカル限定、出力は集約のみ。raw/processedのSQLite、WAL、出力を含むdata/全体をGit対象外にする。圧縮率と容量はpilotで実測し、保持期間の削除は未処理データを保護して明示的なcleanupで行う。

## 7. 統計計算・JSON構造

通常勝率は同じdataset・role・rank条件・地域採用条件の有効pairに登場したchampionから計算する。自身の対象対面も通常勝率に含む。baselineのgamesも出力し、異なるroleの勝率を混ぜない。

全勝率と区間は0～100、deltaはpercentage pointsで統一する。

```text
rawWinRate = 100 * wins / games
expectedWinRate = (championOverallWinRate + 100 - opponentOverallWinRate) / 2
matchupDelta = rawWinRate - expectedWinRate
```

expectedモデルを独立関数・modelVersionで隔離する。これは因果的な対面効果の推定ではなく簡易補正。地域構成差やプレイヤーの腕前を十分には補正しない。

95% Wilson区間をraw勝率に計算する。p=wins/n、z=1.959963984540054とし、center=(p+z²/(2n))/(1+z²/n)、half=z*sqrt(p(1-p)/n+z²/(4n²))/(1+z²/n)、上下限=100*(center±half)。n=0は行を作らない。[NIST Wilson interval](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm)

confidenceは依頼のsample bucket（100未満VERY_LOW、300未満LOW、1000未満MEDIUM、それ以上HIGH）を設定化する。「有利である確率」ではない。Wilsonも選手の繰り返しや標本の偏り、baselineの推定誤差、多数対面から上位を選ぶ影響までは扱わない。

初期候補条件はgames≥100、両baseline games≥300、delta>0。並び順は `confidenceLow - expectedWinRate` 降順、同値はdelta、games、champion ID順。この差は小標本を抑える保守的な順位用指標であり、deltaの信頼区間や有意性検定ではない。値が負の候補を「有利と確定」と表示しない。条件を満たす候補が少なければ5体へ水増ししない。

JSONはrole→敵ID→候補配列。名前ではなく安定した数値champion IDを文字列キーに使う。候補行は全観測対面を保持しeligibleForRecommendationで区別、表示時に上位5体を選べる。まずminify+gzipで測定し、必要ならrole別ファイルへ分割する。

以下は構造を示す架空の単一行であり、実統計ではない。全体の地域構成・品質詳細は別のquality.jsonにも出す。

```json
{
  "schemaVersion": 2,
  "metadata": {
    "isDemo": true,
    "patch": "16.18",
    "region": "GLOBAL",
    "platforms": ["KR", "JP1", "NA1", "EUW1", "EUN1"],
    "queue": 420,
    "tier": "EMERALD_PLUS",
    "rankBasis": "current_rank_snapshot",
    "sampling": "region_daily_quota_player_capped_v1",
    "modelVersion": "mean_baseline_v1",
    "rankingVersion": "wilson_lower_minus_expected_v1",
    "generatedAt": "2026-09-15T00:00:00Z",
    "datasetId": "example-only",
    "coverageComplete": false,
    "rateUnit": "percent",
    "deltaUnit": "percentage_points"
  },
  "matchups": {
    "TOP": {
      "266": [
        {
          "champion": 114,
          "opponent": 266,
          "role": "TOP",
          "games": 1000,
          "wins": 530,
          "losses": 470,
          "rawWinRate": 53,
          "championOverallWinRate": 50,
          "opponentOverallWinRate": 50,
          "championOverallGames": 10000,
          "opponentOverallGames": 10000,
          "expectedWinRate": 50,
          "matchupDelta": 3,
          "confidenceLow": 49.901,
          "confidenceHigh": 56.076,
          "confidence": "HIGH",
          "rankingScore": -0.099,
          "eligibleForRecommendation": true,
          "regionGames": { "KR": 200, "JP1": 200, "NA1": 200, "EUW1": 200, "EUN1": 200 }
        }
      ]
    }
  }
}
```

実出力metadataにはさらにwindow、configHash、collectorVersion、対象地域別採用数、欠損地域、rank TTL、除外設定、CI水準、候補閾値を必須にする。未完成runはpreview exportのみ許可し、通常exportでは全地域処理完了を要求する。完了は十分な標本数を保証しないので枠達成率も別記する。

アプリ統合時はMIDDLE→MID、UTILITY→SUPPORTをadapterで変換し、schema 2専用validationと順位表示を追加する。APIキー・PUUID・Riot ID・rawレスポンスをJSONへ含めない。

## 8. ディレクトリとコマンド

```text
tools/stats/
  package.json, tsconfig.json, .env.example
  src/
    cli/           collect, aggregate, export
    config/        schema, defaults, routing
    collector/     client, scheduler, ladder, history, matches
    storage/       migrations, raw-store, processed-store, jobs
    processor/     validation, role, patch, sampling
    aggregator/    totals, expected-model, wilson, ranking
    exporter/      schema-v2, json, quality-report
  tests/fixtures/  架空・匿名化fixtureのみ
  config/default.json
  data/            全体gitignore
    raw/collector.sqlite
    processed/stats.sqlite
    output/<datasetId>/statistics.json, quality.json
```

tools/statsで `npm ci` → `npm run collect` → `npm run aggregate` → `npm run export`。独立package/lockfileとし、rootからは任意の委譲scriptで呼べる。aggregate/exportはAPIキー不要、ネットワーク不要。Nodeのenv file読み込みでローカル.envを明示ロードし、環境変数を優先する。キーはX-Riot-Tokenヘッダーにだけ設定し、ログをredactする。

## 9. Rate Limitと再開

app/method/serviceの制限を考慮し、routing host・methodごとのschedulerでレスポンスのrate-limit/countヘッダーを追跡する。KRとJPのMatch-v5は同じASIAなので別々の独立枠と誤認しない。

初期は保守的な間隔から開始。429ではRetry-After以上待ち、該当scopeを停止。不明scopeなら全workerを止める。5xx/timeoutは指数backoff+jitter、429も指定待ち時間を下回らない。待機期限・attemptsをDB保存する。長い待ちを短く切り詰めない。400/401/403は無限再試行せず停止・原因表示、404は分類して上限付き再確認にする。

jobはpending→leased→done/failed、lease期限切れを再開時に回収する。raw保存とjob完了を同一transactionにする。停止直前に応答だけ受けて保存できなかった場合は再取得し得るが、成功保存済みは再取得しない。collectorを多重起動しないロックも置く。

Personalキーは100 requests/2分などの制限があり、Developmentキーは24時間で失効する。公開運用にはProductionキー申請を計画する。承認や上限は保証しない。[Riot key・rate-limit documentation](https://developer.riotgames.com/docs/portal)

## 10. 必要APIリクエスト数

```text
総数 ≈ L（ladderページ） + H（seed履歴ページ）
     + M（未取得unique試合） + U（cacheにない参加者rank） + 再試行
```

例: 5地域×100 seeds×20 IDs = 最大10,000発見ID。unique率60%と仮定すると詳細6,000 calls。履歴が各1ページならH=500。rank未cache選手を仮に20,000人とするとU=20,000。合計26,500+L。L=500なら27,000 callsだが、これは計算例であり実測値ではない。履歴が100件を超える窓ではHも増える。

最悪は6,000試合×10人=60,000 rank確認に近づく。実際はseed/ladder snapshotとPUUID cacheで削減する。初回ladder全走査のLは地域人口とpage数に依存し、500に収まるという意味ではない。

27,000件を一列で1.3秒間隔なら待ち時間だけで約9.75時間。実際はrouting別に並列化できるがmethod制限・リトライ・rank確認・取得遅延に左右されるため所要時間を保証しない。まず各地域少数seedでpilotし、unique率、rank cache hit率、除外率、bytes/match、各bucketの実効速度を測って本収集予算を決める。

10,000有効試合でも最大50,000ペア、両方向100,000行相当の観測が多数の対面へ分散する。全対面で100 gamesに届く規模ではない。パッチ初期やJP・珍しいピックでは候補不足を許容する。

## 11. V1範囲・検証・実装順

V1: 独立CLI、5地域設定、rank一覧とsnapshot、履歴と詳細取得、永続キュー、dedup、品質検証、地域/選手上限、SQLite raw/cache、同Role集計、通常勝率補正、Wilson、JSON v2、品質レポート、設定・実行手順。

対象外: 自動CDN配信、アプリUI変更、常設サーバー、Timeline/10分15分指標、試合時rankの復元、高度な推定モデル、地域の事後補正。自動定期実行はCLI完成後に運用側で追加できる。

実装は(1)package/config/schema/storage、(2)APIと再開、(3)sampling/processor、(4)集計/export、(5)pilotとdocsの順に意味のあるcommitへ分ける。

検証は架空fixtureで、同Role別teamのみ、重複ID、逆方向wins/losses、rank期限/不明、patch/短時間/role矛盾、Wilson既知値、地域と選手上限、429/再起動/途中transaction、JSON秘密情報不在を確認する。build/typecheck・test・lint・git diffを確認する。認証付きpilotはローカルキーが利用可能な環境で別途実施し、未実施なら明記する。

最初の受け入れ基準は「止めて再開しても二重計上せず、出典と標本条件を説明できるJSONを生成できること」。多数の高信頼カウンターを揃えることは、その後の継続収集量に依存する。
