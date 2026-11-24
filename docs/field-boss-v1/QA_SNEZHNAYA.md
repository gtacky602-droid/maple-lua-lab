# QA：スネージナヤ4戦と固定49戦の設計索引

2026-11-18 JST。[技票](SNEZHNAYA_QUARTET_MOVESETS.md)・[今回のmanifest](MANIFEST_SNEZHNAYA.json)・[主設計書](../../DESIGN_FIELD_BOSS_MASTER_V01.md)を対象にする。これは設計宣言、旧試作との移行値、全体索引の整合を調べる静的検査であり、新Luaの実行・戦闘シミュレーション・ブラウザ操作・作画・実当たり判定・討伐時間の合格報告ではない。

## 1. 基点と差分

設計基点は `b3aef8a77151e7caf10a9732a4908aed14e30632`。既存の4本体Lua、配置設定、台帳、個別票を照合した。保存前に並行mainの `d960bac523a63be2ae3a198953679b45e745006b` と比較し、今回の10パス、4本体Lua、旧manifest、固定比較表、共通規約、最新制作指示に変更の重なりがないことを確認した。対象4件の配置設定と台帳行も不変だった。後者の配置設定・台帳を比較用に読み直し、以下の検査を再実行した。

保存対象は主設計書、新技票、manifest、このQA、2つの検査スクリプト、旧4票の移行注記の計10パス。旧manifest・Lua・配置・HP/報酬・保存・美術を今回のコミットで変更しない。Web全体制作の既存許可は引き続き有効であり、この作業範囲を新しい実装保留として扱わない。

| 集計範囲 | 結果 |
|---|---:|
| 今回 | 4戦・12カード・最大27直接命中窓 |
| 経路 | 空中1件・36tick、完全不可視0、独立ダメージ飛翔体0 |
| 任意中断 | 4規則。接触装置は風球1個、残り3規則は本体の通常HP受信に併設 |
| 固定比較表 | 49戦に対して13manifest・147カード、残り0行 |
| 設計基点の現行normal登録 | 55行。固定49行の外に本作独自6行 |
| 再照合時の現行normal登録 | 56行。固定49行の外に本作独自7行 |

49戦の初期設計が揃ったことと、現行登録全件の完成は別。今回、台帳の `status` や `complete_roster_verified` は変更していない。古い比較表の「未実装」表記は当時の履歴であり、対象4体が現在も未試作という意味ではない。

## 育成済みセーブでの4戦

本編を進めて作ったLv165セーブから受注し、現地の門を通って戦闘入力で4体を撃破した。依頼報告、勝利記録、セーブ復元まで確認。比較版で装備を変えなかった試走は4戦とも1ヒットで終わった。ギミックの試走では、町で旅人に以前の武器を装備し、攻撃系聖遺物2部位を外して、カチーナを同行者に選んだ。

| 戦闘 | 試走で通したギミック |
| --- | --- |
| 合成獣・フリューゲルレーヴェ | 雷の守りを壊して使風へ移行し、風の球を3個以上破壊 |
| 游雪のブレードガーディアン | 氷の棺8層を削り切ってダウン |
| 不滅の副産物 | 通常攻撃で蘇生の守り6層を破壊 |
| 波濤の投錨者 | 2回の雷技で飲み物を中断 |

Chromeではブレードガーディアンで棺の展開と破壊、討伐、報告、復元を確認。 [Luaの4戦と装備比較](../../evidence/earned-snezhnaya-bosses-lua.json) · [Chromeの検証記録](../../evidence/earned-drifting-snow-browser.json)

## 2. 再現コマンドと結果

Python 3標準ライブラリのみ。リポジトリルートから実行する。

```sh
python docs/field-boss-v1/validate_snezhnaya.py --self-test --check-runtime-source
python -O docs/field-boss-v1/validate_snezhnaya.py --self-test --check-runtime-source
python docs/field-boss-v1/audit_reference_roster.py --self-test --json
python -O docs/field-boss-v1/audit_reference_roster.py --self-test --json
python -m py_compile docs/field-boss-v1/validate_snezhnaya.py docs/field-boss-v1/audit_reference_roster.py
```

5コマンドとも終了コード0。通常実行と最適化モードで結果は同じで、全体照合のJSON出力も一致した。検査失敗を最適化時に無効になる `assert` 文へ依存させていない。

今回のvalidator出力：

