# Global Matchup Stats Collector

Riot APIから試合を収集し、同Roleの対面統計を生成する独立したTypeScript CLIです。ElectronやアプリのノートDBには依存しません。Node.js 24以降を使用します。

```text
Riot API → raw SQLite → 検証・標本選択 → 集計SQLite → statistics.json
```

## 実行

プロジェクトのルートから:

```powershell
cd tools/stats
npm ci
```

このPowerShellで設定済みの `RIOT_API_KEY` を使うか、`.env.example` を `.env` にコピーしてローカルエディターでキーを設定します。既存の `.env` は上書きしないでください。環境変数があれば `.env` より優先します。別のPowerShellに設定した変数はこのプロセスへ自動で引き継がれません。

```powershell
npm run collect
npm run aggregate
npm run export
```

collectは最初の実行でパッチと直近48時間の窓を固定します。30秒ごとにリクエスト数などを表示します。デフォルトの5地域・Emerald+では多数のAPI呼び出しが必要です。1回の起動で30,000 callsに達すると進捗を保存して停止します。

**同じコマンドを再実行すると再開します。** `Ctrl+C` で停止した場合も同様です。終了済みrunの次の時間窓を収集するには:

```powershell
npm run collect -- --new
```

V1は一つのrunの固定窓を集計します。複数runを足し合わせたパッチ全期間の累積統計はまだ生成しません。raw試合はrunをまたいで再利用しますが、各runの標本・ランクスナップショットは分離します。

## 出力とアプリとの関係

成功したexportは保存先を表示します。

```text
data/output/<datasetId>/export-<id>/
  statistics.json
  statistics.json.gz
  quality.json
  manifest.json
```

`manifest.json` は全ファイル保存後に書かれます。途中停止したexportフォルダーは公開に使わないでください。

JSONは `matchups[role][enemyChampionId]` から取得できます。候補行を `eligibleForRecommendation` で絞り、配列先頭から3〜5体を使います。0体ならデータ不足として扱います。勝率とWilson区間は百分率、deltaはpercentage pointsです。`rankingScore = confidenceLow - expectedWinRate` は順位用の近似指標で、deltaの信頼区間ではありません。

**これはschemaVersion 2です。現在のアプリのschemaVersion 1インポーターにはまだ読み込ませられません。** アプリ側のadapter・表示は次の工程です。MIDDLE/UTILITYをアプリのMID/SUPPORTへ変換する必要があります。

## 条件変更とpilot

`config/default.json` を別名でコピーして編集し、新しいrunに渡します。

```powershell
npm run collect -- --new --config config/my-config.json
```

| 設定                                        | デフォルト / 意味                                               |
| ------------------------------------------- | --------------------------------------------------------------- |
| platforms                                   | KR, JP1, NA1, EUW1, EUN1。単一地域ならmetadata.regionもその地域 |
| tiers                                       | EMERALD, DIAMOND, MASTER, GRANDMASTER, CHALLENGER               |
| patch                                       | auto。開始時のData Dragon最新版major.minorに固定                |
| lookbackHours                               | 48。取得窓は開始時に固定                                        |
| seedsPerRegionPerDay                        | 100。地域内tier/division人数比に比例して抽選                    |
| matchesPerSeedPerDay                        | 20。窓全体の履歴からhash選択                                    |
| matchesPerPlayerPerDay                      | 20。seed以外も含む全参加者の採用上限                            |
| matchesPerRegionPerDay                      | 2000。地域別上限、不足を他地域で埋めない                        |
| rankTtlHours / rankDistanceHours            | 24 / 48。cache期限 / 試合とrank確認日時の最大距離               |
| minimumDurationSeconds                      | 300                                                             |
| excludeEarlySurrender / excludeRoleConflict | true / true                                                     |
| minimumGames / minimumBaselineGames         | 100 / 300。候補採用の最低試合数                                 |
| confidenceThresholds                        | 100, 300, 1000。試合数のbucket境界                              |
| requestIntervalMs                           | 1300。初期のhost別最小間隔、ヘッダーで追加待機                  |
| maxAttempts / requestBudget                 | 6 / 30000。再試行上限 / 一起動のRiot呼び出し上限                |

日別はUTCです。直近48時間は端の部分日を含め通常3つの日付にまたがり、部分日にも同じ採用上限を使います。枠の達成率はquality.jsonに載ります。

