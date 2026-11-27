# メイプル幻境の世界設計台帳

2026-11-19。GitHubを設計データの正本とし、テイワット・フィールド設計室を地図と配置の編集画面として使う。初版は公開Sites v7と敵配置v8原本を照合したもの。Sitesで先に決まった水中狩場2か所・地方伝説9遭遇の変更を含む。Webの実装状況は既存の実行データとcoverageで確認する。

| 確認したいもの | データ |
| --- | --- |
| 取込元、更新日、件数、照合したコミット | [manifest.json](manifest.json) |
| 24地域とLv帯、979フィールドのモード・出現Lv・体数・任意戦・安全区画 | [regions.json](regions.json) と [placements/](placements/) |
| フィールドID・設計名・接続925本・旧配置・採用した変更履歴 | [editor-snapshot.json](editor-snapshot.json) |
| 863既存ID・176追加ID・分類補正 | [monster-catalog.json](monster-catalog.json) とスナップショットの `data.monsters` |
| 地方伝説56・通常ボス49戦型・本作独自45・特殊2 | [encounters.json](encounters.json) |
| クエスト153件の配置方針、既存のWeb敵・ボスを保護する参照 | [quest-bindings.json](quest-bindings.json)、[runtime-preservation-v8.json](runtime-preservation-v8.json) |
| 公式マップの敵出現13,749地点と出典 | [research/index.json](research/index.json) |
| 公式点から本作フィールドへの参照と根拠の確度 | [research/field-links.json](research/field-links.json)、[research/catalog-provenance.json](research/catalog-provenance.json) |
| 未確認の亜種・同名候補26件と提案 | [research/enemy-audit.json](research/enemy-audit.json) |
| GitHubとSitesの接続・Lv・既存出現・クエスト差分 | [reconciliation.json](reconciliation.json) |
| 実行済みの検証 | [verification.json](verification.json) |

フィールドは `field_id` で結ぶ。所属地域・通常敵の実装候補は `placements/` の `design_region_id` と `regular_spawns` で確認する。採用後にLv・体数を更新した配置は、スナップショットの `placement_overrides` を出現行IDで適用する。旧配置は手動案の比較用。新旧双方から敵を出現させると二重出現になる。

公式の地図目印の座標は [content/map-catalog.json](../../content/map-catalog.json) の873地点を参照する。Sitesの追加106件には旧秘境の目印と本作の設計枠があり、うち32枠に公式座標がない。敵の公式座標は `research/points-*.json` で `map:pointId` と出典を保持する。マーカーの近さや同じ階層は配置判断の根拠で、通行や原作の敵数の証明にはならない。未確認の階層は原典で確認するまで未確認のまま扱う。

### Web・Lua実装を確認する

[coverage](../../content/coverage.json) の `map_catalog.stage_links` を起点に [story-graph](../../content/story-graph.json) を参照する。実装側の通行条件、クエストでの出現・消滅、固有敵のIDとLvは、実行データが基準。[通常敵](../../content/enemy-spawns.json)、[フィールドボス](../../content/field-boss-spawns.json)、[手動配置案](../../content/enemy-placement-drafts.json)、[週ボス](../../content/weekly-boss-spawns.json)、[幽境](../../content/stygian-encounters.json) を参照する。[従来のローカル設計室](../field-editor/project.json) は、その編集プロジェクトのリビジョン・採否履歴を引き続き保持する。

照合したWebステージ873件のうち823件でWebの現在LvとSitesの設計Lvに差がある。Sitesの水中狩場はWebの2地点とも平和区画で、`teyvat:50074` には泳ぎ設定もない。クエスト `sumeru-river-bridge` ではWeb側の案内・演出がv8の取込元から更新されている。Web本体への採用は、対応ステージとクエストを確認して別途判断する。

接続は同じ端点を持つ504組、Sitesにのみ記録がある421組、Webにのみ存在する608組を記録した。方向・条件まで同一とは限らない。ブラウザ草案に由来するドーンマンポートの2組は公開Sitesの元データに含まれていないため、保留一覧に記載した。ローカルの変更履歴と草案は各ブラウザに保存される。

