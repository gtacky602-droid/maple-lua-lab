# データ契約と正本の境界

## 参照する既存正本

- 地域ID：`content/coverage.json` の `region-01`〜`08`、`branch-01`〜`09`、`hidden-01`〜`03`。
- 公式マップID・ワープ/神像ID・座標：`content/map-catalog.json`。`teyvat:3`、`map9:25264` 等の固定IDをそのままfield_idに使用。
- 地域Lv：今回の明示指示と `docs/quest-v1/COMMON.md` / `SIX_DECISIONS_DRAFT_V01.md`。地域の基準と個別フィールドへの敵配置は別。
- 生の公式地域区分と本作の地域区分は別。例えば `area_id=1` の公式モンドには通常地域・雪山・港側が含まれるため、公式所属を保持したまま設計レイヤーで分類。

## 保存場所

| データ群 | 保存場所と用途 |
| --- | --- |
| map_nodes | 既存 `content/map-catalog.json.nodes` を読み取り専用で参照。新定義が持つ追加の確認済み `map_nodes` も可。既存ノードの座標上書きは禁止 |
| 地図定義 | `design/field-editor/maps/*.json`。map_id・region_id・official_map_id・ノードID・地域Lv基準・レイヤー |
| 公式地形メタデータ | `design/field-editor/map-sources.json`。原点、画像サイズ、ズーム、版、URL、取得日時、ハッシュ |
| field_definitions | `design/field-editor/project.json.field_definitions`。各地点の2D設計値 |
| field_edges | 同ファイル `.field_edges`。ユーザーが採用した一般有向グラフ |
| monster_families | 同 `.monster_families`。敵系統・共通データ・素材参照 |
| monster_variants | 同 `.monster_variants`。地域別monster_idと上書き値 |
| field_spawns | 同 `.field_spawns`。Variant参照・出現数・条件・特殊Lv |
| design_history | 同 `.design_history`。項目単位のbefore/after・理由・変更者・採用者・日時 |
| proposals | 同 `.proposals`。未採用案、作成時revision、差分、影響フィールド |
| graph_layouts | 同 `.graph_layouts`。view_idごとの独立したノード配置 |
| graph_exceptions | 同 `.graph_exceptions`。警告の理由付き例外承認 |

原子的に保存するため、編集対象のコレクション、提案、履歴は**一つのプロジェクトJSON**にまとめています。APIの一取引で別ファイルの片方だけ更新される状態を避けます。地理、設計、グラフ、敵、出現設定は別コレクションで、ID参照により連携します。ゲーム側の `content/enemy-spawns.json`、`story-graph.json`、Luaは変更しません。

公式名称と階層が未取得なら、API/出力の `official_location_name_ja` は「名称未確認」、`official_layer` は `unknown`。階層情報があるときはgroup/floorを表示します。フィールド名・設計上の地点別名を公式情報へ昇格させません。

## 各項目の決定状態

```json
{
  "field_id": "teyvat:3",
  "name": "設計上の狩場名",
  "recommended_level": 8,
  "_meta": {
    "name": {
      "state": "approved",
      "source": "ユーザーが画面で採用した根拠",
      "actor": "user",
      "updated_at": "2026-11-17T00:00:00+00:00"
    },
    "recommended_level": {
      "state": "approved",
      "source": "相談・仕様書・コミット等の出典",
      "actor": "ChatGPT",
      "updated_at": "2026-11-17T00:00:00+00:00"
    }
  }
}
```

上は抜粋例。完全なレコードでは、スキーマに定義した各プロパティと `_meta` が必要です。

`unassigned → proposed → approved → implemented → verified` を使います。Lvだけ採用済み、敵や名前は未設定という状態を保持できます。チャット/インポートで作った案は `.proposals` に保存し、採用値を変えません。提案JSON内に `states: {"...":"verified"}` が書かれていても、インポートだけで状態は昇格しません。UI採用時にも「既に採用した同じ値」「実装後の検証」という条件をサーバーで確認します。

未承認のソース値をランタイムへ出しません。Variantの `null` は系統から継承、`0` や `[]` は明示的な上書きです。基準Lv・HP・攻撃・防御・EXP、行動・素材・アニメ・元素・ドロップに対応します。継承元が未採用なら、ランタイムにはその値を解決出力しません。出現Lvは基本的にVariant参照であり、`special=true` の配置だけ `level_override` を持てます。

## 接続とグラフ

