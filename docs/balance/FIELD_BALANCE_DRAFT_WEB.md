# 通常敵と武器のバランス比較版

同じ冒険のJSONを二つのラボで読み込み、狩場へ出て比較できる。比較版の画面上部には調整対象の敵の数と最大HPの範囲を表示する。ランキング集計の対象外で、日次依頼のサーバー側記録は再起動時に初期化される。

```powershell
./Start-Lab.ps1 -Port 9081 -NoOpen
./Start-Lab.ps1 -Port 9080 -DraftBalance -NoOpen
```

各画面で「JSONを読み込んで再開」を選び、同じセーブを読み込む。Lv1から進めたセーブを作る場合は、リポジトリの測定手順を使える。 [獲得セーブの作り方](EQUIPMENT_PROGRESSION_WEB.md)

## 比較版の仮設定

- 既存フィールドの通常敵に、敵Lvで決まるHPを適用する。設定の節目の間は倍率で補間し、個体ごとの元HPの差も残す。装備、同行者、協力人数はHPに影響しない。
- 日次の精鋭、光界障壁のある敵、依頼によって段階的に配置される敵、攻略後に敵が消える依頼マップ、ボスは既存のHPを使う。通常敵の討伐経験値とモラも既存式を使う。
- 璃月の報酬剣は未強化でATK16。初期剣を+10にしたATK14を上回る。報告済み依頼から入手判定を復元し、同じアイテムIDと強化段階で比較できる。 [試作設定値](../../content/field-balance-draft.json)

## 測定結果

旅人を敵の50px手前に置き、敵と同行者の動きを止め、通常攻撃を押し続けた。装備と使用できるモラはルート上のセーブを使用した。下の表は試した地点から抜粋している。 [通常版の全9地点](../../evidence/equipment-progression-lua.json) · [比較版の全9地点と月縁の報酬剣](../../evidence/equipment-progression-draft-lua.json)

| Lv | フィールド | 敵HP 通常→比較 | 測定した装備 | 撃破時間 通常→比較 |
| ---: | --- | ---: | --- | ---: |
| 20 | 璃月・岩間の狩場 | 15 → 32 | 旅の初期剣+0 | 0.750秒 → 1.950秒 |
| 40 | 稲妻・海辺の街道 | 15 → 72 | 港の護送剣+0 | 0.617秒 → 1.217秒 |
| 80 | フォンテーヌ・水路沿い | 15 → 182 | 森の観測剣+0 | 0.617秒 → 1.217秒 |
| 120 | ナド・クライ・月明かりの道 | 15 → 3,600 | 聖遺物5部位、初期剣+0 | 0.017秒 → 0.617秒 |
| 160 | 極光谷・氷の切通し | 11 → 4,767 | 聖遺物5部位、白虹峠の剣+0 | 0.017秒 → 0.150秒 |
| 200 | 極地の暁晶原 | 16 → 554,667 | 聖遺物5部位、白虹峠の剣+0 | 0.017秒 → 0.750秒 |

Lv200まで進めたセーブから、比較版で月縁の反射板・照合・歩行晶の戦闘・報告を確認し、月縁の帰路剣を取得した。歩行晶の試験では、ギミック確認用の攻撃を使った。続く暁晶原の測定では、同じ聖遺物で白虹峠の剣+0は0.750秒、月縁の帰路剣+0は0.617秒、+5は0.150秒。+5に使ったモラは120万。 [月縁の依頼試験](../../evidence/moonlit-garden-draft-route.json)

Chromeでは比較版の璃月で配達を報告し、港の護送剣を+1にして保存と再開を確認した。その編成で狩場へ歩いて入り、通常敵を倒した。Luaでは同じ敵を倒すと両版で23 EXPと10モラを受け取り、再出現時もそれぞれのHPになることを確認した。 [Chrome](../../evidence/liyue-m01-browser-draft.json) · [Lua](../../evidence/field-balance-draft-lua.json)

Lv20到達時のセーブで、旅人の聖遺物なしから初期剣を+5に強化し、モンドへ戻って「山脊の見守りⅠ」を2周した。獲得した蒼白の炎の花と羽を装備するとATKが8から82、最大HPが140から236になり、保存から再開して維持された。序盤の狩りでは強い伸び幅なので、報酬剣と両方を使った進行も測る。 [秘境2周の測定](../../evidence/field-balance-draft-lua.json)

Lv120の試験セーブから聖遺物を外し、初期剣に戻した条件では180秒以内に倒せなかった。装備を拾い損ねた場合のナタからLv120までの入手経路は、別の試走で確認した。11月20日の全敵設計表との照合、比較版全編の通し試験、星々の幻境の実機は未検証。 [手持ちが足りない場合のナタの試走](NATLAN_GEAR_RECOVERY_WEB.md)

## 再測定

```powershell
python measure_equipment_progression.py
python test_field_balance.py --recovery-route work/mondstadt-fresh-route/liyue-save.json
python test_moonlit_garden.py --earned-save work/cap-fresh-route/lv200-save.json --draft-balance
python measure_equipment_progression.py --draft-balance --moonlit-save work/moonlit-garden-balance/draft-sword-save.json
```
