# 博士二戦：設計検査・原作との差・Codex引き渡し v0.1

2026-11-17。対象：[偽月18項目](DOCTOR_FALSE_MOON.md)、[左道20項目](DOTTORE_HERETIC.md)、[索引](MANIFEST_DOTTORE.json)。38件は制作カード数、攻撃以外の状態を含む。既存の週ボス12戦・幽境の検査をやり直した結果ではない。

## 1. 今回行った検査

ローカルPythonで作成JSONを読み込み、整数区間・参照・保護・子技接続・独立計算式を検査した。UTF-8は8,872bytes、Git blob SHAは `931a73940e7b5f6f567a74164ea9b90dd6d35de9`。GitHub保存後のfetch_fileのSHAと一致。索引は実行用データではない。

| 検査 | 結果 |
|---|---|
| JSON読込、WM01–18/WH01–20の38件、ID重複/欠番なし | PASS |
| 固定33ルート、イベント5状態 | PASS |
| 全固定時刻の整数・半開区間、ACTIVE終端<=RECOVERY開始 | PASS |
| RECOVERY終端=total、LOCKが時間割内 | PASS |
| 飛翔体5定義の生成+寿命<=RECOVERY開始 | PASS |
| 非ダメージ押し壁1定義の生成90+寿命144=234<=240 | PASS |
| WM09/10→WM12、420+180=600、罰の終了が親後隙以前 | PASS |
| WM08保護[150,420)が衝撃[360,372)を含む | PASS |
| WM16露出480−120=360tick=6秒 | PASS |
| WH19露出780−60=720tick=12秒 | PASS |
| 成功/失敗/移行/子技の参照先が存在 | PASS |
| 回帰回復がMaxHP10%を超えず上限HP内、固定乱数1,000例 | PASS（独立式のみ） |
| 異界損傷が一回12%/全戦24%の予算内、同1,000例 | PASS（独立式のみ） |
| 原作の禁令・壁・攻撃の実入力、画像全角度、動画全コマ | NOT RUN |
| 文書全語句・全幾何・条件分岐の機械的一致 | NOT RUN |
| ゲーム起動、Lua接続、保持J/マクロ、AI/マルチ | NOT RUN |
| 回避経路、必要手数、同期、幻境API/FPS、火力調整 | NOT RUN |

PASSは算術・構造だけ。停止指示で正しい操作が罰されない、異界の共同切替が実装可能、壁を抜けられる、実際に面白い、といった保証ではない。上限hit数も既存無敵を貫通して全段命中する意味ではない。

## 2. 索引の例外と解釈

- `active_windows`は直接判定の要求、`projectiles`は発生と寿命。飛ぶ弾の発射を命中と扱わない。
- WM09/10自身のdamage窓は空。違反者へのWM12は親t420からの子であり、親のACTIVEが空だから罰が無いという意味ではない。判定は[120,420)、罰の命中は親[480,486)、親の共通後隙は[516,600)。成功者が先に攻められる条件は本文を優先。
- WM11は非攻撃・入力非反転の初版。元ゲームの方向逆転を再現したとは呼ばず、実反転版は今回の索引に存在しない。
- WM08の保護は月の衝撃にだけ作用し、先行する柱の落下を守らない。普通の盾・岩構造物・人数制限と混同しない。
- WM13の場とWM15の影はイベント管理。固定ルートの飛翔体検査で寿命全体を証明したものではない。本文にある周期・期限・cleanup・共同確認を別試験する。
- WM14/WH10のrecoveryは移行、WM16/WH19の末尾は起上がり。反撃時間はexposureを優先し、末尾の全区間をHP攻撃可としない。
- WH07は低い『攻撃面』、WH14は非ダメージの『押し壁』。外見、実衝突、穴、hit、pushを別プリセットにする。
- WH13のNは二核の各3、Bは本体詠唱24。核一つの破壊後にB受付。核破壊で期限は短縮しない。多段は正規eventを数え、同一event重複/描画粒子を数えない。
- WH15の駒は召喚モンスターでなく一時的な攻撃実体。模倣元のHP・蘇生・凍結条件を持たない。WH16/17も元ボスの状態機械を丸ごと継承しない。

