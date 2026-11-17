# Codex取り込み手順 — 全地域ルートv2

## 最初に

添付は**設計提案**。ローカルの正本に直接上書きせず、既存マップエディタへ変更案として取り込む。ゲームコード・公式カタログ・公式座標・敵VariantのLvを変更しない。

`plan.json`を`project.json`へコピーしてはいけない。前回モンド本土・雪山・ドーンマンポートの案は`reference/mondstadt_plan_v1.json`に読み取り参照として保存した。既に採用したモンド案を巻き戻さない。

## 内容確認

`index.html`は独立して開ける閲覧用。世界接続図、地域別座標図、グラフ、敵のID/Lv/数、経路理由、未確認区画を確認できる。グラフのドラッグ配置はそのブラウザ内だけに保存され、正本には書き込まない。地形画像やオンラインAPIは使用しない。

`DESIGN.md` → `WORLD_CROSSINGS.md` → `REVIEW_QUEUE.md` → `BALANCE_GAPS.md`を読む。地域別の詳しい全件は`regions/`。

## 1. コピーで検査

最新mainを確認するとともに、**現在実際に起動している設計室の作業ツリーとデータパス**を特定する。GitHub側の初期project.jsonを、より新しいローカル正本へ上書きしない。バックアップを取る。

```powershell
python -m unittest discover -s . -p "test_routes.py" -v
```

全体と改変検査はこのパッケージのテスト。実エディタ検査とは区別する。

## 2. 一地域ずつ変更案を生成

基本候補だけを生成する例（既定では追加レビュー接続を除外する）：

```powershell
python make_editor_proposal.py `
  --project "C:\path\maple-lua-lab\design\field-editor\project.json" `
  --region LIY `
  --out "work\LIY-basic.proposal.json" `
  --check-with-repo "C:\path\maple-lua-lab"
```

ユーザーが細部を後から修正するため、**入口・階層未検証も含む一地域の全候補をプレビューしたい場合**：

```powershell
python make_editor_proposal.py `
  --project "C:\path\maple-lua-lab\design\field-editor\project.json" `
  --region LIY `
  --include-review `
  --review-note "未検証区間を含む設計案として地図上でレビューし、細部は手動修正する" `
  --include-challenges `
  --out "work\LIY-full-draft.proposal.json" `
  --check-with-repo "C:\path\maple-lua-lab"
```

このフラグは**実地検証済みへ昇格するものではない**。変換器は正本を書かず、ファイルだけ作る。エディタの変更案から取り込み、プレビューしてユーザーが採用する。

21地域の接頭辞：
`LIY INA SUM FON NAT NOD SNE CHY ENK TUN REM OCH NSP NOV GAA VLM SIM CHM ASM SKY FMO`

`NSP GAA VLM SIM`は公式地点未対応のため、変換器は停止する。`regions/*.json`の設計スロットを将来の実地点へ明示対応する別作業が必要。架空の公式IDを作らない。

一地域を採用するとrevisionが進む。**次の地域の提案はその後に再生成する。** 全地域分をrevision0のまままとめて作って順に適用する運用は禁止。必要なら`--part fields`、`routes`、`enemies`、`challenges`で分割する。分割後も毎回最新revisionを読む。

## 3. 国境と横道

```powershell
python make_editor_proposal.py `
  --project "C:\path\maple-lua-lab\design\field-editor\project.json" `
  --region CROSS --include-review `
  --review-note "国境の出入口とドラゴンスパイン→明蘊の横道を提案として確認する" `
  --out "work\CROSS.proposal.json"
```

公式の両端IDを持つ21候補を対象とし、未対応スロットへ入る4本は除外する。モンド側のフィールド定義や敵配置を変更しない。正式な国境ごとに通過方法を保持し、船・鉄道・潜水入口を徒歩へ置き換えない。

## 4. 設計地域の分類

`REGION_CLASSIFICATION.md`の78地点は通常国と高難度の表示が重複していた。一般の取り込みでは公式情報・正本region_idを変更しない。分類を採用する場合だけ、先に別提案を作る。

```powershell
python make_editor_proposal.py `
  --project "C:\path\maple-lua-lab\design\field-editor\project.json" `
  --region CHY --part classification --include-review `
  --review-note "公式所属を変えず、設計上の沈玉高難度分類を確認する" `
  --out "work\CHY-classification.proposal.json"
```

値が採用済み・手動変更済みの場合は停止する。分類の採用後に敵配置提案を新しいrevisionで生成する。公式カタログのarea_id、map_id、座標は触らない。

## 5. 保護と未実装

既存の同じmonster_idの名前・系統・Lv・分類に違いがあれば停止。アート・AI・HP・EXP等の既存値は保持。未登録の必要系統・Variantだけ追加する。既存の別spawn_idが同じフィールドにあると二重生成防止で停止する。既存エッジと同じ端点対に別IDがあれば停止し、差分を整理する。その他の手動接続は削除しない。

実ポータル・敵の座標は未設定。旧スキーマが必須とするポータル{x:0,y:0}は**unassigned**で、ゲーム用の有効座標ではない。配置area/conditionsも未設定状態を付ける。ランタイムで動作させるには実座標、2D地形、入口安全地帯、条件、乗り物、保存復帰の実装・検証が必要。

ボス/地方伝説の入口はテキストの任意戦闘候補として追加するだけで、大量の通常spawnには変換しない。一般精鋭も一体の独立脇道案として記録する。週ボスの図鑑Lvで既存難易度を上書きしない。

## 最後の報告

追加提案数、採用済み数、未確認数を分ける。既存正本・ゲーム本体・公式座標のハッシュを比較する。表示、線編集、保存再読込、戻り道、異なる階層、船・潜水、手動変更の保護を試験する。全地点接続済み・実機確認済みと偽らない。資料の保存と必要なエディタ改善をPRにまとめる。


## 付属ビューアの検査範囲

Linux ChromiumでHTMLを直接DOMに読み込ませた表示・操作14項目を確認。管理ポリシーによりlocalhostページのナビゲーションが拒否されたため、環境の制限を回避せず、Windowsでの起動・file URL起動・永続localStorageは未検証とした。Codex側で実環境の起動を確認する。
