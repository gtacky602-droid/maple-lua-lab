# 赤璋巡岳府君・シネアスと通常のヴィシャップ

移即・天虞とシネアスを、対応する通常個体の図鑑、ゲーム内の全身、元素が付いた状態、別角度の動画で見比べた。12点のうち7点は、従来の地方伝説だけの作画記録に加えた通常型の資料。通常型と名付き個体のページにある同じ図鑑画像は1点に数えた。 [確認した画像・動画と出典](../evidence/vishap-legend-references.json) · [前回の作画記録](BRANCH_LEGEND_ART_V2.md)

| 地方伝説 | 共通する形 | ドット絵への反映 |
| --- | --- | --- |
| 赤璋巡岳府君・移即と天虞 | ヴィシャップ・岩と額の橙色、顎の淡い縁、幅のある肩、岩板の重なり、先細りの尾が対応する。付与前の通常型でも体は黄褐色の岩肌。 | 新しい待機絵は通常型の肩、胴、脚、尾を土台にした。移即は前脚の橙の発光、天虞は前脚の青白い結晶で見分けられる。 [付与前・炎・氷の通常型](https://genshinchronicle.com/gameplay/geovishap-genshin-impact-guide/) · [2体が並ぶ近景](https://gamewith.net/genshin-impact/article/show/43755) |
| シネアス | アビサルヴィシャップ・原種と、濃紺の尖った頭、顎の両側の淡色、太い前脚、高い背の突起が対応する。 | 改稿した待機絵の共用を試す。次稿では額の青い細長い突起、顎の明暗、背と尾の長さを横の資料から詰める。足元の青い円や胸の強い光は戦闘中の見え方として扱う。 [通常型の図鑑と旋回](https://wiki.biligame.com/ys/深海龙蜥·原种) · [シネアスの現地](https://altema.jp/gensin/cineas) |

シネアスの配置比較は左から通常型候補、シネアス改稿、シネアス初稿。左と中央は同じ素材を118px高・同じ接地で描く。 [シネアスの配置比較](http://127.0.0.1:9010/map-art.html?node=cineas-legend-chamber)

共用候補の描画は標準5,273矩形、中間32色3,170矩形、最軽量16色1,497矩形。最軽量で約72%減り、肩と前脚の輪郭は残る。Chromeで通常敵とボスの各ギャラリーの描画が3設定で一致し、390px幅に収まることを確認した。Luaでは新候補を含む33素材の接地点と3設定の矩形数を確認した。 [シネアスの比較画像](../evidence/vishap-cineas-legend-chamber.png) · [赤璋の比較画像](../evidence/vishap-chizhang-legend-terrace.png) · [ブラウザ検査](../evidence/vishap-legend-preview-browser.json)

## 赤璋の共通待機絵

Astraの別チャットが、ヴィシャップ・岩の1枚の原画から、前脚の岩板の色が異なる移即と天虞を制作した。配置比較は左から通常型、移即、天虞。表示高118pxで同じ足元に揃えた。元PNGと3段階の矩形描画で透過輪郭は3体とも一致する。 [赤璋の配置比較](http://127.0.0.1:9016/map-art.html?node=chizhang-legend-terrace) · [旧稿と新稿の比較](../evidence/geovishap-shared-idle-art-review.png) · [作画資料と判断](../evidence/geovishap-shared-idle-references.json)

| 待機絵 | 標準 | 中間32色 | 最軽量16色 |
| --- | ---: | ---: | ---: |
| ヴィシャップ・岩 | 5,065 | 3,132 | 1,585 |
| 移即 | 4,977 | 3,074 | 1,519 |
| 天虞 | 5,035 | 3,117 | 1,486 |

最軽量では矩形数が69〜70%減る。移即・天虞は、それぞれ前脚の差を示す4色を16色の枠内に確保した。通常型は沈玉の谷の茶棚と璃月の山際の秘境の脇部屋にいる成体2体に適用した。 [Luaでの描画と配置検証](../evidence/geovishap-shared-idle-lua.json)

Chromeで茶棚の脇部屋まで移動し、通常型のPNGがそこで読み込まれて足場に接することを確認した。3体の配置は3段階すべてで表示でき、2つの素材ギャラリーは390px幅に収まる。 [本編の通常型](../evidence/geovishap-shared-idle-live.png) · [比較画面](../evidence/geovishap-shared-idle-lab.png) · [ブラウザ検証](../evidence/geovishap-shared-idle-browser.json)

## 赤璋の構えと攻撃

移即と天虞に共通の構えと踏み込みを作画し、待機を含む3ポーズを赤璋の丘の戦闘に反映した。構えは前脚を着けて腰を低くし、尾を上げる。攻撃では前脚を踏み出して後脚と尾を伸ばす。表示高は待機118px、構え98px、攻撃105pxで、すべて同じ床位置を基準にした。最軽量16色でも、移即の前脚の橙と天虞の青白い結晶が分かる。 [3ポーズ比較](../evidence/chizhang-shared-motion-review.png) · [使用した参照と判断](../evidence/chizhang-shared-motion-references.json)

Luaで両者の3ポーズの切り替えと、向き・足元・攻撃判定・共有HPを確認した。Chromeで赤璋の丘へ入り、移即と天虞の攻撃をそれぞれ撮影した。 [移即の踏み込み](../evidence/chizhang-ember-strike.png) · [天虞の霜の輪](../evidence/chizhang-frost-strike.png) · [標準と軽量の検証](../evidence/sites-branch-legends-browser.json)

名付き個体の完全な背面、3Dビューアによる回転、モデルとテクスチャのIDは未確認。通常のアビサルヴィシャップは待機比較の段階。

ラボの試作配置では、淵下宮・探索路の右上の足場にLv40のアビサルヴィシャップ・原種が1体いる。通常個体の表示高は118px。配置図鑑から往日の海のシネアスの会場も開ける。 [原種の配置とシネアスの比較](../field-enemy-guide.html?species=primordial-bathysmal-vishap)
