# レムナント遺跡と豊穣の邦の夜魂の試練

**M → ナタ → 狩場・任意戦** から試練を選ぶ。どちらもLv120で、黒曜石の柱の近くで **F** を押すと入れる。

| 試練 | 入口 |
| --- | --- |
| レジ | 東の外輪の棚 → レムナント遺跡の海側の山裾 → 草地の柱 |
| トゥプの繁栄 | 南東の崩れ谷から徒歩、または南の小島の波止場から小舟 → 豊穣の邦の岬 → 上段の柱 |

レジへは外輪の右の岩棚から山裾に入り、右へ進んで岩棚を下りる。崩れ谷から岬へは左の岩棚に上がって **F**。小島から行く場合は中央の桟橋で **F** を押す。岬では二段の足場の重なるところで **Space** を使う。上段の柱から試練に入り、退出後は同じ高さの柱へ戻る。

ナタ拠点の任意依頼「山裾と岬の道標」を受けると、柱の手前の道標を **G** で調べられる。地図では遺跡の山裾を外輪の海側に、岬を小島の北東に配置した。岩棚・徒歩の接続・小舟・依頼はラボ用の試作。背景は仮画像。レジの弾の反射や、トゥプの繁栄で行う元素を使った対処は仕様待ち。 [原作の地図と柱の写真](https://game8.jp/genshin/635875) · [レジの戦闘画面](https://gamewith.net/genshin-impact/article/show/55006) · [トゥプの繁栄の戦闘画面](https://gamewith.net/genshin-impact/article/show/55048)

## ドット絵と検証

レジは青白い人型と幅広のスリング、トゥプは枝分かれした冠と稲妻形の裾で見分けられる。各3枚。構えと動作は見た目確認用。 [全6ポーズと16色比較](../evidence/natlan-atocpan-totem-poses.png) · [画像の参照記録](../evidence/natlan-atocpan-totem-art-sources.json)

LuaでLv制限、徒歩と小舟の経路、上段の柱、報酬と討伐記録の保存、再挑戦を確認した。Chromeで地図の案内、現地の **G** と **F**、徒歩と小舟の往復、元PNGと軽量16色の表示を試した。標準の矩形描画から軽量16色に切り替えたときの画面全体の描画命令数は、レジで8,388から2,244、トゥプで7,532から1,955に減った。 [Luaテスト](../evidence/natlan-atocpan-totem-lua.json) · [ブラウザテスト](../evidence/natlan-atocpan-totem-browser.json) · [実画面比較](../evidence/natlan-atocpan-totem-comparison.png) · [山裾の柱](../evidence/natlan-reji-ruins-pillar.png) · [岬の柱](../evidence/natlan-tupu-headland-pillar.png) · [小舟の地図案内](../evidence/natlan-tupu-boat-guide.png)
