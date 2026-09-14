# 実統計の取得元調査

調査日：2026-09-14。今回は提供方法の調査と少数の読み取り試験のみ。アプリへの自動取得の組み込み、第三者への問い合わせ、APIキーの取得は行っていない。

## 結論

長期の実装候補はRiot Match-v5からの自前集計。取得条件と母集団を自分で管理でき、現在のStatistics JSONへ出力できる。一方、実装と収集時間が必要で、大手サイトと同じ規模・精度にはすぐ到達しない。

既成統計の候補としてOP.GG公式MCPが見つかった。対面勝率・試合数の応答を確認できたが、配布するElectronアプリへの組み込み、キャッシュ・再表示条件、料金、制限は確認できていない。一般ヘルプとの適用範囲も不明のため、本採用は保留する。

## 比較

| 候補 | 取得方法・確認結果 | 条件・費用 | 更新・制約 |
| --- | --- | --- | --- |
| Riot Match-v5 | 公式の試合APIから収集して対面別に集計 | APIキーが必要。公開運用はProduction Key。今回確認した資料に従量課金表はなく、運用・保存費用は別途見積もり | 自前で定期収集。レート制限、重複排除、パッチ・レーン・母集団管理が必要 |
| OP.GG公式MCP | lol_get_champion_analysisのweak_countersで対面情報を確認 | 読み取り試験は認証なしで成功。無料無制限・再配布可能という意味ではない。料金とアプリ組み込み条件は未確認 | サーバー側更新。要求可能な地域・パッチ条件が限定的。返却形式は通常のJSON DTOではない |
| LoLalytics | 公開サイトの統計表示を確認 | 公開API契約・アプリ内再表示の許諾・料金は今回確認できず | 非公開エンドポイント依存での本採用は見送る |
| U.GG | 今回のページ取得は403。利用可能な公式データ提供条件を確認できず | 不明。禁止と断定する根拠にはしない | 本採用判断に必要な情報が不足 |

## Riot方式の設計案

1. 開発用の収集CLIをアプリとは分けて実装する。APIキーは環境変数で読み、ログ・Git・配布バイナリには含めない。
2. 最初は対象サーバー、Ranked Solo/Duo、単一パッチに限定する。Match IDを重複排除し、同じ試合の同じ役割同士を対応させる。役割不明やリメイク等の扱いを明示する。
3. Match-v5の試合単体から試合時点のランクを断定しない。参加者の現在ランクで選別するなら、その採集方法を明記する。未検証のEmerald+等を表示しない。
4. gamesとwinsを集計して既存JSON形式へ出力。少数のプレイヤーの履歴から作った統計は、その標本の統計として表示し、全体勝率と称さない。
5. 429のRetry-After、再開、キャッシュを実装する。100試合閾値は表示条件であり、偏りのない標本を保証する条件ではない。
6. 公開段階では収集を管理側サーバーで行い、アプリにAPIキーを配らない。提供する集計データと製品の用途についてRiotの審査条件を確認する。

開発キーは24時間で失効。Personal Keyは20リクエスト/秒・100リクエスト/2分で、公開アルファ・ベータを含む公開運用には使えない。Production Keyの開始上限は500/10秒・30,000/10分（地域ごと）。GitHubリポジトリだけではProduction Key申請用の動作する製品サイトの代わりにならない。

## OP.GG公式MCPの読み取り試験

公式README記載の https://mcp-api.op.gg/mcp にtools/listを送り、lol_get_champion_analysisの公開スキーマを確認。DARIUS / top / ranked / emerald_plusで1件の問い合わせを行い、対面のChampion ID、play、win、my_win_rate、counter_win_rateを取得できた。選手名・個人履歴は取得していない。

注意点：weak_countersのwinは対象Champion側の勝利数として解釈すべき応答だった。今回のAnivia行はplay=127、win=53、my_win_rate=0.42、counter_win_rate=0.58。対面候補側のwinsとして53をそのまま流用すると逆転する。丸め済み勝率から勝利数を復元せず、意味の確定した件数を使う必要がある。

trends.win.versionは16.18だったが、この値がcounter行の集計パッチまで保証するかは未確認。地域指定は公開ツールの入力項目に存在しなかった。counter一覧は3行で、全候補の網羅性も未確認。これらを推測で現在のJSONメタデータに埋めない。

OP.GGヘルプには第三者にデータを提供しないという案内がある一方、公式MCP READMEはAIエージェントへのゲームデータ提供を説明している。MCPコードのMITライセンスを、統計データ自体の再配布許諾と同一視しない。確認するなら、Electronアプリへの表示、キャッシュ、帰属表示、許される取得頻度、料金、パッチと地域の意味を対象にする。

## 出典

- [Riot API一覧](https://developer.riotgames.com/apis#match-v5)
- [Riot Developer Portal：キー種別・制限](https://developer.riotgames.com/docs/portal)
- [Riot General Policies：登録・キー管理](https://developer.riotgames.com/policies/general)
- [Production Key Applications](https://support-developer.riotgames.com/hc/en-us/articles/22801383038867-Production-Key-Applications)
- [OP.GG公式MCP README](https://github.com/opgginc/opgg-mcp)
- [OP.GG：Can I use OP.GG data?](https://help.op.gg/hc/en-us/articles/31091405109401-Can-I-use-OP-GG-data)
- [LoLalytics](https://lolalytics.com/)
- [U.GG](https://u.gg/)
