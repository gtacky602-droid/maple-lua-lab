# API・MCP・外部AI接続

## 接続方式と権限

| 接続方式 | 実際にできること | 必要条件 |
| --- | --- | --- |
| ローカルWeb UI | 手動編集、提案の保存/採用、Undo/Redo、出力 | PCでPythonサーバー起動、同じPCのブラウザ |
| JSON/Markdownの受け渡し | ChatGPTに相談し、生成した変更JSONをユーザー/Codexが取り込む | ネットワーク接続・LLM APIキー不要 |
| CodexのローカルMCP stdio | 正本参照、接続/敵登録/配置/削除/履歴取得、変更案作成 | 同じPCでMCP実行、起動中のAPI、同一のAPIトークン |
| ChatGPT Actions等のHTTPS API | 到達可能なAPIへ参照/変更案の送信 | 所有者が構成する認証付きHTTPSプロキシ、権限設定・トークン |
| ChatGPTのリモートMCP | 参照・整合性検査。許可された場合に変更案の作成 | 専用Streamable HTTP待受とSecure MCP Tunnel。[Windowsでの接続手順](CHATGPT_SETUP.md) |

**ChatGPTのWeb会話から `127.0.0.1` やユーザーのローカルファイルに直接アクセスできるとは仮定していません。** このエディタの設計チャットは限定したオフライン構文変換で、OpenAI等のLLM APIを呼び出していません。

標準はloopbackのみで待受。APIトークンは**読み取りと提案作成**の権限で、正式採用・Undo/Redoを実行できません。採用はブラウザのローカルUIセッションから行います。出典内のactorを `user` と書き換えても権限は昇格しません。スキーマ・MCPには承認ツールを公開していません。

## APIを利用する

十分に長いランダムなトークンをOS/シークレット管理側で生成し、サーバーとMCPクライアントの環境変数 `FIELD_EDITOR_TOKEN` に同じ値を設定します。トークンをGit・設計JSON・チャットの本文へ記録しません。未設定の場合、外部Bearer連携は無効です。通常の手動UIはトークン設定なしで動きます。

サーバー：

```sh
python -m tools.field_editor.server
```

クライアントは `Authorization: Bearer <環境に設定したトークン>` と `Content-Type: application/json` を使います。主なルート：

| HTTP | 用途 |
| --- | --- |
| GET /api/project | 全コレクション・履歴・提案を一括取得 |
| GET /api/fields?region_id=region-01 | 地域別フィールド、解決済み敵Lv・接続・公式座標 |
| GET /api/fields/teyvat%3A3 | 単一フィールド |
| GET /api/history?field_id=teyvat%3A3 | 対象に関係する履歴 |
| GET /api/report?start=teyvat%3A3 | 接続と地域Lv検査 |
| GET /api/export?map_id=region-01-map&format=json | 地域別エクスポート |
| GET /api/export?map_id=all&format=runtime | 地域間接続を含む全地域の承認済みデータ |
| POST /api/proposals | 正規化済み操作配列を提案として保存 |
| POST /api/compile | 限定日本語構文を操作へ変換。曖昧なら候補を返す |
| POST /api/operations | MCPと共通の操作ゲートウェイ |
| POST /api/rollback | 過去の変更を戻す提案を作成 |
| POST /api/approve | ローカルUIのみ。差分・採用確認が必要 |
| POST /api/undo | ローカルUIの明示Undo/Redoのみ。過去取引の逆差分を履歴保存 |

APIが返すエラーは400（値/参照の検証）、401（認証）、403（Origin/Host/承認権限）、409（古いrevision・確定値上書き未確認・巻き戻し衝突）です。部分適用しません。最大リクエスト4MiB、変更案は1〜2000操作です。

共通操作の例：

```json
{
  "operation": "connect_fields",
  "arguments": {
    "base_revision": 0,
    "reason": "ユーザーと相談した街道接続案",
    "actor": "ChatGPT",
    "from_field": "teyvat:3",
    "to_field": "teyvat:7",
    "direction": "one_way",
    "kind": "level",
    "conditions": {"requires_discovery": true, "min_level": 8}
  }
}
```

これは提案を返し、接続の正本を変えません。採用済みの値と異なる場合はbefore/afterと既存の出典を返し、UIで確認します。既存レコードの更新にIDを、新規登録に衝突しない固定IDを使ってください。新規Family/Variantはスキーマに定義した各プロパティを指定し、未設定・継承は `null` 等で明示します。

