# Windowsでテイワット・フィールド設計室をChatGPTにつなぐ

Secure MCP Tunnelを使うと、このPCからOpenAIに接続し、ChatGPTのツール呼び出しをローカルのMCPへ届けます。Windowsの受信ポートを開ける必要はありません。MCPで変更案を受け取った場合も、正式採用は設計室の「変更案」で差分を確認してから行います。

## 1. トンネルを用意する

1. [OpenAI PlatformのTunnels設定](https://platform.openai.com/settings/organization/tunnels)で、対象の組織を選び、トンネルを作成します。利用を許可するChatGPTワークスペースだけをトンネルに関連付け、Tunnel IDを控えます。
2. [Runtime API keys](https://platform.openai.com/settings/organization/api-keys)でtunnel-client用のキーを用意します。作成・編集には `Tunnels Read + Manage`、実行・選択には `Tunnels Read + Use` が必要です。ChatGPT側でもカスタムMCPサーバーの追加権限を確認してください。
3. [公式tunnel-clientの最新リリース](https://github.com/openai/tunnel-client/releases/latest)からWindows用ZIPを入手し、展開します。x64 PCは `windows-amd64`、Arm PCは `windows-arm64` を選びます。配布元の `SHA256SUMS.txt` と、PowerShellで `Get-FileHash` を実行した結果を照合してください。

[OpenAIのSecure MCP Tunnelガイド](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

## 2. ローカルで起動する

PowerShellでリポジトリのルートを開きます。同じポートを使って設計室を起動済みなら、そのプロセスを終了してから次を実行します。パスとTunnel IDは自分の値に置き換えてください。

```powershell
python -m tools.field_editor.start_chatgpt --client "C:\tools\tunnel-client\tunnel-client.exe" --tunnel-id "tunnel_ここを置換"
```

`--tunnel-id` は省略すると起動後に入力できます。`--open-chatgpt` を付けると、OpenAIへのトンネル接続が確認できた時点で、ローカルの連携設定とChatGPTのプラグイン画面が開きます。

Runtime API keyは、起動後に表示される非表示入力欄に入れます。コマンド、チャット、画面共有、Gitにはキーを貼り付けないでください。MCP用の中継トークンは起動時に生成され、同じ起動処理が開始するエディタとtunnel-clientだけに渡ります。どちらの値も設定画面には表示されません。

- [設計室の「ChatGPT連携」](http://127.0.0.1:8770/chatgpt)を開き、「接続テスト」を押します。このボタンはローカルMCPへの認証とrevision取得を確認します。
- 起動ウィンドウに「OpenAIへのトンネル接続を確認しました。」と表示されてから、ChatGPTに進みます。診断が必要なら、[tunnel-clientの状態](http://127.0.0.1:8772/health?details=true)で `control-plane` を確認します。401が出た場合は同じトンネルのRuntime API keyをコピーし直し、起動時の入力欄に1回だけ貼り付けます。
- テスト結果と最終アクセス時刻は、ChatGPTから呼び出せたかどうかとあわせて確認してください。tunnel-clientの起動時プローブも最終アクセス時刻を更新します。
- 正本は起動した作業ツリーの `design/field-editor/project.json` です。既存の編集用チェックアウトを正本として使い続ける場合や、検証用のコピーを使う場合は、`--data "C:\path\to\project.json"` で実ファイルを指定します。
- ポートが使用中なら `--ui-port`、`--mcp-port`、`--health-port` で空いているポートを指定してください。既定は順に8770、8771、8772です。

## 3. ChatGPTでプラグインを追加する

1. ブラウザで[ChatGPTのプラグイン画面](https://chatgpt.com/plugins)を開きます。「＋」からカスタムMCPサーバーを追加し、名前に「テイワット・フィールド設計室」を入力します。
2. 接続方式に **Tunnel** を選び、設定画面と同じTunnel IDを指定します。この構成ではトンネルの組織・ワークスペース権限とローカル中継トークンで接続を制限するので、ChatGPTの認証欄は **認証なし（No authentication）** を選びます。
3. 警告を読み、プラグインを作成・インストールします。会話の入力欄で `@` を入力してプラグインを選びます。
4. 「＋」やTunnelが表示されない場合は、ログイン中のアカウント、ワークスペースの権限、Platform側のワークスペース関連付けを確認してください。OpenAIの案内ではProは読み取り、書き込みを含む機能はBusinessまたはEnterprise/Eduでワークスペースの許可が必要です。

[ChatGPTへの追加手順](https://developers.openai.com/api/docs/guides/custom-mcp-server) · [アカウントとワークスペース権限](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)

## 4. 会話から確認する

次のようにツール名とIDを指定します。

> 「テイワット・フィールド設計室」を使い、`list_fields` を `map_id=region-01-map` で呼び出してください。ワープ45・七天神像6・秘境13の計64件か確認し、`get_field` で `teyvat:3` の公式座標、推奨Lv、出現敵とLvを取得してください。続けて `get_connection_graph` を同じ地図IDで、`list_monsters` を `region_id=region-01` で実行してください。最後に `get_revision` と `check_design` を呼び出してください。

`list_fields` の `map_id` は地図に載る地点を返します。`kind=domain` で秘境に絞り込めます。 `region_id` は各地点の設計上の分類で絞り込むため、モンドの通常地域だけを指定すると件数が異なります。接続や敵Variantがまだ登録されていない場合、返る一覧は空です。未設定のLvは `null` です。

### アカウントで変更提案が許可されている場合

1. このPCではいつもの起動ショートカットを使い、端末でトンネルIDとRuntime API keyを入力します。コマンドで起動する場合は `--allow-proposals` を付けます。設計室の「ChatGPT連携」で「読み取り・変更案の作成」を確認します。
2. ChatGPTのワークスペース設定でMapleのツール一覧を更新し、`create_proposal` を有効にします。書き込みを利用できるのは、BusinessまたはEnterprise/Eduで該当する権限を付与された場合です。
3. 受入試験はコピーしたJSONを `--data` で指定して実施します。ChatGPTから `get_revision` を呼び、試験用の変更だけを `create_proposal` で送ります。返った提案IDと `base_revision` を控えます。
4. ローカルの設計室で「変更案」タブの「更新」を押し、同じ提案を開きます。差分を確認して採用します。
5. ChatGPTから `get_revision` と `get_change_history` を再実行します。revisionが1つ進み、採用した取引が履歴に表示されることを確認します。

会話ではプラグインのMapleを選び、たとえば「璃月とスネージナヤの対象地点を確認して、指定した2地点を双方向につなぐ変更案を設計室に送って」と依頼できます。地点名が未設定の場合はフィールドIDを使えます。ワープポイントを追加する場合は地図IDと地図上のX/Yを指定します。新しい地点とそれにつながる経路は一つの変更案にできます。

### 読み取り専用で変更案を受け取る場合

ChatGPTに最新の `get_revision` と対象の `get_field` を取得させ、「このrevisionと固定IDを使って、`schema_version`、`base_revision`、`actor`、`reason`、`source`、`operations` を含む変更指示JSONを作って」と依頼します。設計室の「変更案」から「JSON取込」を押し、JSONを貼り付けて差分を作成します。差分を確認して採用してください。MCP自体を利用できない場合は、設計室から相談用JSONまたはMarkdownを出力し、ChatGPTに渡せます。

[変更JSONの例](API_AND_MCP.md#変更指示json)

## 停止と再接続

設定画面で「接続停止」を押すと、そのエディタのMCPが新しい呼び出しの受付を停止します。トンネルとエディタを終了するには、起動したPowerShellで Ctrl+C を押します。再接続するときは同じコマンドを実行します。ChatGPTから連携を解除する場合は、プラグイン設定で削除します。

## Secure MCP Tunnelを使えない場合

ChatGPTでカスタムMCPを利用できるワークスペースなら、独自ドメインのHTTPS URLでも接続できます。公開URLとOAuth 2.1の認可サーバーを管理できる場合に、次の構成で中継を用意してください。

1. エディタとMCPをloopbackで起動します。スタートコマンドは `python -m tools.field_editor.server --mcp-port 8771` です。エディタとHTTPS中継に同じランダムな値を秘密管理から渡します。エディタは `FIELD_EDITOR_MCP_TOKEN` から読み込みます。
2. HTTPS中継はChatGPTのOAuthを処理し、発行元、対象リソース、期限、許可スコープと利用者のアクセス権を検証します。認証後の `/mcp` だけを `http://127.0.0.1:8771/mcp` に転送します。OAuthの検出メタデータは中継側が返します。
3. 中継で公開側のHost・Originを検証します。転送時はHostを `127.0.0.1:8771` に設定し、外部のOriginおよび `X-Field-MCP-Token` を破棄します。中継が持つトークンを `X-Field-MCP-Token` に設定します。閲覧用の中継は読み取り専用で起動したMCPへ接続します。
4. ChatGPTで接続方式に公開HTTPS URLを指定し、認証をOAuthに設定します。エディタのポート8770はローカル操作専用です。

この構成のHTTPS中継とOAuth認可サーバーは利用環境側で用意します。Secure MCP Tunnelを使う起動手順にはこれらの構成は不要です。

[ChatGPTプラグインのOAuth要件](https://developers.openai.com/plugins/build/auth)

## ローカル検証

```powershell
python -m unittest tools.field_editor.test_editor tools.field_editor.test_chatgpt
```

MCPのHTTP待受は `/mcp` のみです。1リクエスト128 KiB、1応答2 MiB、毎分120リクエストまで受け付けます。変更案は最大50操作で毎分10件までです。正式採用とUndo/Redoはブラウザのエディタで操作します。既存のstdio MCPの起動手順は [API・MCP](API_AND_MCP.md#mcp-stdio) を参照してください。
