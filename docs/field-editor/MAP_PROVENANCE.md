# 公式地形・座標・取得と権利の確認記録

## 使用する情報

- 公式入口：[HoYoLAB テイワットマップ](https://act.hoyolab.com/ys/app/interactive-map/index.html)
- 地点：既存 `content/map-catalog.json` version 2、取得時刻 `2026-11-17T03:56:46+00:00`。873地点、公式モンド所属51地点（45+6）。カタログのID・座標・公式所属・point_groupは今回変更していません。
- 地図メタデータ：既存カタログに記録された匿名公開 `v3/map/info?app_sn=ys_obc&lang=ja-jp&map_id=...` を取得し、カタログのmap_versionと一致することを確認。原点・画像サイズ・ズーム・取得日時・レスポンスSHA-256を `design/field-editor/map-sources.json` に保存しました。
- テイワットの地図版：`bd70cde160dbd523926208d9fa8961a1`。`origin=[24207,16411]`、`total_size=[36864,32768]`、min_zoom=-4/max_zoom=0。

このmap_versionは公式地図の版の識別子です。ゲームの最新バージョン番号や、全地域が網羅済みであるという保証へ読み替えません。

## 公式サイトが使うタイルと変換

公式HTMLが参照する公開JavaScriptを読み、次を確認しました。認証・アクセス制限を回避する操作は行っていません。

- `bundle_cecaae550a4003092d80.js`：`tileBase="https://act-webstatic.hoyoverse.com/map_manage/map/"`。
- `1_6be3a4156dff00602a2f.js`：マーカーは `[y_pos,x_pos]`。投影は `Point(lng+originX,lat+originY)`、`Transformation(1,0,1,0)`、CRS.Simpleのズーム倍率。
- タイルURLは `{map_id}/{map_version}/{x}_{y}_{N|P}{abs(zoom)}.webp`、タイルは256px。

したがって：

```text
pixelX = (catalogX + originX) × 2^zoom
pixelY = (catalogY + originY) × 2^zoom
column = floor(pixelX / 256)
row    = floor(pixelY / 256)
localX = pixelX - column × 256
localY = pixelY - row × 256
```

画面用パン/ズームは、地形とノードの両方へ同一変換を適用します。Y反転・緯度経度への再解釈・地形に合わせた地点座標の変更は行いません。全51件の変換数値と参照JSのハッシュを `evidence/field-editor/map-alignment.json` に保存しました。Playwrightで実タイルのロードと重ね合わせ画面を確認しています。

単に画像が読めたという結果ではなく、公式の座標系/原点/タイル版/URLの対応を確認しました。一方、日本語地点名・すべての地下フロアの位置・公式のゲーム内到達条件を今回完全照合したわけではありません。

## 秘境の地点

現行の公式マップで日本語ラベル「秘境」に属する公開地点74件を取得しました。通常8地域の内訳はモンド13、璃月11、稲妻11、スメール19、フォンテーヌ7、ナタ5、ナド・クライ5、スネージナヤ3です。地点ID・座標・公式所属・階層情報を `design/field-editor/domain-sources.json` に保存し、設計室でフィールドとして編集できます。公式ピンの説明欄には開放手順も含まれるため、秘境名の確定には使っていません。

`python -m tools.field_editor.build_domains` で秘境を更新し、その後 `python -m tools.field_editor.build_floors` で階層を更新できます。

## 階層画像と追加の地域

HoYoLABの公開 `v2/map/point_group` から取得した階層名・画像URL・範囲・入口IDを `design/field-editor/floor-sources.json` に記録しました。地点には既存カタログのgroup・floor IDを使います。公式クライアントは左上と右下の座標を `imageOverlay` に渡しているため、設計室でもワープポイントと同じ座標系で描画します。

`python -m tools.field_editor.build_floors` で更新できます。保存先を `--output` で指定して取得結果を比較できます。取得時のPNGは画面表示時にローカルの `work/field-editor-tiles/floors/` へキャッシュします。

沈玉の谷、トゥニギの黒淵、オシカ・ナタ、ノヴォキッチェヴには、公式の移動先メニューが開く表示範囲と階層・入口から計78地点を登録しました。表示範囲を使うため所属は照合案です。各マップ定義の `membership_source` に取得元と表示範囲・階層のIDを記録しています。`python -m tools.field_editor.build_branches` で更新できます。

金リンゴ群島の公式map 10は地点・階層とも0件です。ヴェルーリヤ・ミラージュ、シムランカの地図は現行公式一覧で確認できていません。

## 試した取得方法

1. 公式HTML、公開地図情報、公式クライアントが参照するタイルをHTTP GETで調査。公式サイトの現行タイルベースで200とWebP形式を確認できたため、画面キャプチャを引き伸ばした背景やAI推測地形は使用していません。
2. 既存調査ファイルの旧CDNテンプレートも確認しましたが、実装は上記の**現行公式クライアントの配信元**に固定しました。誤った `/ys-map-op/` をhoyoverseホストへ付けたパスは404。404を正しい地形として保存していません。
3. ブラウザのCanvas/PNG出力と整合するよう、同一オリジンの `/tiles/{map}/{zoom}/{column}/{row}` 経由で取得します。任意URLのプロキシではなく、既知の公式マップ版・ズーム・画像範囲・公式ホストに限定しています。タイルはローカル `work/field-editor-tiles/` にキャッシュし、URL・SHA-256の記録を併置します。
4. 失敗時は画像読込でユーザーが権利を確認した公式画像を指定し、公式X/Yの画像範囲を手動較正できます。較正の初期値が正しいとは主張しません。
5. 共有ブラウザツールは初期化エラー、管理プレビューはrelay readinessのタイムアウト。取得の代替として制限を回避したのではなく、ユーザー指定の既存Playwright/Chromiumによるローカル検証で、動くアプリを確認しました。環境の外部公開プレビューURLは発行できていません。

## 利用規約・再配布の扱い

- 公式クライアント冒頭の `Copyright © 2011 - 2026 miHoYo. All Rights Reserved`、公式ページのHoYoverse著作権表記を確認しました。閲覧可能・匿名GETが成功したことは、画像を自由に再配布できるライセンスの根拠にはしません。
- [HoYoLAB利用規約の入口](https://www.hoyolab.com/agreement) は200ですが、取得できたHTMLは動的ページの殻で、全文・最新の個別許諾までは確認できていません。
- 公式copyright文書の候補 `https://sdk.hoyoverse.com/protocol/bh3_global/view/pz-miHoYo-copyright.html` は403でした。アクセス制限の回避や別経路による保護文書の取得は行っていません。
- **地形画像を加工/再配布・商用配信できる許可は未確認**です。匿名の公式地図エンドポイントについても、一般開発者向けの安定API契約・利用上限・SLAが保証されたとは扱いません。認証付き/非公開APIは使用していません。
- Gitに記録するのはコード、メタデータ、取得元、検証結果です。公式タイル、結合画像、公式地形を含むスクリーンショットはGit対象外の `work/` に置き、再配布可能な自作素材として同梱しません。公開ホスティングにもアップロードしていません。
- PNGには `© HoYoverse`、対象地図、revision、提案プレビューの有無を描きます。画像の公開・再配布・ゲーム本番への転用の前には、利用者が適用される現行条件や必要な権利を確認する必要があります。

このエディタはHoYoLABの公式製品ではなく、公式の地形を参照する独立したローカル設計ツールです。