小さいpilotではまずseedsPerRegionPerDayを2程度にします。ただしseed数を減らしても、Emerald/Diamondの一覧全走査は省略しません。配線確認だけを急ぐ場合は明示的にJP1・MASTERだけへ設定できます。その出力はEmerald+ Globalとは別母集団です。

品質レポートでacceptedMatches、acceptedPairs、除外理由、地域/日別の枠達成率、uniquePlayers、最多選手の寄与、API requests・cache hitsを確認してから規模を増やします。

再集計だけを行う場合は、元の設定と同じ収集条件を持つファイルを使います。

```powershell
npm run aggregate -- --config config/my-config.json
npm run export
```

オフラインで変更できるのは候補閾値・confidence境界・地域/選手採用上限・試合時間/Role/早期終了除外・rank距離です。収集地域・tier・seed数などの変更は新しいrunを要求します。除外を緩めても、旧条件のため取得されなかったrankは補完できず、未知の組は除外されます。

## データの意味

- Emerald+は対面の**両者**をrank snapshotで確認します。試合時のランクを復元したものではありません。
- 同Role・別teamの組だけを使用し、通常の降参は一律除外しません。Role欠損・矛盾は推測せずペア除外します。
- Globalは設定地域の標本です。世界の全試合でも人口比重み付けでもありません。対面ごとの地域gamesも参照してください。
- 通常勝率の母集団は、同じ条件で採用した同Roleの有効ペアです。サイトごとの母集団の違いでOP.GG等と数値は一致しません。
- HIGHは試合数bucketです。有利である確率や品質保証ではありません。Wilson区間も選手の相関や標本の偏りは補正しません。
- `coverageComplete` は全地域の処理完了を示し、十分な試合数を保証しません。

## エラーと再開

- 429: Retry-After以上待ち、待機期限をDBに保存。中断しても待機を短縮しません。
- 5xx/通信失敗: 指数backoff+jitter。規定回数で停止。
- 401/403: その場で停止。キーや権限をローカルで確認。
- rank 404: 上限付き再確認後、rank不明として該当ペアを除外。
- match/ladder/history取得が解決しない場合: 全地域完了にせず停止。

原因を解消した後、失敗jobを明示的に再試行できます。

```powershell
npm run collect -- --retry-failed
```

未完了runを検査する場合だけ以下を使います。previewはmetadataに明記されます。

```powershell
npm run aggregate -- --preview
npm run export -- --preview
```

`--run ID` で対象run、`--data PATH` で保存先を指定できます。通常はGit対象外のデフォルトdata/を使ってください。収集中の同時aggregate/exportを含め、同じ保存先への多重起動は拒否します。OSのPID再利用でロックが残ったように見える場合は、DBを削除せず実行プロセスを確認してください。

## 保存構造と設計からの実装上の整理

raw/collector.sqliteのresponsesは圧縮されたAPI responseを保持し、jobs/checkpointsは再開位置を保持します。ladder/history専用のページtableは共通responses/checkpointsへまとめました。match詳細のcache keyは `match:<matchId>` で一意です。保存とjob完了は同一transactionです。

run_matchesとmatch_sourcesが標本の出所を保持し、ranksはrun内で固定、rank_cacheはrun間で再利用します。処理済みDBはdataset_matchesとmatchup_pairsに採否と両選手/rank evidenceを保持します。個別participants tableはpair内のJSONへまとめ、champion/matchup totalsは再生成可能なdataset JSONとして保存しました。両DBはschema version 1です。

最初の実装はネットワークを直列化しています。host/methodの制限を共有し、未知の429 scopeは全体停止します。将来並列化する場合もschedulerを共有する必要があります。集計はrun単位のメモリ処理なので、大規模な全パッチ集計へ拡張する際はSQL集計や分割処理が必要です。

rawにはPUUIDなどが含まれるため**DBは公開しません**。data/と.envはGit対象外です。アプリや配布用JSONへAPIキー・個人識別子は入れません。raw削除コマンドはV1では提供せず、保存量を確認してバックアップを含む保持方針を決めます。

## 開発と検証

```powershell
npm run build
npm test
npm run lint
```

架空fixtureで429・再開・重複排除・rank/Role/patch除外・標本上限・Wilson・CLI aggregate/exportを検証します。実Riot APIによる収集成功とは区別してください。初回実装時はこの作業環境にAPIキーがなく、認証付きpilotは未実施です。

詳細な統計上の判断と公式出典は[設計書](../../docs/global-statistics-design.md)を参照してください。
