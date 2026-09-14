# データベース設計

現在のuser_versionは4。過去のバージョンから順にトランザクションで移行する。

Phase 1ではchampions / matchups / matchup_notesを作る。PRAGMA user_versionでmigrationを管理し、未知の新しいバージョンは拒否する。外部キーを有効にする。SQLへの値の挿入はバインドパラメータで行う。

| テーブル      | 主な列・制約                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| champions     | id INTEGER PK（Data Dragonのkey）、slug UNIQUE、name、name_ja                                                                                   |
| matchups      | id INTEGER PK、my_champion_id FK、enemy_champion_id FK、role CHECK、difficulty CHECK、rating 1–5 nullable、updated_at。Championペア+role UNIQUE |
| matchup_notes | id INTEGER PK、matchup_id FK ON DELETE CASCADE、category CHECK、body（1–10000文字）、created_at、updated_at                                     |

RoleはTOP/JUNGLE/MID/BOTTOM/SUPPORT。Difficultyは未設定/Easy/Even/Hard。表示のためにページを開いただけではMatchupを作らず、最初のメモ保存か評価保存で作成する。ミラーマッチは許可する。日時はUTCのISO 8601。データは `<userData>/notebook.sqlite` へ保存する。

メモ保存とMatchupの作成/更新はトランザクションで行う。Roleや対面を切り替えても同じキーなら同じページを参照する。メモ本文はHTMLとして解釈しない。

## Schema v2: チャンピオン単体メモ

`champion_notes` を追加する。列はid INTEGER PK、champion_id FK、category CHECK、body（1〜10000文字）、created_at、updated_at。Roleや敵Championには依存しない。

v1からの起動時にトランザクションでテーブルとインデックスを追加し、user_versionを2に進める。既存のmatchupsとmatchup_notesは変更しない。移行と単体メモの再起動後の復元を統合テストで確認する。

## 将来追加するスキーマ

今後の統計集計・試合履歴は、取得方式の決定に合わせて追加する。

これらは利用機能と同じPhaseでmigrationとして追加する。ノートのChampion IDとRoleは親Matchupから取得し、重複保存しない。

## Schema v3: レーン別Champion Pool

champion_poolにchampion_id FK、role CHECK、confidence INTEGER CHECK 1〜5を保存する。主キーは(champion_id, role)。同一レーンでの再登録は自信度の更新となり、別レーンの登録には影響しない。削除はプールの行だけを対象とし、ノートを保持する。

v1/v2から起動時に順次migrationする。v2からの移行、レーンごとの分離、重複登録、解除、既存ノートとプールの再接続後の保存をRepositoryテストで確認する。

## Schema v4: My Picks / Pin / 設定

my_picksは(my_champion_id, enemy_champion_id, role)を主キーとし、priority 1〜99、confidence 1〜5を保存する。候補はpriority昇順・confidence降順。Poolとは独立して管理する。

champion_notesとmatchup_notesにpinned INTEGER NOT NULL DEFAULT 0 CHECK IN (0,1)を追加。既存メモはPinなしとして移行する。Pinを先頭に並べ、本文編集でもPinは保持する。

settingsはkey TEXT PRIMARY KEYとvalue TEXT。現在はleagueFolderだけをMainが書き込む。LCUのパスワード・ポートは保存しない。

横断検索は個人Notebookの規模を前提にJOIN/UNIONした行をJSで日英名・本文・Role・CategoryのAND条件で絞り込む。大規模化したらFTSとページングを検討する。検索入力は200文字まで。