```text
PASS: 4 encounters / 12 attack cards / 27 direct windows / 1 air route / 0 hidden routes or damaging projectiles
PASS: 4 optional counters / 1 contact device / REC144 / HP0 priority / coffin persistence / no healing or persistent courage
PASS: 4 catalog IDs/names/placements; current catalog has 56 normal rows (not fixed at 49)
PASS: cumulative design 49 encounters / 147 cards / 49 reference rows / 0 remaining
PASS: master IDs equal the 49-row reference
PASS: selected old config snapshots, preserved fields, 12 source move IDs, air duration, damage values, and 4 Lua hook snapshots
PASS: 31 invalid design fixtures rejected / 3 valid boundary fixtures accepted / 4 invalid source fixtures rejected
LIMIT: static declarations and old-source markers only; no Lua execution, visual/geometry/evasion tests, or 45-90 second timing measurement
```

自己検査は不正な設計変更31例、旧ソースの破損4例を拒否し、合法な境界例3例を受理した。LOCK後30tick、隣り合う半開命中窓、風球の受付終端と風放出開始が一致する例を扱う。旧JSON/Lua照合は移行基点の確認であり、新しいロジックの試験ではない。移行後に `--check-runtime-source` が失敗した場合、旧hookへ戻すのではなく、移行状況と検査の用途を更新する。

## 3. 全13manifestの照合