## 3. 原作と本作の区分

| 要素 | 参照した原作の方向性 | 本作の開始案 |
|---|---|---|
| 偽月の禁令 | 行動と視線に制限がある | 2秒準備、5秒判定、最後に一回だけ予告付きの罰 |
| 方位への干渉 | 操作方向の逆転 | 初版は入力非反転、映像だけ。実反転は未採用 |
| 月の衝撃 | 遺骸の背後で防ぐ強力な攻撃 | 舞台の安全矩形＋一回の通常大ダメージ、エネルギー補充なし |
| 異界 | 影を倒し力を断つ | 生存者の共同確認で移行、6秒露出、固定損傷に全戦予算 |
| 回帰 | 大きな損傷を受けると戻す動作 | 一戦一度・回復最大10%、HP0優先。しきい値は原作断定なし |
| 左道の二形態 | 形態で攻撃と攻略が変わる | 二HP区間、変身中に旧攻撃を清掃 |
| 押し障壁 | 結合点を壊して近づく | 地上核二つ・一つ3回で解除、非ダメージの小さい押し |
| 詠唱 | ダメージ量でなく手数を重視 | 30秒、B24、12tick受付間隔、途中で期限短縮なし |
| 模倣 | 剣と駒の既視感 | 姿勢/形を参考、元ボス専用のゲージや致死は持ち込まない |
| 失敗結果 | 原作には致死性の強い攻撃がある | 本版は通常大ダメージ、ロノヴァの権能/復活なし |
| ダウン | 詠唱を止めた後の反撃 | 12秒の安定した近接攻撃時間 |

原作情報は公式告知と作者自身の実戦メモを核に、Wiki/攻略サイトの行動表で補助照合。ソースの本文取得が古い場合や観察間の数値差は本文に明記した。今回の値を最新原作の検証済み値へ言い換えない。作品のモーションを新しく描き起こし、公式動画・SEを直接素材として配布しない。

## 4. Codexの受入試験

1. **禁令の責任範囲**：準備前の多段、強制ノックバック、呼吸、AI移動、自動照準で誤違反なし。新しい能動移動/攻撃のroot移動は設定通り判定する。保持Jを止めたのに遅延入力が誤発火しないか確認。
2. **判定と罰**：二禁令を重ねず、違反者一人につき一回。罰の回避移動が再違反にならない。交代で違反を消さず、他人へ罰が伝播しない。
3. **禁令開始の成立**：接地と残硬直が準備内で解決しない時は延期。無期限の延期による進行停止を避け、通常技へ戻れる。
4. **保護と可読性**：落柱位置と背後の保護を区別し、身体が内側へ収まれば衝撃を受けない。安全帯へ標準速度で到達可能。白い全画面演出にしない。
5. **異界の進行**：共同確認の拒否、確認途中の死亡、退出、再接続を処理。全員が同じsceneEpochとなるまで攻撃を再開しない。HP/CT/光界/死亡者の復帰なし。
6. **影の損傷精算**：途中帰還・再入場でも同じ影IDは一度だけ支払。cleanupで報酬が出ない。予算0でも攻略が停止せず、HP0なら帰還後勝利へ。
7. **回帰**：単一の受理済みHP損失を使い、多段合算や擬影固定損傷で誤予約しない。HP0取消、回復上限、一戦一度、演出中被弾の扱いを記録。
8. **左道の核**：すべての編成で地上核へ通常攻撃が届く。二核同時破壊でも一回の障壁解除。Nの減少をHPの数字に偽装しない。
9. **手数**：一つのcastに複数の実eventがある技は規定間隔で数える。一粒子一回や毎frameカウントを禁止。ソロの標準通常連撃だけでもBを期限内に削れるか実測。
10. **押し壁**：穴の見た目と実範囲が一致し、一人一壁一押し、次push60tick、場外転落なし。速度や操作を奪う過大な連続押しにならない。
11. **親子取消**：核破壊でWH14停止、B0/期限/HP0でWH15の未生成駒も停止。失敗後にGやHPが全回復しない。
12. **模倣素材**：元ボスの色・姿勢は使っても樹脂、専用弱点、HP譲渡、蝕破、確定死を持ち込まない。攻撃数を参加人数倍にしない。
13. **露出**：WM16の360tick、WH19の720tickで通常と元素技が実際に当たる。起上がりとの境界、相討ち、クリア残留攻撃を確認。
14. **媒体**：desktop/mobile、減光・振動軽減、最低画質、AI・4人同期、幻境API/控件費用/FPSは別記録。未試験をPASSで塗らない。

