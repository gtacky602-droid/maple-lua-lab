# 正機の神の週ボス試作

Lv64でスメール・樹陰の広場の依頼「工房の再現戦・端末と胸部」を受け、広場のx950から入る。ボスのHPは上半身590、全身1,040。共有充填100と後半の装甲100は別々に表示する。HP、装置効果、攻撃、報酬の具体値はラボの試作値。

## 戦い方

- 前半は胸と両腕を攻撃できる。範囲攻撃が複数部位をとらえてもHPへの加算は1回。緑の充填ブロックを歩いて拾い、装置の近くでボタンを押す。炎は氷床、氷は炎床を解除し、風はジャンプを補助し、水は回復場を作る。雷Aと雷Bが同時に効くと、6秒の攻撃機会が生まれる。
- 後半は通常攻撃と端末射撃で装甲を削る。端末を構えた時点では充填を予約し、発射するまで中止できる。胸部に弾が届くと装甲を25削る。通常攻撃で装甲を削っている間はHPが減らない。
- 装甲が消えたら滅度機4基を通常攻撃で破壊し、端末で胸部を撃つ。支援先を指定すると、同行者も指定した1基を攻撃できる。弾が届くと10秒間ボスを攻撃できる。時間切れの場合は通常計算の大ダメージが発生し、装甲0のまま戦闘に戻る。

## 素材

既存の全身ドット絵と、同じ原画から作った上半身の描画データを使う。原画には3Dモデルの正面・側面・背面と顔の参照記録がある。装置、滅度機、端末と攻撃の予兆は仮描画。背景は樹冠の仮画像を使い、本番は3D配置の方針。連続作画、音、難度調整、多人数と幻境実機は後続。 [原画の参照記録](../../evidence/shouki-reference-audit.json)

960×540の戦闘画面で、前半の上半身は幅約1,102px。中央の胴はくびれまで表示し、左右の巨腕と紫の吊り飾りがその下まで伸びる。機体は画面の上と左右からはみ出し、手前に旅人と6つの装置、攻撃予告が見える。後半の機体は744px高で上端から264pxはみ出す。滅度機の試練では630px高で浮き、ダウン中は600px高まで沈む。 [上半身戦](../../evidence/shouki-weekly-waist-upper.png) · [上半身戦の軽量16色](../../evidence/shouki-weekly-waist-upper-light.png) · [全身形態の装甲戦](../../evidence/shouki-weekly-waist-full.png) · [滅度機が残る状態](../../evidence/shouki-weekly-waist-trial.png)

端末弾は画面に見える胸の宝玉を狙う。滅度機が残っている間は胸の印が紫で、4基が消えると緑になる。通常攻撃が届く部位は前半が両腕と中央、後半が足元。 [ラボを開く](http://127.0.0.1:9015/)

```powershell
python compile_boss_assets.py --source shouki-idle-source-v1.png --output shouki-weekly-torso-sprites-v2.json --height 139 --crop 87 14 868 723
python compile_boss_assets.py --source shouki-idle-source-v1.png --output shouki-weekly-left-hand-sprites-v2.json --height 37 --crop 87 737 281 191
python compile_boss_assets.py --source shouki-idle-source-v1.png --output shouki-weekly-right-hand-sprites-v2.json --height 37 --crop 672 737 283 191
python compile_boss_assets.py --source shouki-idle-source-v1.png --output shouki-weekly-left-pendant-sprites-v2.json --height 4 --crop 390 737 32 20
python compile_boss_assets.py --source shouki-idle-source-v1.png --output shouki-weekly-right-pendant-sprites-v2.json --height 4 --crop 620 737 31 20
```

## 検証

- [正機の神の設計](SHOUKI_NO_KAMI.md) と [スメールの検証仕様](QA_SUMERU.md) のタイミングを使う。`test_shouki_weekly.py` は上半身の切り出し、胸部照準の位置、通常攻撃が届く高さ、装置、予約と発射、期限切れと600tickの露出、保存復元を確認する。 [Luaの結果](../../evidence/shouki-weekly-waist-lua.json)
- `test_shouki_weekly.mjs` は装備付きLv64の試験データで、Chromeから受注、元素装置の起動、予約の中止、装甲と胸部への射撃、滅度機4基の破壊、討伐、報告、保存復元まで確認する。各段階で構図、装置、照準位置を確認し、390px幅での操作欄も検査する。 [Chromeの結果](../../evidence/shouki-weekly-waist-browser.json)
- 胸部への射撃後にダウンした同一フレームで、元PNG、標準矩形、軽量16色を比較した。 [PNG](../../evidence/shouki-weekly-waist-png.png) · [標準矩形](../../evidence/shouki-weekly-waist-standard.png) · [軽量16色](../../evidence/shouki-weekly-waist-light.png)
