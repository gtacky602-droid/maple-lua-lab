# 観測器に、お客さん？

スメール第1話「地図には、道があるんだけど？」を報告すると、樹陰の広場でティナリの依頼（Q-SUM-S02）を受注できます。Lv60から遊べます。 [企画書](../quest-v1/regions/04_SUMERU.md#q-sum-s02-観測器にお客さん)

1. 広場でティナリの話を聞き、右の門から観測器の草地へ。まとまっているキノコン四体を退け、観測器に近づいて G で音を記録します。音の順は画面にも表示されます。「装置音を聞く」を押して G を押すと音声で聞けます。 [草地の群れ](../../evidence/sum-fungus-visitors-meadow.png)
2. 標本台の段丘で、地上・中段・上段にいるキノコンを一体ずつ退けます。根の段を二つ登り、上段で星形の葉が付いた標本袋を調べます。 [段丘](../../evidence/sum-fungus-visitors-terrace.png)
3. 保管所前で素早く近づくキノコン三体を退けます。足跡を調べ、保管所の観測器の音を記録します。星葉草の標本を G で持つと、観察中の一体が標本の方へついてきます。 [標本を運ぶ場面](../../evidence/sum-fungus-visitors-carry-png.png)
4. 奥の棚で G を押して標本をしまいます。一体が棚から離れたら、同じ観測器の音を聞き直します。標本を移しても音の順と間隔は同じでした。右の門から広場へ報告に戻ります。 [格納後](../../evidence/sum-fungus-visitors-stored.png)

報告すると164,740 EXP、試作報酬の2,000モラと強化鉱石3個を一度受け取れます。討伐途中の記録と標本の運搬・格納は保存されます。報告後は落ち着いた三つの地点を再訪し、音を聞き直せます。

観測器、袋、足跡、棚は自作3Dモデルを三方向から確認してドット絵にしました。ティナリは台詞で登場します。キノコンには既存の待機絵を使い、観察個体の追従と離脱を位置の変化で見せています。星葉草は本作の創作植物です。敵のHP・移動速度と離脱時間は試作値です。背景画像3枚はラボ用で、本番は3D配置の方針です。 [形状モデル](../../evidence/sum-fungus-visitors-views.png) · [素材の記録](../../evidence/sum-fungus-visitors-art.json)

標本を運んでいる同一フレームでは、描画命令がPNG表示で28件、標準矩形で11,567件、軽量16色で2,882件でした。軽量16色では矩形の描画命令が約75％減り、観測器や開いた棚の輪郭は読めます。観測器の金属の光沢や、星形の葉の細部は粗くなります。 [PNG表示](../../evidence/sum-fungus-visitors-carry-png.png) · [軽量16色](../../evidence/sum-fungus-visitors-carry-light.png)

`python server.py --port 8917` でラボを起動し、`python -X utf8 test_sumeru_observation_visitors.py`、`node test_sumeru_observation_visitors.mjs` の順で実行すると、三地点の戦闘、同じ観測器の音の比較、再訪時の状態を検証できます。 [Lua](../../evidence/sum-fungus-visitors-lua.json) · [Chrome](../../evidence/sum-fungus-visitors-browser.json)
