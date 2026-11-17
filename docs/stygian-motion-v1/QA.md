# 制作・検証・引き渡し v1.0

入口：[MASTER](../../DESIGN_STYGIAN_MOTION_VFX_MASTER_V1.md)。仕様の検査と、ゲームの動作検査を分離する。

## 1. この回で実施した静的検査

2026-11-17、作成したMANIFEST.jsonをPythonで読み込み、以下を確認した。GitHubへ保存後のblob SHAは**0affb80d1717eb6ee3f9d0b0dfb972ce5c191f33**、ローカルで検査した同じUTF-8内容のGit blob SHAと一致。サイズ13,101bytes。

| 検査 | 結果 |
|---|---|
| JSONとして読み込み可能 | PASS |
| 総件数49、ボス別7/9/8/13/12 | PASS |
| ID重複なし、各ボスで欠番なし | PASS |
| 固定区間は整数tick、start < end | PASS |
| ACTIVEは各固定ルートのRECOVERY開始までに終了 | PASS |
| RECOVERY終端とtotal_ticksが一致 | PASS |
| 5つのvariantの区間検査 | PASS |
| FK07 A/BとXB07 A/B/Cの子技オフセット一致 | PASS（5構成） |
| 非攻撃stateのACTIVEが空 | PASS |
| authority_lethalはロノヴァだけ | PASS |
| 原作動画の全フレーム照合 | NOT RUN |
| 画像・音の制作／見た目検査 | NOT RUN |
| Luaへの組込み／プレイ検証／FPS計測 | NOT RUN |
| 幻境実機のAPI・同期・性能確認 | NOT RUN |

このPASSは索引データの算術・構造整合だけ。各ポーズが綺麗に繋がること、タイムラインが面白いこと、実キャラの移動で避けられることを証明しない。damageの窓数は敵に保証される命中回数でもない。

## 2. 索引の読み方と条件分岐

`total_ticks`は記載した固定ルートの終端。`early_branch`は条件成立時の別ルート説明で、名前にearlyとあっても**別ルートが必ず短いという意味ではない**。実装時は明示した状態遷移として扱う。

| 項目 | 固定ルート | 条件ルートの終端 |
|---|---|---|
| RR05失敗 | 240 | 成功e∈[84,131]。1回目e+102=186〜233、2回目e+192=276〜323。第二成功の長いダウンを240で切らない |
| RR13 | 成功1320 | 全員失敗1176 |
| RN03 | 失効702 | 全回収e+96、Life1で分離なしなら168 |
| RN06 | 裁定後852 | 全員2個達成e+132 |
| RN12 | 期限後900 | 全員到達e+210 |

RN02が残す命影は衝突時から360tickの独立寿命なので、元cast234tickより長く残り得る。移動中にownerが退出／試行終了すれば破棄する。

**RN08の低Life境界を固定する**：RN08では回収数2/3が裁定条件なので、Life1でも**試練用の影3個を必ず生成する**。分離できない分の回復値は0でよい。RN03の「値0の影を省略する」規則をRN08へ流用しない。回収判定とLife回復量は別。RN08の門はt840で裁定位置をスナップショットし、成功者の門輪郭はt846まで保持してから退色する。裁定した瞬間に安全マーカーを先に消さない。

## 3. Codexの制作順と受入成果物

### 工程A：参照・体型・左右差

5人の原作画像／映像を直接見て、前・左右・後ろ、衣装、武器の持ち手、ソケット位置を記録。出典URLと動画時刻を残す。今回の文書だけを元に「原作完全再現」としない。少年姿のXB84pxと、FK140/CP152/RR144/RN144pxを旅人88pxの同じ画面で並べる。

提出物：方向別基準絵、原点／socket metadata、参照監査。既存画像は保存し新しい版名にする。

### 工程B：共通状態と代表技

COMMONのENTER/IDLE/WALK/TURN/HURT_VIS/STAGGER/PHASE/DEFEAT/ABORTを5人分作る。まずFK03、CP02、XB01、RR01、RN03を同じ規格で制作する。

提出物：キー絵と保持時間、左右非対称差分、PNG／軽量版の同寸比較、1技ずつのpreview。プレビューGIFを作ってもロジック同期済みとはしない。

### 工程C：全49項目へ展開

MANIFESTのIDごとにカードを確認し、本体・武器・tell・移動・弾・hit・余韻・HUD・音を分離して制作。飛翔体と試練物は1個を再利用する。連携の親に二重の判定や別の全身絵を追加しない。

各IDの納品ステータスは `reference_checked / poses_ready / vfx_ready / audio_ready / preview_checked / logic_wired / lab_tested / engine_tested` を**独立**して記録する。今回の納品はspec_readyだけ。全体を一括でcompleteにしない。

### 工程D：ゲームに組み込む前の図形試験

実装許可された範囲で、まず現行の移動・ジャンプ・回避・被弾無敵・行動ロックを読み取り、灰色の図形で危険域を試す。現行プレイヤー性能を勝手に上げて回避可能にしない。最短安全路に必要な移動時間を算出し、ロック後の猶予と比較。その後人間操作で再検証する。

### 工程E：見た目・性能・実機

原PNGと矩形化を同tickで比較。左右、上段・床、画面端、1/2/3倍、30/60/可変描画FPS、標準／低品質で確認。暗い背景／白石／草地で輪郭が読めるか。Lua生成・転送・Canvas描画を分離計測する。幻境側のAPIや描画制限は別検査で、ラボの数字をそのまま実機性能と呼ばない。

