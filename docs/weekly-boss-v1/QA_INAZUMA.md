# 稲妻週ボス：検証・翻案差分・Codexへの引き渡し v0.1

2026-11-17。対象：[淑女16項目](SIGNORA.md)／[禍津御建鳴神命18項目](RAIDEN_SHOGUN.md)／[索引](MANIFEST_INAZUMA.json)。以前のモンド・璃月・幽境の検査は別バッチとして保持する。

## 1. この回で実施した静的検査

ローカルPythonで索引JSONを読み込み、以下を検査した。UTF-8は11,307bytes、Git blob SHAは `d06083b2bac6cc3587a00f0ef2a5712f7ba7d7b6`。GitHub保存後のfetch_fileが返すblob SHAと一致した。実行用ゲームデータではなく、制作時間割の索引である。

| 項目 | 結果 |
|---|---|
| JSONとして読込 | PASS |
| WS01–16 / WR01–18、総34件、欠番・ID重複なし | PASS |
| 固定ルート35＝基本29＋別時間割6、イベント状態5 | PASS |
| 全固定時刻が整数、区間[start,end)、start<end | PASS |
| ACTIVE終端が各固定ルートのRECOVERY開始以前 | PASS |
| RECOVERY終端＝total_ticks | PASS |
| 飛翔体8定義の最大寿命がRECOVERY開始以前 | PASS |
| 独立床5定義はWS15所有、360tick、castを越えることを明記 | PASS |
| WR14→WR15の接続は720tick、全体960tick | PASS |
| 全体の大太刀判定[780,786)、保護終端828tick | PASS |
| WR16の攻撃可能時間576−96＝480tick＝8秒 | PASS |
| 文章の全語句・幾何・全条件分岐との機械的な一致 | NOT RUN |
| 原作動画全フレームとモデル全角度の照合 | NOT RUN |
| 素材・音・UIの制作と描画品質検査 | NOT RUN |
| Lua接続、ゲーム起動、回避経路、AI・マルチ | NOT RUN |
| 幻境実機API、同期、FPS、難度・威力のバランス | NOT RUN |

PASSは構造と算術だけの結果で、操作可能・面白い・原作完全再現・完成を意味しない。hp_attackable_during_recovery=falseのWR14や変身を、攻撃可能な隙と誤解しない。索引のdamage窓は攻撃要求の上限で、無敵中の相手へ全段を保証する意味ではない。

## 2. 索引の規則と例外

`source_of_truth`のボス文書を詳細の基準とする。variantに省略した共通条件は親カードから継承する。`seeking`は発射前にだけ狙う本作の模式で、発射後の無限追尾ではない。`conditional_end`は成功時の別ルートで、必ず元ルートより短いとは限らない。例えばWR06の遅い成功ではs+120が540を越え得る。

`active_windows`は固定した直接判定、`projectiles`は生成と寿命。発射時刻と命中時刻を混ぜない。`detached_ground`だけが攻撃の終了を越えて存在し、環境manager WS15が破棄責任を持つ。通常の弾をこの例外へ紛れ込ませない。

索引の`attack_group_hit_cap`は記載カード内で許すグループ由来の合計上限の要約であり、粒子ごとのhit数ではない。WS06は6槍を1group最大1、WS14は前半本体＋旋風1、後半本体＋旋風1、終端熱波1の合計3。実装時は各groupIdとcastHitCapへ展開すること。

変身WS09とWR09の末尾recoveryフィールドは技の復帰姿勢を示す便宜的区間で、HP攻撃不可。WR17の復帰姿勢はHP攻撃可能。WR14の後半は保護に集まる猶予で、本人への反撃窓ではない。WR16だけは480tick全てが明示された攻撃時間である。

## 3. 原作を残すところ／本作で変えるところ

| 対象 | 原作資料から参照 | 今回の制作開始ルール |
|---|---|---|
| 淑女 | 氷→繭・蛾→炎、極寒と灼熱 | 二つのHP区間と別封印耐久。温度はプレイヤーのペア共有 |
| 繭 | 蛾を拾い、場のキャラの攻撃で溶かす | 操作所有者が新しく開始した直接攻撃で消費。耐久25、4目盛り。AI・既設置で誤消費しない |
| 温度装置 | 周辺で温度へ対処、装置を使う選択 | 一時放出は文脈操作。広範囲技で誤破壊せず、最低1台が有効 |
| 氷・炎の床 | 立ち位置と温度に影響 | 同時3枚、360tick、床の重複による多重DoT抑制。装置経路を守る |
| 炎の竜巻 | 本体の竜巻と小旋風、長い攻撃不能時間 | 一巡540tick、HP攻撃不可[72,384)のみ、連発制限 |
| 雷電 | 通常の薙刀／刀と強化姿、解除後の大きな隙 | HP一本、通常武器はスタイル。OとGを区別し8秒ダウン |
| 雷眼／残影 | 装置を破壊、本体はX字の斬撃 | 通常攻撃でも処理、AoEで全候補を無差別正解にしない |
| 花蕊 | 元素攻撃で保護を起動し大技を防ぐ | 物理5hit／雷1hitでも起動する編成非依存の代替を追加 |
| 終結の一太刀 | 原作の標的には致死判定、通常盾・軽減等で防げない場合あり | **初版は通常計算の大ダメージ、保護内0、確定死フラグなし**。原作同様の致死版は別途採否判断 |
| 強化時の耐性・自機エネルギー | 原作の特定の増減・吸収・補充 | HP倍率・耐性係数は保留。光界ゲージを吸収／満タン化しない |

