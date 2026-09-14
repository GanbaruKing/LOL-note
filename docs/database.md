# データベース設計

Phase 1ではchampions / matchups / matchup_notesを作る。PRAGMA user_versionでmigrationを管理し、未知の新しいバージョンは拒否する。外部キーを有効にする。SQLへの値の挿入はバインドパラメータで行う。

| テーブル      | 主な列・制約                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| champions     | id INTEGER PK（Data Dragonのkey）、slug UNIQUE、name、name_ja                                                                                   |
| matchups      | id INTEGER PK、my_champion_id FK、enemy_champion_id FK、role CHECK、difficulty CHECK、rating 1–5 nullable、updated_at。Championペア+role UNIQUE |
| matchup_notes | id INTEGER PK、matchup_id FK ON DELETE CASCADE、category CHECK、body（1–10000文字）、created_at、updated_at                                     |

RoleはTOP/JUNGLE/MID/BOTTOM/SUPPORT。Difficultyは未設定/Easy/Even/Hard。表示のためにページを開いただけではMatchupを作らず、最初のメモ保存か評価保存で作成する。ミラーマッチは許可する。日時はUTCのISO 8601。データは `<userData>/notebook.sqlite` へ保存する。

メモ保存とMatchupの作成/更新はトランザクションで行う。Roleや対面を切り替えても同じキーなら同じページを参照する。メモ本文はHTMLとして解釈しない。

## 将来追加するスキーマ

- champion_notes: id, champion_id FK, category, body, favorite, created_at, updated_at。
- champion_pool: champion_id FK, role, confidence CHECK 1–5。champion_id + role UNIQUE。
- my_picks: enemy_champion_id FK, my_champion_id FK, role, priority, confidence CHECK 1–5。3キーUNIQUE。
- settings: key TEXT PK, value TEXT（アプリ側で設定ごとの型を検証）。
- matchup_notesへfavorite INTEGER CHECK IN (0,1)を追加。

これらは利用機能と同じPhaseでmigrationとして追加する。ノートのChampion IDとRoleは親Matchupから取得し、重複保存しない。