## 4. ボス別の必須シナリオ

| ボス | シナリオ |
|---|---|
| FK | FK03着地固定後に移動して回避。FK04のXの背面が安全。FK05低線から高線までに標準ジャンプが戻れる。FK07の親子に重複hitがない |
| CP | CP02最後の点が残るため第三突きが読める。CP03は端でワープしない。CP05波は上段へ見えないhitを出さない。CP08はAIと持続技で時刻がずれない。CP09の高低・扇で安全路が残る |
| XB | 全モーションが少年の同じ体格。XB04は長い帯でも上限1hit。XB05の空中尾に判定なし。XB06の大輪は余韻。XB07の3分岐が予告から分かる。XB08の中央安全帯を別技が塞がない |
| RR | RR05の灯を早く押しても次機会が来る。成功2回で解除し、長いダウンが切れない。RR08 A/Bを同時生成しない。RR11の初回黒球だけ区別。二幕・霧結界・回収球は別状態。RR09/13各人3球が取得可能 |
| RN | RN03低Lifeで不可避の分離即死をしない。RN05照準固定後に逃げられる。交代しても印が消えない。RN06の他人の取得で自分の球が消えない。RN08 Life1でも3個の試練影がある。命0と同tick裁定で二重死亡なし |

追加のロノヴァ復活シナリオ：片方死亡で灯不変、全滅で1減、灯1→0でも復帰、灯0の次全滅で観戦。生存者なし・復帰予約ありで挑戦を失敗扱いしない。復帰中の古い個人裁定をcancelし、安全な床へ出す。復帰CT・光界・ボスHPはリセットされない。相討ちはclear優先。ソロと4人でボスHP同一、他の人間への蘇生操作なし。

## 5. 全項目の見た目の合格条件

- 開始姿勢だけで主要な技種が識別でき、手・足・武器の向きが一瞬で不連続に変わらない。
- 全キーで足元原点が同一。空中はroot軌道を参照し、セルの余白によってワープしない。
- 予兆の縁と実際の危険範囲が一致。LOCK後の追尾なし。空振りに命中火花と数字を出さない。
- 主人公・足場端・必須回収物・安全門・致死線が、巨大な羽やダメージ数字の下でも見える。
- 低品質でも危険弾・球・針の本数と位置が同じ。減らすのは飾り片と煙だけ。
- 全体白フラッシュ・強制ズーム・連続画面揺れなし。reduced_motionでも攻略情報が同じ。
- 幕移行・死亡・retry・map_change・接続復帰で弾、WARN、ループ音、残像、回収物が残留しない。
- 同じ技の実hit数・盾／無敵との処理はログで検証し、描画コマ数でダメージ回数を増やさない。

## 6. 再現用の索引チェック

リポジトリルートで以下を実行できる。これはMANIFESTの静的チェックのみでゲームを起動しない。早期分岐は人手レビューとゲーム状態機械の試験が別途必要。

```python
import json
from collections import Counter
from pathlib import Path

folder = Path('docs/stygian-motion-v1')
m = json.loads((folder / 'MANIFEST.json').read_text(encoding='utf-8'))
rows = m['entries']
assert len(rows) == 49
assert len({r['id'] for r in rows}) == 49
assert dict(Counter(r['boss'] for r in rows)) == m['counts']
for boss, prefix, n in [('farka','FK',7), ('capitano','CP',9),
                        ('xbalanque','XB',8), ('rerir','RR',13),
                        ('ronova','RN',12)]:
    assert [r['id'] for r in rows if r['boss'] == boss] == [
        f'{prefix}{i:02}' for i in range(1, n + 1)]
for row in rows:
    doc = folder / row['document']
    assert doc.is_file(), doc
    assert f"## {row['id']} " in doc.read_text(encoding='utf-8'), row['id']
    for route in [row, *row.get('variants', [])]:
        end = route['total_ticks']
        a, b = route['recovery']
        assert 0 <= a < b == end
        assert all(isinstance(t, int) and 0 <= t < end
                   for t in route['lock_ticks'])
        for x, y, kind in route['active_windows']:
            assert isinstance(x, int) and isinstance(y, int)
            assert 0 <= x < y <= a, (row['id'], x, y, a)
            assert kind in {'damage','projectile','life_loss','authority_lethal'}
            if kind == 'authority_lethal':
                assert row['boss'] == 'ronova'
        if row['kind'] == 'state':
            assert route['active_windows'] == []
by = {r['id']: r for r in rows}
def shifted(key, offset):
    return [[a + offset, b + offset, k]
            for a, b, k in by[key]['active_windows']]
assert by['FK07']['active_windows'] == shifted('FK03', 0) + shifted('FK04', 204)
assert by['FK07']['variants'][0]['active_windows'] == shifted('FK03', 0) + shifted('FK05', 204)
assert by['XB07']['active_windows'] == shifted('XB01', 0) + shifted('XB02', 108)
assert by['XB07']['variants'][0]['active_windows'] == shifted('XB02', 0) + shifted('XB03', 156)
assert by['XB07']['variants'][1]['active_windows'] == shifted('XB05', 0) + shifted('XB06', 180)
print('49 items: structure, coverage and 5 composite timelines OK')
```

ファイル実在／見出し照合を含むこの再現用手順は、Codexがcheckout後に実行するためのもの。今回のローカル実施検査は第1節に列挙した索引単体検査で、全checkout上のリンク検査と取り違えない。