ランタイム側に氷棺の短縮案が入っている場合、旧 `coffin` の値を照合したうえで、新しい `shortMove` の時刻・範囲・打数を技票と照合する。新しい受付期限を1tickずらしたデータも拒否する。戦闘と保存の実行結果は、[ブレードガーディアンの試験記録](SNEZHNAYA_DRIFTING_SNOW.md#短縮技案をラボで試す)に記録した。

[audit_reference_roster.py](audit_reference_roster.py)は、各形式のボスID欄・技参照欄・owner欄を明示的に正規化する。旧票は同じ `schema_version: 1.0` でも構造が異なるため、version文字列だけでは判別しない。

| manifest | 戦数 | カード数 | 累計 |
|---|---:|---:|---:|
| MANIFEST_STARTER | 4 | 12 | 4／12 |
| MANIFEST_LIYUE_FIELD | 3 | 9 | 7／21 |
| MANIFEST_OCEANID_INAZUMA | 4 | 12 | 11／33 |
| MANIFEST_HYPOSTASES_WOLFLORD | 4 | 12 | 15／45 |
| MANIFEST_DEEP_RUINS | 4 | 12 | 19／57 |
| MANIFEST_SUMERU_FIELD | 4 | 12 | 23／69 |
| MANIFEST_FONTAINE_FIELD | 4 | 12 | 27／81 |
| MANIFEST_DANCE_STONE | 4 | 12 | 31／93 |
| MANIFEST_NATLAN_ORIGINS | 4 | 12 | 35／105 |
| MANIFEST_NATLAN_REMAINING | 3 | 9 | 38／114 |
| MANIFEST_NOD_KRAI_QUARTET | 4 | 12 | 42／126 |
| MANIFEST_RADIANT_VIGIL | 3 | 9 | 45／135 |
| MANIFEST_SNEZHNAYA | 4 | 12 | 49／147 |

実配列に対して、49個の戦闘IDが固定比較表・主設計書と一致し、欠落・余分・重複は0。各戦3カード、全147カードのowner・参照・看板指定・宣言件数・累計を確認した。全体照合側の自己検査3例は、存在しないカード参照、複数ボスからの同カード所有、宣言件数不一致を検出した。

**技カードは戦闘IDとの複合キーで147件一意。裸の技IDは141種類であり、147種類ではない。**

| 裸IDの再利用 | 先行の戦闘 | 後続の戦闘 |
|---|---|---|
| FV01〜FV03 | エンシェントヴィシャップ・岩 | 守護者・堕天 |
| FWN01〜FWN03 | 風蝕ウェネト | 昏き魘夢の主 |

既存IDは改名しない。全体索引・取得・同期のキーを `(encounter_id, attack_id)` とし、既知の裸ID再利用はINFOとして報告する。固定49表は氷風組曲を2演目、ヴィシャップの群れを1戦とする既存の集計単位を保つ。分岐、弾、複数body、補助装置を追加の技カードへ水増ししていない。

## 4. 移行時に外す旧経路

| 対象 | 確認する接続 |
|---|---|
| フリューゲルレーヴェ | 守りの値を0にするだけで旧preemptが開幕ダウンしないよう、arm／守りonHit／preempt／形態selectorを撤去。雷と風は各eventの元素を使う |
| 風球 | 五つのHP敵・負ID・enemy登録から単一の接触装置へ。破壊、吸収、cleanupを区別し、本体へのダメージや弾の消費を複写しない |
| 獅子の位置 | 跳び込みのair・着地・追撃・RECを10tick短縮。旧galeのbodyHoverを看板・RECへ残さない |
| 氷棺 | 旧元素表、0.75、期限回復96、down1.2を外す。使用旗は開始時に確定し、退出・再予告で戻さない |
| 不滅の副産物 | 自傷とそのHP下限、12点の層、pendingBreaks、旧lifeUnits0による即down、命中回復、早期詠唱をまとめて外す |
| 投錨者 | 持続豪胆値、雷減算、通常技のvaliant差分、短いrest技、旧倍率を外す。雷の総2点は飲料受付中だけ |
| REC | 成功tickから144一回。旧down＋stand＋restを重ねず、成功後に受付や攻撃予約を復活させない |
| 表示と履歴 | 旧層数・回復量・豪胆値をラベルやframeへ残さない。旧試験結果を新仕様の実績へ移さない |

旧試作はいずれも物理で本体へダメージが通っていた。旧盾が討伐の必須条件だったと説明しない。また、副産物のHP1下限は自傷のみに掛かっていたため、プレイヤーによる撃破を止めるHPロックを廃止したという説明はしない。

## 5. 接続後に残る実行検証

### 全4体

- 物理通常のみ、同行不在／戦闘不能、通常同行、複数実プレイヤーの順に、本体を倒せる経路と各中断の手数・射程を測る。45〜90秒は標準構成の目標で、強い装備による短縮は許容する。
- LOCK後の無追尾、同じ原点と向き、壁際の退路、プレイヤーhurtbox幅＋余白、ボス実壁・移動経路、段差、低速入力を実判定で確認する。静的な矩形の正値だけでは回避可能性を証明できない。
- HP0・必要数到達・期限・予定攻撃が同tickでも、HP0→有効中断→期限→敵攻撃の順序を守る。既に生じた被ダメージは巻き戻さない。
- 成功後 `[t,t+144)` のRECは一回。部分進行、旧弾、同cast多段、反応、DoT、旧epoch、REC中の追加接触が再中断を起こさない。
- 絵・hurtbox・接地・命中範囲が対応し、羽・外殻・棺・花・錨の見た目が余分なダメージを持たないことを確認する。自然RECへ戻って実際に殴れる時間も測る。
- 撃破・撤退・退出・再初期化で当該parentの予約・装置・進行を消し、他の状態を消さない。cleanupや中断を撃破数・報酬へ加算しない。

### 固有の境界

| 対象 | 実行して確認する境界 |
|---|---|
| 風球 | 192／323tickは受付、191／324は受付外。球へ実接触した攻撃だけを数え、回復・補助・演出範囲を除外。本体へ触れない球接触でも有効、両方への接触でも本体ダメージは一度 |
| 雷→風 | 雷イベントが風へ、風イベントが雷へ誤変換されない。元素の見た目変更でHP受信先・基礎耐性・付着を作り直さない |
| 氷棺 | 60／299は受付、59／300は外。144／228tickの成功で同tick以降の波を取消。HP55%到達、HP0、既存REC、事前検査失敗、開始後の再予告、退出・再入場・旧フラグ欠損を組み合わせる |
| 氷棺の旗 | 事前検査失敗では未消費、begin後は同activationとして再予告。退出・中断で旗を戻さず、新出現世代だけでリセットする |
| 命の姿 | 60から姿勢、120から受付表示。120／299は受付、119／300は外。1〜2回で波や時計を変更せず、3回で残りを停止。被弾人数・多段・致死にかかわらず自傷・回復を発生させない |
| 飲み物 | 60／239は受付、59／240は外。雷1castは総2で一度、物理1castは1。部分進行を持ち越さず、飲料後の雷で別の減算／中断を発生させない |
| 三連錨 | 288／354／420の順に三窓。途中反転・通常技の隠れた勇躍差分・次の看板までの持続強化がない |
| 投錨と鎖 | 同じLOCK中心を着地と引き戻しで共用。追加飛翔hit、強制移動、鎖描画からの二重hitを発生させない |

Web実プレイ、Webマルチ、幻境実機、美術完成、本番マップ配置は別々に記録する。今回の静的PASSでそれらの欄を埋めない。
