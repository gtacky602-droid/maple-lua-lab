# フォンテーヌの水辺と沈水狩場

**M → フォンテーヌ → 狩場・任意戦** で目的地を選ぶと、隣の門への案内が出る。6つの狩場はいずれもLv99から入れる。地上では **Space** で足場に跳び、**F** で門を通る。

| 狩場 | 道の特徴 |
| --- | --- |
| ベリルの秘境周辺 | 入江から水門へ進む。水面沿いの低い足場から上段を渡れる。近くの脇部屋はLv100。 |
| 廷北の秘境周辺 | 埠頭から街の外れに向かって足場が高くなる。出入口は町側の坂に戻る。 |
| 海中の秘境周辺 | 南の沈水層で門と同じ深さに合わせて **F**。水路を抜けると、段状の石床を歩いて登れる。 |
| 海中の征討入口 | 東の水底回廊から水路を通り、柱列を望む石床へ出る。二つの海中狩場は、それぞれ来た水路へ戻れる。 |
| モルテ側の秘境周辺 | 排水門の内側に高さの異なる石棚がある。入口側の脇部屋はLv100。 |
| 北岸の征討入口 | 港を見下ろす崖道に、高低差のある足場が続く。浜の水門、倉庫、灯台下に脇部屋の門がある。 |

足場と通り道は横スクロール用の試作。背景には既存のラボ用仮画像を割り当て、入江、埠頭、沈んだ段丘、柱列、水門、港の高台を見分けられるようにした。 [入江](../evidence/fontaine-domain-inlet-terrain.png) · [沈水狩場](../evidence/fontaine-domain-sunken-terrace-terrain.png) · [モルテ側の水門](../evidence/fontaine-domain-sluice-terrain.png) · [北岸の高台](../evidence/fontaine-domain-north-cliff-terrain.png)

## ドット絵と移動の検証

配置比較で「この地点の本編配置を読み込む」と、左に元PNG、右に選んだ描画設定が表示される。ベリルの同じ画角では標準の25,902矩形から16色版の7,075矩形になり、約73%減った。 [比較画面の画像](../evidence/fontaine-domain-art-compare.png) · [6地点の計測値](../evidence/fontaine-domain-art-compare.json)

Luaで敵228体の接地、通常ジャンプ36回、5つの脇部屋を含む11経路の往復を確認した。Lv80の到達セーブから本編を再試走し、6件の依頼を終えてLv100でナタに到着。セーブを読み直して冒険を続けられた。 [足場と帰路](../evidence/fontaine-domain-terrain-lua.json) · [Chromeでの移動とM地図](../evidence/fontaine-domain-terrain-browser.json) · [Lv80〜100の記録](../evidence/fontaine-fresh-route.json)