## 変更指示JSON

画面の「変更JSONを取り込む」へ貼り付ける例：

```json
{
  "schema_version": 1,
  "base_revision": 0,
  "actor": "ChatGPT",
  "reason": "相談したフィールドLvの変更案",
  "source": "相談用Markdown revision 0に基づく提案",
  "operations": [
    {
      "collection": "field_definitions",
      "id": "teyvat:3",
      "changes": {"recommended_level": 8}
    }
  ]
}
```

`base_revision=0` は例です。実際は最新エクスポートの値を使います。1つのレコードへの変更は1操作にまとめます。削除は `{"collection":"field_edges","id":"既存edge_id","action":"delete"}`。公式座標・固定IDの書き換えは不可です。

## MCP stdio

サーバー起動中に、同じリポジトリを作業ディレクトリとして実行します。

```sh
python -m tools.field_editor.mcp
```

Codex用の設定例（パスは自分のPCの絶対パスへ置換）：

```toml
[mcp_servers.field-design]
command = "python"
args = ["-m", "tools.field_editor.mcp"]
cwd = "/absolute/path/maple-lua-lab"
env_vars = ["FIELD_EDITOR_TOKEN"]
```

別ポートの場合は、クライアントに `FIELD_EDITOR_URL=http://127.0.0.1:8771` を設定します。MCP側はHTTP APIへ転送するだけで、正本ファイルを直接書きません。protocolVersion `2024-11-05` のstdio JSON-RPCとしてinitialize、tools/list、tools/call、ping、notificationsを扱います。

公開する16ツール：get_field / list_fields / compare_fields / export_map / get_change_history / check_connections / update_field / add_enemy / remove_enemy / set_enemy_level / set_elite / connect_fields / delete_connection / register_monster_family / register_monster_variant / update_monster_variant。

`set_enemy_level` は**特殊配置のLv上書き**です。全参照先を変える基準Lv調整は `update_monster_variant` を使います。特殊Lvを解除するには `set_enemy_level(level=null)`、配置を通常個体へ戻す変更は `field_spawns.special=false` と `level_override=null` を同時に提案します。

## HTTPSで接続する場合

リモートMCPの第一候補はSecure MCP Tunnelです。HTTPSでリモートMCPを構成する場合は [ChatGPT連携手順](CHATGPT_SETUP.md#secure-mcp-tunnelを使えない場合) を参照してください。以下はChatGPT Actionsなどから既存HTTP APIを使う場合の手順です。ユーザーが所有する到達可能なHTTPSエンドポイントと認証設定が必要です。

1. ローカルUIはloopbackのまま維持します。
2. 認証付きHTTPSプロキシで**参照・提案用のAPIルートだけ**公開します。`/api/bootstrap`、`/api/approve`、`/api/undo`、静的UIへの外部アクセスを許可しない構成にします。
3. プロキシのホストを `FIELD_EDITOR_TRUSTED_HOSTS` へ明示登録します。Host/Origin検査を無効化しません。プロキシもAPIトークンを保持し、各連携に許可した利用者だけを認証します。
4. OpenAPIのserversをそのHTTPS URLに設定し、ChatGPT側のActions/対応コネクターでBearer/OAuth等を構成します。OAuthを使う場合、その認証・トークン変換はプロキシ側で別途実装します。本サーバー自体はOAuthサーバーではありません。

このアプリのUI全体を単にインターネットへ公開するだけでは、所有者認証になりません。到達可能性・権限設定・接続先サービスの現行対応を確認してから有効化してください。

## 仕様ファイル

- `tools/field_editor/schemas/openapi.json`：OpenAPI 3.1。
- `tools/field_editor/schemas/schema.json`：JSON Schema Draft 2020-12。`$defs/project`、`proposal_request`、`map_definition`、各コレクション。
- `tools/field_editor/schemas/tools.json`：MCP各ツールの引数スキーマ。

画面起動中は `/openapi.json`、`/schema.json` からも取得できます。再生成は `python -m tools.field_editor.build_schema`。ゲーム側ランタイムの生成形式・継承と採用状態の扱いは [DATA_MODEL.md](DATA_MODEL.md)。
