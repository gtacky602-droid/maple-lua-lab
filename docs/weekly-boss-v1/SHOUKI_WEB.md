# 正機の神の週ボス試作

Lv64でスメール・樹陰の広場の依頼「工房の再現戦・端末と胸部」を受け、広場のx950から入る。ボスのHPは上半身590、全身1,040。共有充填100と後半の装甲100は別々に表示する。HP、装置効果、攻撃、報酬の具体値はラボの試作値。

## 戦い方

- 前半は胸と両腕を攻撃できる。範囲攻撃が複数部位をとらえてもHPへの加算は1回。緑の充填ブロックを歩いて拾い、装置の近くでボタンを押す。炎は氷床、氷は炎床を解除し、風はジャンプを補助し、水は回復場を作る。雷Aと雷Bが同時に効くと、6秒の攻撃機会が生まれる。
- 後半は通常攻撃と端末射撃で装甲を削る。端末を構えた時点では充填を予約し、発射するまで中止できる。胸部に弾が届くと装甲を25削る。通常攻撃で装甲を削っている間はHPが減らない。
- 装甲が消えたら滅度機4基を通常攻撃で破壊し、端末で胸部を撃つ。支援先を指定すると、同行者も指定した1基を攻撃できる。弾が届くと10秒間ボスを攻撃できる。時間切れの場合は通常計算の大ダメージが発生し、装甲0のまま戦闘に戻る。

## 素材

既存の全身ドット絵と、同じ原画から作った上半身の描画データを使う。原画には3Dモデルの正面・側面・背面と顔の参照記録がある。装置、滅度機、端末と攻撃の予兆は仮描画。背景は樹冠の仮画像を使い、本番は3D配置の方針。連続作画、音、難度調整、多人数と幻境実機は後続。 [原画の参照記録](../../evidence/shouki-reference-audit.json)

```powershell
python compile_boss_assets.py --source shouki-idle-source-v1.png --output shouki-weekly-upper-sprites-v1.json --height 176 --crop 0 0 1024 928
```

## 検証

- [正機の神の設計](SHOUKI_NO_KAMI.md) と [スメールの検証仕様](QA_SUMERU.md) のタイミングを使う。 `test_shouki_weekly.py` は装置、充填、装甲、予約と発射、滅度機、期限切れ、600tickの露出、保存復元を確認する。 [Luaの結果](../../evidence/shouki-weekly-lua.json)
- `test_shouki_weekly.mjs` は装備付きLv64の試験データで、Chromeから受注、元素装置の起動、予約の中止、装甲と胸部への射撃、滅度機4基の破壊、討伐、報告、保存復元まで確認した。 [Chromeの結果](../../evidence/shouki-weekly-browser.json) ／ [上半身戦](../../evidence/shouki-weekly-upper.png) ／ [滅度機の試練](../../evidence/shouki-weekly-trial.png)
- 胸部の反撃中の同一フレームで、描画指示はPNGで11件、標準矩形で11,646件、軽量16色で2,888件。軽量16色版は標準矩形より75.2％少ない。 [PNG](../../evidence/shouki-weekly-png.png) ／ [標準矩形](../../evidence/shouki-weekly-standard.png) ／ [軽量16色](../../evidence/shouki-weekly-light.png)
