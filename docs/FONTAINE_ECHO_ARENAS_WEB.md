# 消えゆく老兵と隠者の王・ドアーチュ

[ローカルLuaラボ](http://127.0.0.1:8984/)を開き、Mの地図でフォンテーヌの「狩場・任意戦」を選ぶ。両方ともLv100。入口まで泳ぎ、門と深さを合わせてFを押す。

| 挑戦 | 入口 | 水弾の動き |
| --- | --- | --- |
| 消えゆく老兵 | 南の水底のトンネル → エルトン海溝・老兵の沈船跡 | 潜伏から一つ水弾が来る。姿を見せた後は深さを変えた二連弾と、幅の広い水塊を使う。 |
| 隠者の王・ドアーチュ | 市街西の水底 → 希望の道・隠者の水庭 | 潜伏から上下に順番に撃つ。上下同時に撃つときは間を通れ、もう一度潜るとプレイヤーがいた深さを狙う。 |

WASDか方向キーで泳ぐ。潜伏中は波紋が出た方向を向き、深さを合わせてKで探知する。探知が届くと水弾が止まり、約2.3秒の反撃時間を表示する。その間にJで水撃。水弾が移動する間は弾の近くに当たり判定があり、オレンジの予告からはSpaceかShiftで急回避できる。入口側のFで退き、入り直すと新しい一戦が始まる。Kの探知、反撃時間、各攻撃、HP、報酬はラボの試作。日次の対象外。入口は配置案に沿って接続し、背景にはラボの仮画像を使用した。 [配置案](../design/world/encounters.json)

老兵は淡い胸と紺の下半身、ドアーチュは灰青の胴と青緑のひれ縁。名前付き戦闘画面の正面と斜め、公式の亜種紹介図を参照して、待機・構え・発射を各3枚描いた。 [全6ポーズの比較](../evidence/fontaine-echo-art-poses.png) · [出典と試作配色](../evidence/fontaine-echo-art-sources.json)

LuaでLvの境界、潜伏中のJ、前後のK判定とクールダウン、水弾の発生・命中・探知での中断、退却と再戦、報酬・保存を確認した。移動・探知・水撃を使った単独の自動試走で、老兵は66.68秒、ドアーチュは71.35秒。 [Lua検証ログ](../evidence/fontaine-echo-lua.json)

ChromeではMでの入口案内、キーボードによる探知と反撃、同じ停止フレームで元PNGと軽量16色を確認した。 [Chrome検証ログ](../evidence/fontaine-echo-browser.json) · [老兵の潜伏中](../evidence/fading-veteran-concealed.png) · [探知直後のPNG](../evidence/fading-veteran-revealed.png) · [軽量16色](../evidence/fading-veteran-light.png) · [ドアーチュの潜伏中](../evidence/dobharcu-concealed.png) · [探知直後のPNG](../evidence/dobharcu-revealed.png) · [軽量16色](../evidence/dobharcu-light.png)
