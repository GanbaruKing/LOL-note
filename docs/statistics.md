# Phase 4: Statistics

Match upの左側とChamp Selectに、Comfort Picksとは独立した統計を表示する。行をクリックするとアプリ内の対象メモを開く。ゲーム側のPickを変更せず、Comfort Picksにも自動登録しない。

## データ

初期版はJSON対応。実際の統計の自動収集・Riot APIによる集計は未実装。通常表示では登録済みJSONを読み、未登録なら空状態を表示する。「サンプルを見る」は架空データであることを明示し、実統計と混ぜない。サンプルはDarius/TOPのみ。

「統計JSONを取り込む」でファイルを選択すると、既存の統計セットを置き換える。20MB上限、schemaVersion、必須メタデータ、Champion ID、Role、試合数、勝利数、行の重複を検証し、検証後に一時ファイルから置き換える。無効なデータでは既存ファイルを維持する。個人メモDBとは別のuserData/statistics.jsonに保存し、再起動後もオフラインで読める。

フォーマットはresources/statistics-sample.jsonを参照。schemaVersion=1、isDemo、source、patch、region、rank、queue、generatedAt、rowsが必須。rowsはmyChampionId、enemyChampionId、role、games、winsを持つ。isDemoはサンプルの場合true。実データでは集計の出典・対象条件を正確に記載する。勝率はwins / gamesから算出する。複数パッチ・ランクの行を一つのセットに混在させない。

同じ敵Champion・Roleに対するgames >= 100の行だけを表示する。勝率降順、同率は試合数降順、さらに同点はChampion ID昇順。表示は小数1桁、並び順は丸め前の値を使う。出典・パッチ・地域・ランク・キュー・作成日時を表示し、現在パッチと一致するとは仮定しない。

## 構成

MainのStatisticsProviderをJsonStatisticsProviderが実装する。RendererはgetStatisticsとimportStatisticsの限定IPCを使い、ファイルパスを指定しない。将来の外部API対応はProviderを追加する。React側は検索条件変更時に前の結果を破棄し、遅れて返った結果を無視する。破損統計でもNotebookの起動を妨げない。

## 検証

単体テストで100試合境界、勝率順、対面・レーン分離、不正値、重複、取り込みの保持・再読み込みを確認。Electronテストでサンプル表示、メモ編集の保護、JSON取り込み、再起動、レーン切り替えを確認する。