## 5. 再実行用の静的検査例

リポジトリ直下でPythonを実行。戦闘の起動やゲームコードの変更ではない。以下は検査の主要部分であり、経路・入力・本文全条件は対象外。

```python
import hashlib, json, random
from pathlib import Path
p = Path('docs/weekly-boss-v1/MANIFEST_DOTTORE.json')
b = p.read_bytes()
j = json.loads(b)
a = j['entries']
by = {x['id']: x for x in a}
expected = {f'WM{i:02d}' for i in range(1,19)} | {f'WH{i:02d}' for i in range(1,21)}
assert len(a) == len(by) == 38 and set(by) == expected
assert sum(x['kind']=='fixed' for x in a) == 33
assert sum(x['kind']=='event' for x in a) == 5
for x in a:
    for k in ('next','success_target','failure_target','resolve_target'):
        if k in x: assert x[k] in by
    for k in ('children_before_break','children_after_break'):
        for name in x.get(k,[]): assert name in by
    if x['kind'] != 'fixed': continue
    n, (r0,r1) = x['total_ticks'], x['recovery']
    assert type(n) is int and 0 <= r0 < r1 == n
    for s,e in x['active_windows']:
        assert type(s) is int and type(e) is int and 0 <= s < e <= r0
    for t in x['lock_ticks']: assert type(t) is int and 0 <= t < n
    for q in x.get('projectiles',[]):
        assert all(0 <= s < s+q['ttl_ticks'] <= r0 for s in q['spawn_ticks'])
    for q in x.get('moving_walls',[]):
        assert q['spawn_tick']+q['ttl_ticks'] <= r0
    if 'child' in x:
        c=x['child']; y=by[c['id']]
        assert c['start_tick']+y['total_ticks'] == n
        assert all(c['start_tick']+e <= r0 for s,e in y['active_windows'])
assert by['WM08']['protection'][0] <= 360 < 372 <= by['WM08']['protection'][1]
assert by['WM16']['exposure'][1]-by['WM16']['exposure'][0] == 360
assert by['WH19']['exposure'][1]-by['WH19']['exposure'][0] == 720
rng=random.Random(20261117)
for _ in range(1000):
    m=rng.uniform(1,1_000_000); loss=rng.uniform(.25*m,m); hp=rng.uniform(.001*m,m)
    heal=min(loss*.5,m*.1,m-hp)
    assert 0 <= heal <= m*.1 and hp+heal <= m+1e-8
    killed=rng.randrange(4); spent=rng.uniform(0,.24*m)
    bonus=min(killed*.04*m,max(0,.24*m-spent))
    assert 0 <= bonus <= .12*m+1e-8 and spent+bonus <= .24*m+1e-8
print(len(b), hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest())
```

現行台帳は週ボス14戦を候補としているが、今回の2戦追加で対応票が揃うことと、原神の完全網羅や本作の14戦完成は別。ゲーム内冒険の証との照合フラグは未完のまま。技実装保留は解除しない。