ユーザーが示したのは、原作の特徴を参考に週ボスの技・モーション・演出を詰める方向。今回追加した具体的な補助ルールは**こちらが選んだ制作開始案**で、ユーザーが数値を個別承認したと表記しない。ロノヴァだけの命と有限復活、週1回制限、樹脂、現実曜日の制約は追加しない。

## 4. Codexの制作順と受け入れ試験

1. 現行CHAT_HANDOFF／AGENTSと原画監査を読み、既存signora/signora-flame/raiden-bossの候補を保持する。最初は姿勢・エフェクト・予兆の非戦闘プレビューで照合する。技実装保留はこの文書で解除しない。
2. 原作の手の向き・鞭の起点・衣装の非対称、雷電の2武器と神腕の数・位置を実画像／モデルで確認。検索の文だけで視覚照合済みにしない。
3. 通常技のTELL/LOCK/ACTIVE/終了を、同じ時刻の実判定プレビューと並べる。低画質でも危険の縁、X字、本体、取得物、足場を残す。音なし・画面揺れなしでも判別可能であること。
4. 淑女のWS15は床寿命とcast寿命を分離。温度100到達・装置で低下・再到達、同時3床、上下plane、交代、AI、多人、装置2台停止、形態切替、再挑戦を個別テストする。
5. WS08は蛾の拾い損ね・交代・持続技・AI・マクロ・空振り・同時命中・死亡を試す。tokenは一回だけ消費、条件が成立しないと消費しない。蛾が遠すぎる／消えた等で永久進行不能にしない。
6. 炎期の竜巻は本体と小旋風で同じgroupへ二重命中しない。大きな炎の外側の安全域が実際に通れること。長い待ち時間が主難度になっていないか確認する。
7. WR05は通常攻撃で解除でき、解除しない場合も外側の安全域が残る。WR06はX字を識別して選べ、マクロ/AoEが自動で正解を全探索しない。誤選択時に無告知即死なし。
8. WR12は三杭の最後の波を、実際の移動速度・ジャンプ・行動ロックで避けられるか検証する。90tick間隔は安全性の証明ではない。失敗したら波形か順番を変え、キャラの移動性能を無断変更しない。
9. WR14は全員が花へ到達でき、物理だけでも充填可能。同期遅れで花が出なければWR15中止。充填の締切、入域、保護終端が同一時計で動く。花に触れただけでは充填成功にしない。
10. WR15の保護外は通常ダメージ経路へ。ロノヴァのauthority_lethal呼出しを流用しない。原作致死版を後日採るなら仕様差分とUI説明を付ける。
11. WR16のt96–576は実際にHPへ攻撃が通ること、旧弾・大刀が残らないこと。HP0ならWR17や強化再始動をせず勝利する。O/G初期化とHP回復を混同しない。
12. 四人マルチでもHPとG最大値を増加させず、充填・温度・蛾のownerを混ぜない。全滅・退出・再接続・時間停止で旧状態が残らない。ここで実機APIの同期が可能とは断言しない。

## 5. 検査を再実行する最小例（設計ファイルだけ）

```python
import json
from pathlib import Path
p = Path('docs/weekly-boss-v1/MANIFEST_INAZUMA.json')
m = json.loads(p.read_text(encoding='utf-8'))
entries = m['entries']
assert len(entries) == 34
ids = {e['id'] for e in entries}
assert len(ids) == 34
assert ids == {f'WS{i:02}' for i in range(1, 17)} | {f'WR{i:02}' for i in range(1, 19)}
routes = []
for e in entries:
    if e['kind'] == 'event_state':
        continue
    routes += [e] + e.get('variants', [])
assert len(routes) == 35
for r in routes:
    start, end = r['recovery']
    assert 0 <= start < end == r['total_ticks']
    for a, b in r['active_windows']:
        assert isinstance(a, int) and isinstance(b, int)
        assert 0 <= a < b <= start
    for q in r['projectiles']:
        assert all(t + q['ttl_ticks'] <= start for t in q['spawn_ticks'])
    for g in r['detached_ground']:
        assert g['owner_state'] == 'WS15' and g['may_outlive_cast']
        assert g['ttl_ticks'] > 0
by_id = {e['id']: e for e in entries}
assert by_id['WR14']['total_ticks'] == 720
assert 720 + by_id['WR15']['total_ticks'] == 960
assert by_id['WR16']['recovery'] == [96, 576]
print('design index structure: PASS; gameplay: NOT RUN')
```

このコードは静的索引だけを読む。実際の戦闘コードへ自動変換したり、素材を生成したり、保存データを変更したりはしない。
