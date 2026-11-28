# 禍津御建鳴神命の週ボス試作

稲妻・城下の広場でLv48の依頼「悪曜の再現戦・追念の花蕊」を受注し、広場のx1305にある入口から入る。通常時は薙刀と刀を持ち替え、凶運の蓄積で悪曜へ移る。HPは戦闘を通して1本。凶運が満ちる前も討伐できる。

雷眼は通常攻撃4回で消える。残影戦ではX字を出した相手に近づいて攻撃する。範囲攻撃でも選ぶのは操作中のキャラに近い1体。間違った残影を攻撃するとその1体が消える。三杭の波はジャンプや上段の足場でかわす。

悪曜の「追念の花蕊」は通常攻撃5回、または雷を含む攻撃1回で充填できる。大太刀は保護域の内側なら被ダメージ0。外側では通常の被ダメージ計算を通る。装甲崩壊後は8秒の攻撃機会があり、復帰してもHPは回復しない。

充填済みの花蕊には保護域の印が出る。大太刀が来る直前は、操作中のキャラが保護域の内側か外側かと、着弾までの残り時間をHUDに表示する。外側では、キャラの位置に合わせて左右どちらの保護域へ進むか、床へ降りる必要があるかを案内する。発動後はそのキャラの判定結果を表示する。

共闘中に始まる花蕊は中央に出現する。複数のキャラが同じ花を充填し、大太刀の防護はそれぞれの位置で判定する。全員で退避した場合は戦況を維持し、全員が倒れた場合は初期状態から再戦する。 [入口・共闘手順・検証](../COOP_WEB_PREVIEW.md#雷電将軍の週ボス戦)

## 仮値と素材

- Lv48、HP1,500、装甲100、大太刀の基礎ダメージ62、討伐と報告の報酬はラボの試作値。行動の時刻は [WR01〜18の設計](RAIDEN_SHOGUN.md) と [マニフェスト](MANIFEST_INAZUMA.json) を参照。
- 通常姿は3Dモデルのプレビューと装甲画像の色・素材感を参照した独自衣装。頭頂からあごと靴底を測って約2.85頭身。内蔵ImageGenで作成し、112pxの標準から56px・16色にすると、通常姿の矩形数が2,355から675に減る。武器は別レイヤーで描画する。 [生成記録](../../assets/raiden-weekly-normal-generation-v1.json)
- 悪曜は既存ラボ用素材、背景は雷鳴の岩峰の仮画像。本番背景は3D配置の方針。連続作画、音、報酬調整、遠隔接続と幻境実機は後続。

## 検証

獲得済みのLv200セーブを使う最上級の比較は、`python -X utf8 test_earned_raiden_flower.py --from-save work/current-atlas-recheck/current-atlas-save.json --output-dir work/raiden-flower-frames`。ラボ配信中に `node test_earned_weekly_frames.mjs work/raiden-flower-frames work/raiden-flower-comparison` を実行すると、HUDの表示と21場面の元絵・中間・軽量の画像を確認できる。 [3条件の最上級再戦](../../evidence/raiden-flower-branches-20261128.json)

`test_raiden_weekly.py` はWRカードの時刻、雷眼、残影、三杭のジャンプ、旧入力を除いた花蕊の充填、保護外の通常ダメージ、装置不在での中止、480tickのダウン、報告と保存復元を確認する。 `test_raiden_weekly.mjs` はLv48の装備付き試験データを読み、ブラウザの入力で受注・門・追念の花蕊・討伐・報告・保存を確認する。

- [Luaの記録](../../evidence/raiden-weekly-lua.json)
- [Chromeの記録](../../evidence/raiden-weekly-browser.json)。装備付きLv48で受注、通常攻撃だけで花蕊を5目盛り充填、大太刀の保護、装甲崩壊、討伐、報告、再開を確認。 [花蕊による保護](../../evidence/raiden-weekly-dome.png)
- 悪曜の保護場面は [PNG](../../evidence/raiden-weekly-png.png) が78件、[標準矩形](../../evidence/raiden-weekly-standard.png) が11,668件、[軽量16色](../../evidence/raiden-weekly-light.png) が3,450件。3方式で同じ時刻・HPの画面を記録した。
- [通常形態の同一フレーム比較](../../evidence/raiden-weekly-normal-comparison.json)。PNGは19件、標準矩形は6,594件、軽量16色は1,737件。描画指示数は背景以外の戦闘描画を含み、軽量版は標準矩形より73.7％少ない。 [PNG](../../evidence/raiden-weekly-normal-sprite.png) ／ [標準矩形](../../evidence/raiden-weekly-normal-standard.png) ／ [軽量16色](../../evidence/raiden-weekly-normal-light.png)

## 天守から最上級4勝まで

淑女の最上級3勝を記録したLv200セーブで、M地図から悪曜の再現戦へ進んだ。Chromeでは通常攻撃で装甲を削り、花蕊を通常攻撃5回で充填して保護域内で大太刀を防いだ。装甲崩壊後に討伐し、初回の32,560,274 EXPと3,590,160モラを獲得。綾華への依頼報告で44,000 EXPと3,400モラを受け取った。 [初回と幅390pxの表示](../../evidence/earned-raiden-first-expert-browser.json)

同じセーブからLuaで3回続けて再戦し、充填済みの保護域内では0ダメージ、充填済みの保護域外と未充填の花蕊のそばでは各62ダメージを確認した。装甲崩壊後の攻撃可能時間は480tickで、修復後もボスHPが保たれた。再戦報酬は各18,999,684 EXPと1,538,640モラ。試走では獲得済みの花を一時装備して羽を外し、コピー内の未装備品を1点売却した。元の装備に戻したセーブから最上級4勝、再出現待ち、依頼報告114件をChromeで読み戻した。 [3回の連続再戦](../../evidence/earned-raiden-rematch-lua.json)・[Chromeで再開](../../evidence/earned-raiden-rematch-browser.json)

初回の討伐と依頼報告を終えた上記のセーブを `test_earned_raiden_flower.py --from-save SAVE --output-dir OUTPUT --weapon SW07 --chain` に渡すと、3条件を続けて試せる。ラボの配信中に `node test_earned_weekly_frames.mjs OUTPUT OUTPUT/comparison` を実行すると、着弾直前と判定直後を含む21場面を3画質で比較できる。 [描画比較の記録](../../evidence/earned-raiden-rematch-frames-browser.json)