`edge_id` を固定し、from_field、to_field、direction、kind、conditions、exit_position、entrance_positionを保存します。directionはboth/one_way。kindはportal/level/quest/hidden/boat/temporaryです。Lv条件・クエスト条件・一時条件の必須データを検査し、存在しないfield_idは登録できません。ファストトラベルの発見必須条件をOFFにする変更は受け付けません。

通常の徒歩/ポータル移動で初訪問することと、未発見フィールドへのファストトラベルを区別します。`can_travel(..., fast_travel=true)` のときだけ発見済みチェックを追加し、レベル/クエスト/一時条件はどちらの移動にも適用します。逆向きに移動する場合は、bothのエッジを出発/到着の向きを入れ替えて評価するランタイムアダプターが必要です。

グラフ位置は `layout_id` / `view_id` / `field_id` / x / y。地図のX/Yとは別の座標空間です。グラフの配置変更や攻略ルート表示で公式座標は変更されません。ツリーに限定しません。

## 変更・履歴・巻き戻し

- `base_revision` は数値必須。正本が進んだ案は採用できず、新しいbefore値で再プレビューします。
- 既存の採用済み項目の上書き/削除は、UIの明示確認がないと409で拒否します。
- 変更者actorと、採用したユーザーapproved_byを別に保存します。actor/sourceは出典ラベルであり、API権限を与える値ではありません。
- 一取引をメモリ上で検証し、すべて妥当な場合だけ履歴と一緒に一時ファイル→fsync→置換で保存します。参照切れがある変更案は一部だけ適用しません。
- プロセス間ロックとファイルハッシュで、別エディタやCodexによる正本の更新を検出します。外部変更を読み直し、古いスナップショットで上書きしません。
- Undo/Redo・巻き戻しも新たな履歴です。過去の履歴を削除しません。後から別の値に変わった項目へ古い逆差分を強制適用しません。
- 取り消して元の未設定に戻した項目は未設定を復元。過去の実装済み/検証済み値へ戻す場合は採用状態から再記録し、自動的に再検証済みとはしません。
- 新たな通常編集を採用すると、そのブラウザのRedoは破棄します。過去の案は提案一覧に保持し、必要なら履歴から再レビューできます。

## 地域をJSONだけで追加する

`design/field-editor/maps/new-map.json` の例：

```json
{
  "map_id": "my-region-surface",
  "region_id": "既存の正本地域IDまたは新規の固定ID",
  "name": "新しい地域",
  "kind": "official_layer",
  "official_map_id": 99,
  "node_ids": ["map99:12345"],
  "map_nodes": [
    {
      "id": "map99:12345", "source_id": 12345, "map_id": 99,
      "kind": "waypoint", "x": 100, "y": 200,
      "area_id": 99, "region": "確認済みの公式地域名"
    }
  ],
  "level_guide": {
    "recommended": null, "enemy_min": null, "enemy_max": null,
    "deepest": null, "state": "unassigned", "source": "未設定"
  },
  "layers": ["all", "surface", "underground", "unknown"],
  "temporary": false,
  "membership_source": "確認元のURL・版・取得日時",
  "membership_state": "proposed",
  "exclude_from_normal": [],
  "map_source": {
    "official_map_id": 99, "name": "新しい地図",
    "origin": [0, 0], "total_size": [1024, 1024],
    "min_zoom": -2, "max_zoom": 0,
    "map_version": "実際に取得した版",
    "retrieved_at": "2026-11-17T00:00:00+00:00",
    "source_url": "公式の確認元URL", "sha256": "取得レスポンスのハッシュ",
    "tile_template": "https://act-webstatic.hoyoverse.com/map_manage/map/{map_id}/{map_version}/{x}_{y}_{suffix}.webp"
  }
}
```

数値は書式例であり、実在の地図データではありません。実際には確認済みデータに置換します。既存カタログのノードを使う場合 `map_nodes` は不要。既存の地形を使う場合 `map_source` も省略できます。定義を追加してサーバーを再起動すると一覧に出て、未設定のフィールドが追加されます。同じ公式地図に地上・地下・設計用の別map_idを設けることができ、1つのregion_idに複数のmap_idを持てます。固定IDは英数字・`:`・`-`・`_`で指定してください。

地下平面図を別の背景として表示するには、その公式レイヤーに対応した画像/原点/ノードを確認して追加します。`point_group`があるという理由だけで存在しない地下タイルURLを作りません。
