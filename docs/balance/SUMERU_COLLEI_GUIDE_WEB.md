# 今日の案内役は、私！

Lv60でスメール第1話「地図には、道があるんだけど？」を報告すると、樹陰の広場でコレイの依頼（Q-SUM-S03）を受けられます。 [企画書](../quest-v1/regions/04_SUMERU.md#q-sum-s03-今日の案内役は私)

1. 広場でコレイの話を聞き、林巡りの練習道へ出ます。候補の近くで G を押し、初めての人にも見える目印と、雨の日も使える休憩所を選びます。上段の候補を見に行ったときは、コレイが下の道からの見え方を説明します。候補は何度でも選び直せます。 [練習道](../../evidence/sum-collei-guide-markers.png) · [休憩所](../../evidence/sum-collei-guide-rest.png)
2. 水音の分かれ道へ入ると雨が降り、増水した川沿いの近道が閉じます。コレイと水かさを確かめ、根の下の迂回路を選びます。右端の門を F で通ると集合所に着きます。 [雨の分かれ道](../../evidence/sum-collei-guide-rain-png.png)
3. 集合所でコレイと新人を迎え、右の門から広場へ戻って報告します。報告時に220,004 EXPと試作値の2,100モラを一度受け取れます。 [新人を迎える場面](../../evidence/sum-collei-guide-welcome.png)

報告後は地図の「休憩へ：林巡りの休憩所」から屋根の近くまで移動できます。G の休憩は最大32HP回復する試作です。分かれ道では雨が上がり、上段の川沿いの近道も通れます。

手紙は報告後の任意の寄り道です。樹陰の広場でコレイから預かり、モンドの城門広場でアンバーに渡すと会話が増えます。預かった状態と届けた状態が保存され、配達済みならアンバーの返事を読み返せます。 [手紙の場面](../../evidence/sum-collei-guide-letter.png)

目印、休憩所、柵、封筒、新人の形は自作3Dモデルを三方向から確認しました。新人は帽子を除いて約3頭身を目安に描き、集合所で一枚絵を移動させています。コレイとアンバーは台詞で登場します。背景画像3枚はラボ用で、雨もブラウザ側で描画します。本番では背景を3Dで配置する方針です。 [装飾のモデル](../../evidence/sum-collei-guide-views.png) · [新人のモデル](../../evidence/sum-collei-guest-views.png) · [素材の記録](../../evidence/sum-collei-guide-art.json)

雨の同一フレームで、Luaの描画命令はPNG表示が27件、標準矩形が7,058件、軽量16色が1,842件でした。軽量16色で矩形命令は約74％減りました。柵と根の青い布は判別でき、木目や布の結び目の細部は粗くなります。 [PNG表示](../../evidence/sum-collei-guide-rain-png.png) · [軽量16色](../../evidence/sum-collei-guide-rain-light.png)

`python server.py --port 8918` でラボを起動し、`python -X utf8 test_sumeru_collei_guide.py`、`node test_sumeru_collei_guide.mjs` の順で実行すると、候補の選び直し、雨の迂回、休憩、報告後の手紙を検証できます。 [Lua](../../evidence/sum-collei-guide-lua.json) · [Chrome](../../evidence/sum-collei-guide-browser.json)