### 確認待ちの出現地点

地方伝説はイチカウイピリの庇護、アンデッド、レジ、トゥプの繁栄の4遭遇で、公式の試練入口と固有名の対応を保留。通常ボス「波濤の投錨者」の `2:106752` は公式ラベルの名前が空欄で、候補点として保持する。v8で経路保留の87フィールドと、公式座標未対応の32設計枠も [reconciliation.json](reconciliation.json) でID別に確認できる。その他の照合範囲と不足は [出現調査の索引](research/index.json) と [敵種照合](research/enemy-audit.json) を参照。

## Sitesとの同期

1. 最新の `main` の [editor-snapshot.json](editor-snapshot.json) をダウンロードする。[設計室](https://teyvat-field-studio.tatsuki602.chatgpt.site/) の「差分を確認」→「GitHubとJSONで同期」で読み込む。差分が競合した場合は値を確認し、元の草案を保存してから編集を続ける。競合のある取込は止まり、正常な取込でも前リビジョンの草案はブラウザに残る。
2. フィールド・接続・敵のLvと体数を編集する。「差分を確認してJSONを出力」で提案を保存する。承認前の草案は「草案と変更履歴を保存」から退避できる。既存の接続を追加・削除した場合は差分に表示される。
3. 最新の `main` に基づく作業ブランチで、提案を検査する。ID変更・座標変更・接続削除・古いリビジョン・実装データへの変更はこの同期経路の対象外。削除が含まれる提案は確認対象として返る。
4. 差分に同意した提案をブランチに適用し、GitHubのPRで採用を確認する。GitHub側の変更が確定したら、手順1で新しい版を読み込む。サイト本体は既存プロジェクトを利用する。

```sh
node tools/world_design/transfer.js check ~/Downloads/teyvat-field-studio-changes.json
node tools/world_design/transfer.js routes ~/Downloads/teyvat-field-studio-changes.json
node tools/world_design/transfer.js apply ~/Downloads/teyvat-field-studio-changes.json
node tools/world_design/transfer.js export /tmp/teyvat-editor-snapshot.json
python tools/world_design/validate.py
```

`check` は照合のみ、`apply` は確認済み提案を設計スナップショットと採用履歴に反映する。配置案のLv帯・出現数上限を検査する。GitHubへ送る差分はスナップショットだけでよい。ブラウザ履歴・地形の校正メタデータはエクスポートに残るので、共有する際は内容を確認する。入力に競合があればファイルへ書き込まない。既存のローカル編集プロジェクトのblobが変わった場合は、先に新旧の設計を照合する。

`routes` は、確認済み差分に含まれる接続の追加・変更・削除を読み取り専用で照合する。地図の両端に対応するステージ、往路・帰路の門と通行条件、記録済みの迂回路を表示する。地図座標のない区画、紐づけが未設定のステージ、ナド・クライ特別地域（仮）はそれぞれ区別できる。記録された経路に現在のステージ間接続が欠けていれば `missing_hops` に表示する。

`connectivity` では、差分全体を適用した場合に新たに孤立する地点や、以前はつながっていた地点群の分断を確認できる。計算には地図座標とステージを持つ現行フィールドを使い、設計上の接続を往復として数える。各方向の入口・レベル・依頼条件は、それぞれのルートの記録で確認する。

地図を再生成すると、採用済みスナップショットで削除された接続は現行の経路候補から外れ、`removed_editor_routes` に記録される。追加・通行種別変更は実装前の照合対象として出力される。既存のフィールド移動は `content/story-graph.json` の門で決まるため、地形・帰り道・通行条件を照合してから反映する。

## 復元元

GitHubは統合前の `backup/pre-sites-integration-20261119-final-base`（`afa5bdb`）。Sitesは同一プロジェクトのv7（`7b8c353`）。公式出典は公開URL・ソースIDで保持している。
