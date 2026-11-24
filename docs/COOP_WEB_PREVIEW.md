# ローカルラボの協力プレイ

ローカルラボの通常の冒険を、参加者それぞれのブラウザプロフィールで開く。画面下の「協力プレイ（ローカル試作）」を開き、対応する395地点のいずれかで部屋を作る。他の参加者は対応地点で合言葉を入力し、「参加」を押す。部屋には最大4人が入れる。通常の編成なら、同じ地点に旅人と同行者が最大8体表示される。 [部屋を作成・参加できる地点](../content/coop-preview.json)

参加者の入力をサーバーのLuaへ送り、マップごとに敵のHP、攻撃、再出現を60Hzの刻みで進める。仲間の現在地は画面下の協力欄に表示され、同じ共有マップにいる操作キャラには水色の名前が出る。地図を開いたプレイヤーの移動・攻撃入力は止まり、その場の戦闘は続く。

装備、依頼、同行者、EXP、モラは各人の冒険のデータを使う。フィールド戦などでは、12秒以内に敵へ有効打を当てるか、一部の戦闘で専用ギミックを処理し、撃破時に横420px・縦180px以内にいると討伐に参加した扱いになる。自分の同行者の攻撃も含める。対象者ごとにEXPとモラを付け、受注済みの討伐依頼だけを進める。聖遺物は各自の指定セットと抽選記録を使い、各自の画面で回収する。閾値は試作設定。 [設定](../content/coop-preview.json)

画面を再読み込みすると、60秒の離席猶予の間は同じ部屋に復帰できる。「部屋から出る」を選ぶ、保存を読み込む、通常の冒険を離れると退出する。保存は各自が行い、読み込みは通常どおり町から再開する。協力部屋はローカルサーバーの起動中に使える。ランキング対象の冒険からは通常の冒険を開いて参加する。

## 別々のマップで遊ぶ

ポータルで別れると、各マップにいる人だけで戦闘が続く。討伐時に別のマップへ出た人には、その討伐の報酬が入らない。共有マップに接続中の参加者がいなくなると、敵HPと再出現の残り時間を保持して休止し、誰かが戻ると続きから進む。対応地点以外へ進んだ場合は、部屋に所属したまま各自の戦闘になる。

HTTPで、同じ部屋の4人が南の街道と風鳴りの広場に2人ずつ分かれ、各マップの討伐に参加した2人それぞれへ報酬が付くことを確認した。Chromeの2画面では、町と広場からの参加、離れたマップの進行、再読み込み、広場への合流を確認した。 [HTTPの検証](../evidence/coop-travel-http.json) · [別行動時の協力欄](../evidence/coop-travel-split.png) · [広場での合流](../evidence/coop-travel-regroup.png) · [Chromeの検証](../evidence/coop-travel-browser.json)

## 幽境のファルカを共闘する

モンドの町から「二刀の鍛錬場」に入り、同じ合言葉の部屋に集まる。各自が難度と欲しい聖遺物セットを選ぶ。一人目が「手合わせを始める」を押してから6秒以内に、仲間も同じ難度でボタンを押す。開始後の途中参加は締め切る。同じ接続を再開した場合は、試行と自身のHPを引き継ぐ。別の難度を選ぶと同じ合言葉の別戦闘になる。待ち時間はラボ用の設定値。

ソロと同じHPで三段階を進め、攻撃範囲とボスのHPは同じ難度にいる各画面で一致する。旅人と同行者が両方倒れた組はそのまま観戦する。有効打を当てた人には、観戦中もクリア時に各自の討伐記録、EXP、モラ、選んだセットの聖遺物が入る。全員が退出すると入口から再挑戦できる。初回追加分と自己記録は各自の難度別セーブで管理する。 [HTTPの検証](../evidence/coop-stygian-farka-http.json) · [幽境の採用方針](../sources/20261116-amendment.md)

Chromeの2画面で、共有された連撃の予告、三段階の戦闘、通常難度の討伐、別々のセットの受け取りと両者のセーブを確認した。 `python -X utf8 test_coop_stygian_farka.py` で初期セーブを作成し、ラボ起動中に `node test_coop_stygian_farka.mjs` を実行すると再現できる。 [Chromeの検証](../evidence/coop-stygian-farka-browser.json) · [連撃の予告](../evidence/coop-stygian-farka-warning.png) · [討伐画面](../evidence/coop-stygian-farka-clear.png)

## 幽境の隊長を共闘する

スネージナヤの雪の町から「凍天の演武場」へ。通常はLv144、ハードはLv159、マスターはLv176、極限はLv195から挑める。ファルカと同じように、最初の人が「手合わせを始める」を押してから6秒以内に仲間も同じ難度で始める。通常のHPは2,430、極限は5,400で人数にかかわらず固定。

攻撃開始時に隊長が最も近い操作キャラを狙い、予告が確定するまでそのキャラを追う。霜影疾走では確定後の移動で突進先を変えられず、先に着地点から離れて斬撃を避ける。凍氷斬波は床に沿って進み、当たったプレイヤーに一回ずつダメージが入る。終式では疾走・低い氷線・高い氷線・締めの扇を共有する。 [隊長の動き](stygian-motion-v1/CAPITANO.md)

HTTPでは、通常2人の突進先と個別被弾、氷線の一人一回の判定、終式の四つの命中窓、各自の報酬・依頼・保存、再戦と初回報酬の区別を確認した。極限は入場時のHPと、時間切れで報酬が付かず終了することを確認した。 [HTTPの検証](../evidence/coop-stygian-capitano-http.json)

Chromeの2画面でも同じ対象と攻撃予告が表示され、二人が三つの型を通って通常難度を討伐し、別々のセットと討伐記録を保存できた。 `python -X utf8 test_coop_stygian_capitano.py` で初期セーブを作成し、ラボ起動中に `node test_coop_stygian_farka.mjs --capitano` を実行すると再現できる。 [Chromeの検証](../evidence/coop-stygian-capitano-browser.json) · [剣技の予告](../evidence/coop-stygian-capitano-warning.png)

## 幽境のシュバランケを共闘する

ナタの谷の集落から「烈日の手合わせ場」に入り、同じ部屋と難度で手合わせを始める。通常はLv112、ハードはLv138、マスターはLv163、極限はLv188。通常のHPは1,780で固定。ファルカ・隊長と同じ6秒の受付を使う。

灼光弾の火球と墜陽拳の着地点を共有する。烈日激突では左右の火帯の間に中央の安全地帯があり、最後の太陽拳には二度目の狙いの確定がある。各攻撃は範囲内のプレイヤーに個別に当たり、烈日連携はつなぎの一撃に移る時に対象を選び直す。 [シュバランケの動き](stygian-motion-v1/XBALANQUE.md)

HTTPでは同じ火球3発が各人に一回ずつ当たること、着地点の固定、中央での回避、太陽拳が確定後に向きを変えないことを確認した。通常難度の討伐・再戦と、聖遺物セット、依頼、クリア記録の個別保存も確認した。 [HTTPの検証](../evidence/coop-stygian-xbalanque-http.json)

Chromeの2画面で中央の安全地帯へ二人で退避し、最後の太陽拳のあとに通常難度を討伐した。それぞれ選んだセットと討伐記録を保存できた。 `python -X utf8 test_coop_stygian_xbalanque.py` で初期セーブを作成し、ラボ起動中に `node test_coop_stygian_farka.mjs --xbalanque` を実行すると再現できる。 [中央への退避](../evidence/coop-stygian-xbalanque-safe-lane.png) · [Chromeの検証](../evidence/coop-stygian-xbalanque-browser.json)

## 幽境の北斗を共闘する

璃月・港の広場から「南十字の試合甲板」に入り、同じ難度で始める。通常はLv30・HP690。ハードはLv58・HP1,250。構えが終わるまで全員が手を止めると、一閃の後に長めの反撃時間が開く。打ち込む場合は、構えが始まってからの最初の有効な手動攻撃が反撃の狙いを決める。ハード以上では、誘い返しの予告で決まった着地点へ低い返し波が来る。 [試合のルールと難度](stygian-motion-v1/BEIDOU_WEB.md)

HTTPの2人試験で、構えの前の入力と同行AIの攻撃が反撃を誘わないこと、攻撃した人が再接続しても狙いが動かないこと、二人への独立した命中とジャンプでの回避を確認。通常は待った後に2.9秒、ハードでは誘い返しの後に約1.4秒の反撃時間があった。初回報酬は通常が16,503 EXP・1,210モラ、ハードが166,428 EXP・2,270モラ。各自の聖遺物セット、受注者の依頼と討伐記録の保存を確認した。 [HTTPの検証](../evidence/coop-stygian-beidou-http.json)

Chromeの2画面でLv58のハードをプレイした。ゲストが誘い返しを起こし、同じ予告と返し波を二人で見て、反撃して各自の勝利を保存した。 `python -X utf8 test_coop_stygian_beidou.py` で試験用のセーブを用意し、ラボ起動中に `node test_coop_stygian_farka.mjs --beidou` で再現できる。 [誘い返しの予告](../evidence/coop-stygian-beidou-warning.png) [返し波](../evidence/coop-stygian-beidou-wake.png) [Chromeの検証](../evidence/coop-stygian-beidou-browser.json)

## 幽境のロノヴァを共闘する

スネージナヤ・雪の町の広場から「最後の審問」に入り、同じ難度を選んで6秒の合流時間内に開始する。通常はLv164。ボスHPは人数にかかわらず5,460。各プレイヤーの旅人と同行者は、命100と5回分の復活の灯を持つ。 **H** で自分の同行者を救助できる。 [難度と試練](stygian-motion-v1/RONOVA_WEB.md)

裁定の予告線と「死の帳」の安全帯は共通。影には各自で触れ、最終裁定では自分の門に入る。「冥路の門」では通過印を各自で踏む。全員が倒れて復帰の予約がある間はボスと戦闘時計を止め、予約したペアの復帰だけが進む。生存ペアがいる間は戦闘が続く。

HTTPの2人試験で、波による命18の減少と回収、個別の裁定と安全門、5回目までの復帰、再接続時の残り灯、他のペアの同行者を救助できないこと、全員が倒れたときの時計停止、討伐と全滅が同時に起きた場合の勝利優先を確認した。通常初回では選んだ聖遺物と14,558,781 EXP・54,300モラをそれぞれ受け取り、受注した人の依頼が進んだ。 [HTTPの検証](../evidence/coop-stygian-ronova-http.json)

Chromeの2画面では試験用のLv200セーブを使い、同じ裁定の予告線から互いに別の安全門へ入り、灯を使わずに通常難度の四段階を突破した。二人分の討伐と保存を確認。 `python -X utf8 test_coop_stygian_ronova.py` で初期セーブを用意し、ラボ起動中に `node test_coop_stygian_ronova.mjs` で再現できる。 [左の門](../evidence/coop-stygian-ronova-gate-1.png) [右の門](../evidence/coop-stygian-ronova-gate-2.png) [Chromeの検証](../evidence/coop-stygian-ronova-browser.json)

## 幽境のレリルを共闘する

ナド・クライの町から「霧と月の狩場」へ入り、同じ難度で始める。通常はLv124。レリルのHPは第一幕2,180、第二幕2,470で人数にかかわらず固定。霧で赤い輪郭が出たときに **H** で灯を掲げる。結界は部屋で共有し、同じ襲撃で二人が灯を使っても一段だけ減る。第一幕のHPが0になると幕間を経て第二幕に進む。

回収試練の光は一人につき三つ。配置と落下予告は共通で、同じ場所の光を各自が一回ずつ拾える。三つ集めた人は最後の衝撃を防ぐ。第二試練で一人以上が成功すると全員に4秒の反撃時間が開き、全員失敗の場合は1.6秒になる。 [レリルの設計](stygian-motion-v1/RERIR.md)

有効打のほか、灯で結界を一段解除した人と、第二試練で長い反撃時間を開いた人も報酬対象になる。HTTPの2人試験で、灯の重複防止、幕間で報酬が出ないこと、各人の光と防御、反撃時間の二分岐、支援者への報酬、再戦と保存を確認した。 [HTTPの検証](../evidence/coop-stygian-rerir-http.json)

Chromeの2画面では、灯を交互に使って結界を解除し、第一試練と第二試練を別々の人が成功させた。通常の討伐後は二人とも各自の報酬と記録を保存できた。 `python -X utf8 test_coop_stygian_rerir.py` で初期セーブを作成し、ラボ起動中に `node test_coop_stygian_farka.mjs --rerir` を実行すると再現できる。 [霧と灯](../evidence/coop-stygian-rerir-fog.png) · [第二試練](../evidence/coop-stygian-rerir-trial.png) · [Chromeの検証](../evidence/coop-stygian-rerir-browser.json)

## 霜紋の岩兎と苔衣の踏石獣

霜紋の岩兎は峰下の観測小屋から霜紋の稜線へ進む。苔衣の踏石獣は谷を望む茶亭から段丘の岩陰へ進む。各自がLv60またはLv95に達すると、それぞれの狩場に入れる。部屋は小屋・茶亭と戦闘地点のどちらでも作成できる。 [観測小屋までの道](balance/DRAGONSPINE_OBSERVATION_WEB.md) · [茶亭までの道](balance/CHENYU_TEA_ROUTE_WEB.md)

岩兎の攻撃範囲と踏石獣の岩脈を部屋で共有する。岩兎の薙ぎ払いは高い棚に乗って避けられる。踏石獣の岩脈は途中の岩で止まる。同じ攻撃を受けた直後にソロから部屋を作っても、その攻撃のダメージは追加されない。有効打と距離の条件を満たした参加者に討伐報酬が入り、受注した人はそのあと現地調査と報告を進められる。 [4人の判定と依頼の保存](../evidence/coop-original-field-bosses-lua.json)

Chromeの2画面で、小屋や茶亭から入り、通常攻撃で岩兎と踏石獣をいずれも約25秒で討伐した。参加者それぞれに岩兎は380モラ、踏石獣は472モラが入った。依頼を受けた側は、討伐後に観測板への展示や茶席の調査を終え、報告してからセーブを読み直した。 [Chromeの結果](../evidence/coop-original-field-bosses-browser.json) · [岩兎の共闘画面](../evidence/coop-original-field-bosses-original-rime-hare.png) · [踏石獣の共闘画面](../evidence/coop-original-field-bosses-original-tea-boulder.png)

## 鉱殻除雪機と稜風の帆塔機

鉱殻除雪機はLv142で、積替場から蒸気留置庫に入る。部屋に入ったあとも、各自が「止まらない除雪機」を受け、積替場の信号箱を操作してから門を通る。稜風の帆塔機はLv175で、旗の渡り廊下から潮風の機関室に入る。 [連絡鉄道の道順](field-boss-v1/SNOW_RAIL_WEB.md) · [港から機関室までの道順](balance/WINDWARD_ROUTE_WEB.md)

除雪機が突進すると本体と命中範囲が一緒に動く。床に広がる蒸気は跳び越えられる。帆塔機の横風はジャンプ、縦風は左右へ移動して避けられる。冷却や排気口の開放は同じタイミングで全員に見える。4人のLua試験では、二人が攻撃して倒し、討伐報酬はその二人に入った。除雪機は各1,298,650 EXPと425モラ、帆塔機は各6,514,150 EXPと960モラだった。 [攻撃と報酬の検証](../evidence/coop-original-field-bosses-lua.json)

Chromeの2画面で、それぞれの門から入場し、討伐後に圧力計と通行確認の標識を調べて報告した。両者とも討伐記録を保存し、拠点から再開できた。 [Chromeの結果](../evidence/coop-original-field-bosses-browser.json) · [留置庫の戦闘画面](../evidence/coop-original-field-bosses-original-snow-sweeper.png) · [機関室の戦闘画面](../evidence/coop-original-field-bosses-original-windward-tower.png)

## 月殻の大ヤドカニ

ナド・クライの町か月渡りの岩窟口で部屋を作る。Lv120で各自が「宝箱には、脚がある！」を受け、岩窟口で引きずり跡を調べると、広間で合流できる。HPは228で共通。箱の落下位置と殻割れ、床を進む反射光は全員に同じように見える。 [岩窟口までの道順](balance/NOD_MOON_VAULT_WEB.md)

討伐に貢献した参加者は各464,100 EXPと730モラを受け取る。第3話の初回勝利と貯蔵所の宝箱も各自の依頼で進む。報告前に貯蔵所から広間を通るときは、部屋に所属したまま本人の討伐済みの状態で通れる。報告後は広間の共有戦闘へ戻れる。 [LuaとHTTPの検証](../evidence/coop-moon-crab-lua-http.json) · [Chromeの2画面](../evidence/coop-moon-crab-browser.json) · [殻割れ後の画面](../evidence/coop-moon-crab-cracked.png)

## 風礫の割輪機と潮鐘の門像

風礫の割輪機はLv130の風礫の記録庫で戦う。入口拠点か風よけ所で部屋を作り、各自が発掘通路の精鋭を退けてから記録庫へ入る。潮鐘の門像はLv160の潮鐘の記録室。入口拠点か観賞路から合流し、各自が依頼を受けて記録室に入る。 [トゥニギの道順](balance/TUNIGI_EXCAVATION_WEB.md) · [往日の海の道順](balance/BYGONE_RESONANCE_WEB.md)

HP、攻撃範囲、反撃時間を共有する。討伐に貢献した人は依頼が進み、割輪機ではその人の往路が崩れる。右奥で記録片を拾って退路から帰る。門像では上段の記録を取り、右の門から観賞路へ戻る。EXP・モラ・強化鉱石は各自の初回報告で受け取る。 [LuaとHTTPの検証](../evidence/coop-ruin-guardians-lua-http.json) · [Chromeの検証](../evidence/coop-ruin-guardians-browser.json) · [割輪機の画面](../evidence/coop-ruin-guardians-original-wind-ring.png) · [門像の画面](../evidence/coop-ruin-guardians-original-bellgate.png)

## 枝傘の大キノコンとグラン・フィナーレ

大キノコンはLv60の枝傘の止まり台で戦う。樹陰の広場や樹冠の中継所から部屋に入り、大枝の敵は各自で退ける。止まり台では胞子の左右の時間差と反撃時間を共有し、討伐に貢献した人は見晴らしから観測所へ進める。 [スメールの観測所までの道順](balance/SUMERU_CANOPY_WEB.md) · [止まり台の共闘画面](../evidence/coop-chapter-guardians-original-canopy-fungus.png)

グラン・フィナーレはLv80の主舞台で戦う。水辺の広場や監視所から部屋に入り、作業員の退避、波板か床板の選択、作業メカの討伐を各自で済ませる。主舞台では本体と荷台の当たり判定を共有する。外装を止めた後は、各自の停止盤と合図灯で公演を再開する。 [フォンテーヌの主舞台までの道順](balance/FONTAINE_GRAND_FINALE_WEB.md) · [主舞台の共闘画面](../evidence/coop-chapter-guardians-original-grand-finale.png)

討伐記録と報酬は各自の冒険に残る。主舞台では外装を初めて止めた人に章のEXPが入り、報告後は公演を見に戻れる。 [Lua・HTTPの確認](../evidence/coop-chapter-guardians-lua-http.json) · [Chromeの検証](../evidence/coop-chapter-guardians-browser.json)

`python -X utf8 test_coop_ruin_guardians.py chapters` でソロ・共闘のLua試験とHTTP試験を再実行できる。続けて、ラボを起動した状態で `node test_coop_ruin_guardians.mjs chapters` を実行すると、Chromeの2画面で入場から報告・保存まで確認できる。

## 夕映えの水走者

Lv100のナタ第3話「夕映えの一番勝負！」で共闘できる。谷の集落・控え広場・水路の見張り台から部屋に入り、受付と水路の点検を各自で済ませる。会場では勝負ゲージ124、往復突進、二つの水柱の位置と発生順を共有する。水柱の予告が出たら、参加者が動いても印は移動しない。 [会場までの道順](balance/NATLAN_SUNSET_DUEL_WEB.md) · [水柱の予告](../evidence/coop-sunset-duel-splash.png)

勝負に貢献した人は初回のEXPを受け取り、各自で記録台へ行って報告する。報告後、同じ部屋の仲間と合図台を操作すると練習にも参加できる。練習を終えてもEXP・モラ・勝利記録は増えない。 [Lua・HTTPの検証](../evidence/coop-sunset-duel-lua-http.json) · [Chromeの検証](../evidence/coop-sunset-duel-browser.json)

`python -X utf8 test_coop_sunset_duel.py` でソロ、Lua共闘、HTTPを検証できる。ラボ起動中に `node test_coop_sunset_duel.mjs` を実行するとChromeの2画面で練習まで確認できる。

## 霜鎧の大角獣と礫脈の選鉱炉

霜鎧の大角獣はLv156の白虹の高原で戦う。雪原の終着駅で各自が「終着駅の、その先へ！」を受け、雪棚の道から入る。角薙ぎと前脚叩きの範囲、短突進に沿って移動する当たり判定、胸の継ぎ目が開く時間を共有する。討伐に貢献した人は、初回の章EXPを受け取ってから高原の奥で白虹を観測できる。 [白虹峠の道順](balance/WHITE_PASS_PROGRESSION_WEB.md) · [高原の共闘画面](../evidence/coop-highland-bosses-original-frost-antler.png)

礫脈の選鉱炉はLv185の焚き口の選鉱室で戦う。オシカ・ナタの寄港地から進み、三本の排熱流の位置・順番と回転輪が開く時間を共有する。受注前でも入場して討伐報酬を受け取れる。「出航前の、もうひと仕事」を受けている人は討伐後に奥で寸法を測り、寄港地で報告できる。 [寄港地までの道順](balance/CAP_AND_STOPOVER_WEB.md) · [選鉱室の共闘画面](../evidence/coop-highland-bosses-original-rubble-sifter.png)

`python -X utf8 test_coop_highland_bosses.py` でLuaとHTTPを検証できる。続けてラボを起動し、`node test_coop_original_field_bosses.mjs highland` を実行すると、Chromeの2画面で入場から報告・保存まで検証できる。 [Lua・HTTPの結果](../evidence/coop-highland-bosses-lua-http.json) · [Chromeの結果](../evidence/coop-highland-bosses-browser.json)

## 玻璃根の歩行晶と氷継ぎの岩這い

玻璃根の歩行晶はLv195の庭の外周で戦う。ナド・クライの町や庭の入口拠点から部屋に入れる。反射板と記録箱の作業は各自で済ませる。戦闘ではHP1020と反射像の位置を共有する。足元に線が一本ある本体に攻撃が当たり、反射像が消えると反撃しやすくなる。討伐後は各自で高台を調べ、右端の門から町へ直接戻る。 [庭の道順](balance/MOONLIT_GARDEN_WEB.md) · [歩行晶の共闘画面](../evidence/coop-late-branch-bosses-original-prism-walker.png)

氷継ぎの岩這いはLv200の氷殻の最深室で戦う。入口拠点で部屋に入り、吹き溜まりの連絡坑の見張りを各自で3体倒してから最深室で合流する。HP1060、予告した位置に出る氷柱、障壁50が外れる反撃時間を共有する。討伐後は高台で帰路を確認して、右端の門から拠点へ直接戻る。 [遠征の道順](balance/NOVOKICHEV_EXPEDITION_WEB.md) · [岩這いの共闘画面](../evidence/coop-late-branch-bosses-original-ice-crawler.png)

`python -X utf8 test_coop_late_branch_bosses.py` でソロ・共闘のLua試験とHTTP試験を再実行できる。ラボを起動し、`node test_coop_original_field_bosses.mjs late-branch` を実行すると、Chromeの2画面で合流、討伐、個別報告、保存からの再開まで確認できる。 [Lua・HTTPの結果](../evidence/coop-late-branch-bosses-lua-http.json) · [Chromeの結果](../evidence/coop-late-branch-bosses-browser.json)

## 灯断ちの盤尾獣

淵下宮の入口拠点か道順記録の小間で部屋に入る。照り影の灯室では部屋に所属したまま、各自で消灯して石棚を渡る。短縮路を開いた人は入口拠点から小間へ直接進める。Lv110の石版裏の窪みで盤尾獣のHP1035と攻撃を共有する。突進は左右の岩で止まり、止まった場合は反撃時間が47刻み延びる。 [淵下宮の道順](balance/ENKANOMIYA_LAMP_ROUTE_WEB.md) · [岩陰での攻防](../evidence/coop-plate-tail-charge.png)

討伐に貢献した人は各309,900 EXPと580モラを受け取る。「表紙のない探検記」を受けた人は窪みの記録箱を調べ、そのあと小間で表紙と帰り道を追記して報告する。 [LuaとHTTPの検証](../evidence/coop-plate-tail-lua-http.json) · [共闘画面](../evidence/coop-plate-tail-original-plate-tail.png) · [Chromeの検証](../evidence/coop-plate-tail-browser.json)

`python -X utf8 test_coop_plate_tail.py` でLuaとHTTPを検証できる。ラボを起動し、`node test_coop_original_field_bosses.mjs plate-tail` を実行すると、Chromeの2画面で岩陰の回避、討伐、各自の報告、読み込み後の探検記の閲覧まで確認できる。

## 波のジャプー、バラチコ、コシーホ

波のジャプーの演奏場はLv112。仲間や同行者が近づいても演奏を続け、通常攻撃などが当たると部屋全体で戦闘が始まる。床を進む波はジャンプで、二つの水柱は左右の範囲から出て避ける。 [演奏場への道順](NATLAN_FIRST_LEGENDS_WEB.md) · [共闘画面](../evidence/coop-natlan-entry-legends-sappho-warning.png)

バラチコはLv120の格子奥の岩室で戦う。鍵の洞窟では仲間と一緒に歩ける。鍵2本の入手と格子の開錠は各自で行う。岩室では移動する炎刃と、順番に出る三つの斬撃を共有する。 [洞窟の道順](NATLAN_TOYAC_LEGENDS_WEB.md#二つの鍵の洞窟) · [共闘画面](../evidence/coop-natlan-entry-legends-balachko-warning.png)

コシーホはLv116の石広場で合流する。岸辺では部屋に残ったまま、各自が炎元素で水晶を3個砕く。広場では甲羅のころがり、落雷、続いて出る低い電撃の輪を共有する。 [岸辺の道順](NATLAN_TOYAC_LEGENDS_WEB.md#電気水晶の岸辺) · [共闘画面](../evidence/coop-natlan-entry-legends-cocijo-warning.png)

攻撃の範囲や時間はラボの試作値。全員が戦闘地点を離れると途中のHPを保持し、討伐後は全員が退出すると再戦できる。有効打を当てた人の討伐報酬と、各自が済ませた入口の依頼は別々に保存される。 [Lua・HTTPの結果](../evidence/coop-natlan-entry-legends-lua-http.json) · [Chromeの結果](../evidence/coop-natlan-entry-legends-browser.json)

`python -X utf8 test_coop_natlan_entry_legends.py` でソロ・共闘のLuaとHTTPを、ラボ起動中の `node test_coop_branch_legends.mjs --natlan-entry` でChromeの2画面を検証できる。

## アンデッドとシェマリの陰

先人の神殿の東の池からLv118のアンデッド、北西の崖下からLv116のシェマリの陰へ進める。部屋に入ったあと、各自で黒曜石の柱に触れる。移送が終わった人から試練に入れる。アンデッドは低い頭突きと二度の地踏み、シェマリの陰は床を進む水刃と高い噴き上げを共有する。攻撃範囲と時間はラボの試作値。 [黒曜石の柱までの道順](NATLAN_NIGHT_TRIALS_WEB.md) · [アンデッドの予告](../evidence/coop-natlan-night-trials-undead-warning.png) · [シェマリの陰の予告](../evidence/coop-natlan-night-trials-chimalli-warning.png)

旅人と同行者がともに倒れた人は元の柱に戻る。仲間が試練に残っていれば戦闘は続き、最後の一組も倒れると初期状態からやり直せる。出口を使って全員が退避した場合は途中のHPを保持する。討伐後に全員が退出すると再戦でき、各自が受け取った討伐報酬と記録はセーブに残る。 [Lua・HTTPの検証](../evidence/coop-natlan-night-trials-lua-http.json) · [Chromeの検証](../evidence/coop-natlan-night-trials-browser.json)

`python -X utf8 test_coop_natlan_night_trials.py` でソロ・共闘のLuaとHTTPを、ラボ起動中の `node test_coop_branch_legends.mjs --natlan-night` でChromeの2画面を検証できる。

## トゥラカルワスクアウィトゥルとイチカウイピリの庇護

Lv112のトゥラカルワスクアウィトゥルへは、岩の窪地から昇降機で地下に降りる。共鳴晶岩は各自で△、○、◇の順に灯し、自分の岩戸を開けてから洞窟の柱に触れる。試練では、地面を走る削岩刃と、高さの異なる二つの隆起を共有する。 [共鳴晶岩の道順](NATLAN_NORTH_TRIALS_WEB.md#共鳴晶岩の順番) · [共闘画面](../evidence/coop-natlan-north-trials-tlatzacuilotl-warning.png)

Lv118のイチカウイピリの庇護へは、北端の尾根から大岩の川辺に入る。三つの光は各自が枝道の奥で放し、川辺まで連れて戻る。自分の封印が解けたら柱を通って合流する。試練では左右に時間差で出る根柱と、葉の低い波を共有する。 [三つの光の道順](NATLAN_NORTH_TRIALS_WEB.md#大岩に帰る三つの光) · [共闘画面](../evidence/coop-natlan-north-trials-ichcahuipilli-warning.png)

攻撃範囲と時間はラボの試作値。全員の敗北時には初期化し、通常の退出時には残りHPを保持する。討伐記録を保存でき、入口の依頼はナタ拠点で各自が報告する。 [Lua・HTTPの検証](../evidence/coop-natlan-north-trials-lua-http.json) · [Chromeの検証](../evidence/coop-natlan-north-trials-browser.json)

`python -X utf8 test_coop_natlan_north_trials.py` でソロ・共闘のLuaとHTTPを、ラボ起動中の `node test_coop_branch_legends.mjs --natlan-north` でChromeの2画面を検証できる。

## アトラトの祝福と神骨の蛇姫

Lv114のアトラトの祝福へは、東の谷へ入る坂の上段から滝裏へ進み、壁を伝って足場の柱まで行く。共闘中も各プレイヤーは旅人を操作する。柱へ戻ると、同行者のHPと元の操作キャラが戻る。岩扇の波と金紋の落石は位置と順番を共有する。「壁に刻まれた道しるべ」の調査と報告は各自で行う。 [滝裏までの道順](NATLAN_CLIFF_TRIALS_WEB.md#アトラトの祝福) · [共闘画面](../evidence/coop-natlan-cliff-trials-atlatl-warning.png)

Lv118の神骨の蛇姫へは、神像の先の高台を下から一段ずつ登る。最上段の右端の柱で試練に入る。試練から戻ると同じ高さに着く。二人編成で参加でき、跳び込みと葉弾の三連射を共有する。 [高台の道順](NATLAN_CLIFF_TRIALS_WEB.md#神骨の蛇姫) · [共闘画面](../evidence/coop-natlan-cliff-trials-cihuacoatl-warning.png)

攻撃範囲、時間、ダメージはラボの試作値。全員が敗北すると試練が初期化し、全員が通常の出口から退避した場合は残りHPを保持する。 [Lua・HTTPの結果](../evidence/coop-natlan-cliff-trials-lua-http.json) · [Chromeの結果](../evidence/coop-natlan-cliff-trials-browser.json)

`python -X utf8 test_coop_natlan_cliff_trials.py` でソロ、共闘のLuaとHTTPを検証できる。ラボ起動中の `node test_coop_branch_legends.mjs --natlan-cliff` でChromeの2画面を検証できる。

## リライ、墜落せし晨星の霊、鉄髭

3戦ともLv120。リライの広場と晨星の霊の柱は、西の石段の上段から入る崖道で分かれる。リライは攻撃が当たるまで中立で、戦闘が始まると低い氷砲と二つの氷弾を共有する。晨星の霊は上段の柱に各自で触れて入場し、霜羽の滑空、落星と氷の余波を共有する。同じ部屋の仲間が広場と試練に分かれた場合、戦闘と討伐報酬は各地点で進む。 [崖道までの道順](NATLAN_NORTHWEST_LEGENDS_WEB.md) · [リライの共闘画面](../evidence/coop-natlan-northwest-legends-rilai-warning.png) · [晨星の霊の共闘画面](../evidence/coop-natlan-northwest-legends-fallen-dawnstar-warning.png)

鉄髭は花翼の集付近の港から鍛冶場跡の崖へ向かい、上段の柱を通って合流する。走る火花と三度の炉打ちの範囲・順番を共有する。晨星の霊と鉄髭は、試練を出ると元の高さの柱に戻る。攻撃範囲、時間、ダメージはラボの試作値。「崖道の道しるべ」は各自が調査し、ナタ拠点で報告する。 [鉄髭の共闘画面](../evidence/coop-natlan-northwest-legends-ironbeard-warning.png) · [Lua・HTTPの検証](../evidence/coop-natlan-northwest-legends-lua-http.json) · [Chromeの検証](../evidence/coop-natlan-northwest-legends-browser.json)

`python -X utf8 test_coop_natlan_northwest_legends.py` でソロ・共闘のLuaとHTTPを、ラボ起動中の `node test_coop_branch_legends.mjs --natlan-northwest` でChromeの2画面を検証できる。

## ポタポの応援とトゥパヨの協力

ポタポはLv118で滝つぼの柱から、トゥパヨはLv120で海崖の上段の柱から入る。クァワカン断崖周辺からナタのフィールドと港を経由すれば、同じ部屋のまま二つの入口を行き来できる。「滝つぼと海崖の柱」を受けた人は、二つの道しるべを滝つぼから順に各自で調べ、ナタ拠点で報告する。 [柱までの道順](NATLAN_WAYOB_DUO_WEB.md)

ポタポは氷の波と三段の氷柱、トゥパヨは滑り込みと二つの火柱を使う。攻撃はラボの試作で、予告と当たり判定を共有する。敗北した組は元の柱へ戻り、仲間が残っていれば戦闘は続く。全員が出口から退避した場合はHPを保持し、全組が敗北した場合は初期化する。

Chromeの2画面で、同じ部屋のまま両方の柱を個別に通り、予告の範囲と順番、討伐、各自の報酬、元の高さへの帰還と再戦を確認した。二つの道しるべは各自が調べ、両戦の討伐記録と依頼報告を保存してナタ拠点から再開できた。 [Chromeの検証](../evidence/coop-natlan-wayob-duo-browser.json) · [三段の氷柱](../evidence/coop-natlan-wayob-duo-potapo-warning.png) · [二つの火柱](../evidence/coop-natlan-wayob-duo-tupayo-warning.png)

`python -X utf8 test_coop_natlan_wayob_duo.py` でLua4人とHTTP2人を、ラボ起動中の `node test_coop_branch_legends.mjs --natlan-wayob` でChromeの2画面を検証できる。 [Lua・HTTPの検証](../evidence/coop-natlan-wayob-duo-lua-http.json)

## レジとトゥプの繁栄

断崖南の道からアトクパンの北の道、北東の細道を経由して東の外輪の棚へ進む。レジの柱は遺跡の山裾。トゥプの柱は岬の上段にあり、崩れ谷から徒歩で来た仲間と小島から小舟で来た仲間が、同じ部屋のまま岬で合流する。両方ともLv120で入場できる。「山裾と岬の道標」は山裾と岬で各自が調べ、ナタ拠点で報告する。 [入口と足場](NATLAN_ATOCPAN_TOTEM_WEB.md)

レジは低空と二方向の雷弾、トゥプは本体が動く雷冠の滑走と、時間差で咲く三つの雷花を使う。いずれもラボの試作攻撃。敗北した組だけ元の柱に戻る。全員が出口から退避した場合はHPを保持し、全組が敗北した場合は初期化する。 `python -X utf8 test_coop_natlan_atocpan_totem.py` でLua4人・HTTP2人の検証を再現できる。 [Lua・HTTPの検証](../evidence/coop-natlan-atocpan-totem-lua-http.json)

Chromeの2画面で、山裾から徒歩と小舟に分かれて岬で合流し、両方の試練の予告、討伐、元の柱への帰還、再戦を確認した。各自の討伐記録と依頼報告を保存し、ナタ拠点から再開できた。ラボ起動中の `node test_coop_branch_legends.mjs --natlan-atocpan` で再現できる。 [Chromeの検証](../evidence/coop-natlan-atocpan-totem-browser.json) · [岬への小舟](../evidence/coop-natlan-atocpan-totem-tupu-ferry.png) · [レジの雷弾](../evidence/coop-natlan-atocpan-totem-reji-warning.png) · [トゥプの雷花](../evidence/coop-natlan-atocpan-totem-tupu-warning.png)

## ピークと最後のテノチズトク人

ピークはアトクパンの火山東の神像から北西の崖先を経由し、岩道の二段の足場を登って岩洞へ入る。最後のテノチズトク人は花翼の集付近の港から連絡舟でのびのびリゾートへ渡り、西島の桟橋の左の棚から浅瀬に入る。どちらもLv120。各自が「岩洞と秘境脇の道標」を受け、岩道の上段と火山南の草地で調べてナタ拠点に報告する。草地へは南岸の崖道と征討入口のどちらからも部屋を維持して入れる。 [入口と足場](NATLAN_FINAL_FIELD_LEGENDS_WEB.md)

ピークは熱を帯びた突進と二連の火礫、最後のテノチズトク人は床を走る引き波と三つの水柱を使う。攻撃と数値はラボ用の試作。戦闘中に全員が退避するとHPを保持する。討伐後は、全員が退出すると再戦できる。 `python -X utf8 test_coop_natlan_final_legends.py` でLua4人とHTTP2人の検証を再現できる。 [Lua・HTTPの検証](../evidence/coop-natlan-final-legends-lua-http.json)

Chromeの2画面で、岩洞への足場、草地への二つの入口、港の連絡舟と西島の桟橋を同じ部屋で通った。両戦の予告、討伐報酬、元の高さへの帰還と再戦、各自の報告と保存再開を確認した。ラボ起動中の `node test_coop_branch_legends.mjs --natlan-final` で再現できる。 [Chromeの検証](../evidence/coop-natlan-final-legends-browser.json) · [ピークの火礫](../evidence/coop-natlan-final-legends-peak-warning.png) · [浅瀬の水柱](../evidence/coop-natlan-final-legends-last-tenochtzitoc-warning.png)

## 微末と銅の錠

古の聖山へは火山の入口台から昇降機で入る。同じ部屋のまま中央の浮き台を経由し、東島の石棚から西の石広場でLv130の微末に挑める。微末は火芯から走る熱波と左右の噴火を使う。 [古の聖山の入口と足場](NATLAN_HIGHLAND_LEGENDS_WEB.md)

銅の錠へはオシカ・ナタの寄港地から北東島の渡し舟に乗り、東の遠い岩礁から装置の岸へ進む。岸では合言葉を維持し、装置と光の道は各自の依頼で進む。装置を一つ壊した状態を保存し、読み込んで部屋に入り直すと残りの一つから続けられる。浮遊島の船着き石で合流し、Lv180で遺構へ進む。銅の錠は重装の突進と三段の装甲打ちを使う。両戦とも攻撃と数値はラボ用の試作。 [Lua・HTTPの検証](../evidence/coop-natlan-highland-legends-lua-http.json)

Chromeの2画面で、古の聖山までの昇降機、北東島の渡し舟、装置の個別破壊と光の道の往復、両戦の予告・報酬・再戦、各自の依頼報告と保存再開を確認した。 `python -X utf8 test_coop_natlan_highland_legends.py` でLua・HTTPを、ラボ起動中の `node test_coop_branch_legends.mjs --natlan-highland` でChromeを検証できる。 [Chromeの検証](../evidence/coop-natlan-highland-legends-browser.json) · [古の聖山での共闘](../evidence/coop-natlan-highland-legends-infinitesimal-warning.png) · [浮遊島への光の道](../evidence/coop-natlan-highland-legends-spiritway.png) · [銅の錠の装甲打ち](../evidence/coop-natlan-highland-legends-bronzelock-warning.png)

## シグルド、カニ皇帝、ラスコルニコフ

ナシャタウンで各自が依頼を受ける。Lv132のシグルドは、レンポ島の灯台下から墓道に入り、三つの供え物を置いて墓前へ。Lv136のカニ皇帝は、レンポ島から小舟でヒーシ島に渡り、地下庭で二つの鏡を各自が合わせて宮殿へ進む。同じ回廊にいる仲間どうしでも、鏡の向きと開いた足場は別々に進む。Lv140のラスコルニコフは、パハ島の中央施設の上層で搬送札と操作盤を調べ、最上層への昇降機で合流する。 [入口と依頼](NOD_FIRST_FIELD_LEGENDS_WEB.md)

シグルドは踏み込みと返しの剣筋、カニ皇帝は殻から走る波とはさみ打ち、ラスコルニコフは床を走る火花と三段の噴射を使う。いずれもラボ用の試作攻撃。戦場を離れる昇降機に乗った人は、移動中の戦闘判定から外れる。倒す前に全員が退避するとHPを保持し、討伐後は全員が退出すると再戦できる。

LuaとHTTPで、入口のLvと依頼の個別判定、鏡の向きの保存と復帰、昇降機での退避時のHP保持を確認した。 `python -X utf8 test_coop_nod_first_field_legends.py` で再現できる。 [Lua・HTTPの検証](../evidence/coop-nod-first-field-legends-lua-http.json)

Chromeの2画面では、各自が入口を開けて合流し、3戦の予告、討伐報酬、帰還位置、再戦を確認した。依頼もそれぞれ報告し、保存から報告済みで再開できた。ラボ起動中の `node test_coop_branch_legends.mjs --nod-first` で再現できる。 [Chromeの検証](../evidence/coop-nod-first-field-legends-browser.json) · [鏡で開いた足場](../evidence/coop-nod-first-field-legends-crab-tsar-bridge.png) · [最上層の三段噴射](../evidence/coop-nod-first-field-legends-raskolnikov-warning.png)

## 十六倍マンドラゴラ、ハイジェード、故郷を偲ぶ孤独の狼

パハ島の北の桟橋から連絡船で北部沿岸へ渡り、南の港の神像を経由して三つの狩場に行ける。十六倍マンドラゴラは崖下へ下りるとLv138で挑める。ハイジェードはLv138の半島のキャンプ。東岸の小桟橋と北東の岸のどちらから来ても、半島の見張り口で合流できる。孤独の狼はLv140で、湖東の尾根を二段登って広間へ入る。 [入口と足場](NOD_NORTH_FIELD_LEGENDS_WEB.md)

「北部三つの見回り」は各自が好きな順番で進める任意依頼。共闘中も各自が道しるべを調べ、南の港の神像で報告する。マンドラゴラは地を走る根と二つの噴き上げ、ハイジェードは踏み込みの突きと横薙ぎの返し、狼は氷牙の飛び込みと三連の霜爪を使う。いずれもラボの試作攻撃。 [Lua・HTTPの検証](../evidence/coop-nod-north-field-legends-lua-http.json)

Chromeの2画面で、片方は海岸から、もう片方は湖の尾根から見回りを始めた。半島の別々の入口から合流し、3戦の予告、各自の報酬、帰還、再戦と依頼報告後の保存再開を確認した。 `python -X utf8 test_coop_nod_north_field_legends.py` でLuaとHTTPを、ラボ起動中の `node test_coop_branch_legends.mjs --nod-north` でChromeを検証できる。 [Chromeの検証](../evidence/coop-nod-north-field-legends-browser.json) · [崖下のマンドラゴラ](../evidence/coop-nod-north-field-legends-mandragora-warning.png) · [半島のハイジェード](../evidence/coop-nod-north-field-legends-hiljetta-warning.png) · [湖東の孤独の狼](../evidence/coop-nod-north-field-legends-homesick-wolf-warning.png)

## チュリン、バンダースナッチ、フュリオサ

チュリンはLv152。凍った街道から霜の精の村の南へ進む。弟子とブラーギンの手合わせ中も同じ部屋に所属し、各自が二戦を終えて彫刻広場で合流する。先行二戦の勝利は保存に残り、チュリンの再戦で広場に戻っても相手は再出現しない。

バンダースナッチはLv156。石壁沿いの坂から地下道に入り、道標と上段の操作盤を各自が調べて氷扉を開ける。フュリオサは町南の地下道からならLv158で挑める。Lv159の都南の秘境周辺から入った仲間とも、雪の脇道で合流できる。三戦に二種類ずつラボ用の試作攻撃を追加した。 [入口と足場](SNEZ_FIRST_FIELD_LEGENDS_WEB.md)

`python -X utf8 test_coop_snez_first_field_legends.py` で各自の入場、討伐と再戦、報告の保存をLua4人・HTTP2人で検証できる。 [Lua・HTTPの検証](../evidence/coop-snez-first-field-legends-lua-http.json)

Chromeの2画面で、各自が手合わせと氷扉を終えて合流し、雪の脇道には別々の入口から入った。三戦の攻撃予告、報酬、帰還と再戦、二つの依頼の報告と保存再開を確認した。ラボ起動中の `node test_coop_branch_legends.mjs --snez-first` で再現できる。 [Chromeの検証](../evidence/coop-snez-first-field-legends-browser.json) · [チュリンの氷彫](../evidence/coop-snez-first-field-legends-churin-warning.png) · [バンダースナッチの前爪](../evidence/coop-snez-first-field-legends-bandersnatch-warning.png) · [フュリオサの矢の着弾](../evidence/coop-snez-first-field-legends-furiosa-warning.png)

## 古代種・カチカチネズミと災禍古樹

古代種はLv160。雪の町から北の海岸へ下りる坂を経て裂け目に入り、三匹を助けた人から氷の通路を通れる。裂け目と巣穴で保存すると雪の町から再開し、救出の途中経過は各自に残る。北の工区から同じ部屋のままノヴォキッチェヴへ進める。

災禍古樹はLv198。ノヴォキッチェヴの拠点から分岐駅下の昇降室を通って鉱区へ向かう。水位表を調べた人が水路へ進み、上段の水門を調べると支流の隠れ家で合流できる。鉱区の分岐から既存の獣衆の集積場へも、各自が北の街灯の依頼を進めて入れる。二戦に二種類ずつラボ用の試作攻撃を追加した。 [入口と足場](SNEZ_LATE_FIELD_LEGENDS_WEB.md)

`python -X utf8 test_coop_snez_late_field_legends.py` でLua4人・HTTP2人の検証を再現できる。 [Lua・HTTPの検証](../evidence/coop-snez-late-field-legends-lua-http.json)

Chromeの2画面では、救出の進行と水路の入口が個別に開いた。二人が同じ部屋で北の工区と昇降室を通り、二戦の予告、討伐報酬、帰還と再戦、各依頼の町での報告と保存再開を確認した。ラボ起動中の `node test_coop_branch_legends.mjs --snez-late` で再現できる。 [Chromeの検証](../evidence/coop-snez-late-field-legends-browser.json) · [古代種の二連の棘打ち](../evidence/coop-snez-late-field-legends-ancient-mouse-warning.png) · [災禍古樹の三段の結晶柱](../evidence/coop-snez-late-field-legends-calamitous-tree-warning.png)

## チャルデリックとマハーヴァスデーヴァヤプトラ太子

Lv175のチャルデリックへは、ドーンマンポートの拠点から湾の小舟を経由し、湖北の見張り道から炊事場に入る。事前依頼なしで入場できる。古の聖山から空の神殿への昇降機でも部屋を維持できる。Lv185の太子は、空の神殿の北の展望棚から昇降機で楼閣へ降り、各自が石碑と見取り図を調べてマーダヴァに話すと中庭で合流できる。 [入口と依頼](FINAL_FIELD_LEGENDS_WEB.md)

チャルデリックは石杖の地走りと二度の岩打ち、太子は砂礫を伴う踏み込みと三連砂柱を使う。どちらもラボの試作攻撃。LuaとHTTPでは、各自のLv条件、調査途中の保存と再参加、討伐と再戦、依頼報告の保存を検証した。 `python -X utf8 test_coop_dorn_sky_legends.py` で再現できる。 [Lua・HTTPの検証](../evidence/coop-dorn-sky-legends-lua-http.json)

Chromeの2画面では、小舟と楼閣の昇降機で同じ部屋を維持し、先に調査を済ませたプレイヤーだけが中庭に入れることを確認した。二人が合流した後は、両戦の予告、討伐、個別報酬、帰還、再戦、報告済みセーブからの復帰まで確認した。ラボ起動中の `node test_coop_branch_legends.mjs --dorn-sky` で再現できる。 [Chromeの検証](../evidence/coop-dorn-sky-legends-browser.json) · [チャルデリックの予告](../evidence/coop-dorn-sky-legends-churldric-warning.png) · [太子の予告](../evidence/coop-dorn-sky-legends-maha-warning.png)

## プリズムスライムとムーシュ＝テヒル

北部沿岸の東の波止場から船で円環島を経由し、霜月の入口拠点へ。同じ部屋のまま、拠点と赤い丘の南棚の通行標を各自で調べる。拠点で報告した人から南の水たまり（Lv188）と北西の装置の広間へ入れる。南の斜道から渡り台に戻ると岩棚に着く。 [道順と操作](FINAL_FIELD_LEGENDS_WEB.md)

北西の地下広間では、装置を調べてコマンダー2体の試験を一つずつ解く。第一・第二試験の敵と討伐記録は各自の進行に属し、試験中も合言葉は維持される。二つの試験の後でもう一度装置を調べると、最深室（Lv190）で合流できる。プリズムスライムの跳ね突きと左右の結晶、ムーシュ＝テヒルの潮波と三連水柱はラボ用の試作攻撃。

Luaの4人試験では、固定HP、攻撃予告、高さと距離での回避、貢献者への報酬を検証した。HTTPの2人試験では、第一試験を終えたセーブから拠点で再開し、同じ合言葉で広間へ戻れる。装置とLvの個別判定、両戦の再戦、報告と討伐の保存も確認した。 `python -X utf8 test_coop_frostmoon_legends.py` で再現できる。 [Lua・HTTPの検証](../evidence/coop-frostmoon-legends-lua-http.json)

Chromeの2画面で、円環島経由での合流、個別の通行報告、各人がコマンダー2体を倒す試験を確認した。両戦で予告、討伐、個別報酬、退出後の再戦を確認し、報告後のセーブから二人とも再開できた。ラボ起動中の `node test_coop_branch_legends.mjs --frostmoon` で再現できる。 [Chromeの検証](../evidence/coop-frostmoon-legends-browser.json) · [プリズムスライムの予告](../evidence/coop-frostmoon-legends-prism-warning.png) · [コマンダーの第一試験](../evidence/coop-frostmoon-legends-private-console-trial.png) · [ムーシュ＝テヒルの予告](../evidence/coop-frostmoon-legends-mushteshir-warning.png)

## 無相の風を共闘する

南の街道から「無相の風・挑戦入口」へ進み、右端のポータルから「モンド・風鳴りの広場」に入る。同じ部屋の仲間が広場に着くと共闘が始まる。

HPはソロと同じ870。挟み掌、落圧、二つの小旋風の予告と当たり判定を部屋で一つだけ進める。範囲内の旅人と同行者それぞれに当たり、範囲外の味方は回避できる。仲間が倒れて町に戻っても、広場に残るプレイヤーは戦闘を続けられる。

有効打と距離の条件を満たした参加者それぞれに、討伐EXP、125モラ、個人の討伐記録を付ける。Lv16の試験では1回900 EXP。受注済みの依頼は担当者に討伐を記録し、依頼報告時の1,500 EXPと300モラは一度受け取れる。戦闘中のHPと討伐後60秒の再出現は部屋で共有する。保存には自分の討伐記録、受注状況、自分で遭遇したボスの状態を記録する。共闘で報酬を受け取った場合は、自分の保存にも討伐と再出現待ちが残る。復帰時は部屋で現在進行中の世代に合流する。 [Lua・HTTPの検証](../evidence/coop-anemo-lua-http.json)

Chromeの2つのプロフィールで町から広場まで移動し、3種類の攻撃を避けながら通常攻撃と同行者で約24.5秒で討伐した。2組の与ダメージの合計は870。双方に討伐記録が付き、依頼が進んだのは受注した側だけだった。保存後に片方の画面を再読み込みし、同じ部屋と討伐後の状態に復帰した。試験用の初期セーブは `python test_anemo_field.py` で生成し、`node test_coop_anemo.mjs` でChromeの試走を再現できる。 [戦闘画面](../evidence/coop-anemo-browser.png) · [Chromeの検証](../evidence/coop-anemo-browser.json)

## 無相の雷を共闘する

Lv18で南の街道から無相の雷の挑戦入口へ進み、右端の門から雷紋の岩棚に入る。同じ部屋のまま、風鳴りの広場と行き来できる。無相の雷はソロ・2人・4人でHP900。三形の連撃、直進ドリル、二つの低い雷波を共有する。

Luaでは連撃の3段がそれぞれ1回ずつ当たり、ドリルに同時に当たった2人のうちシールドを使った側だけダメージが減った。雷波を2回跳び越えた側は無傷で、地上に残った側には18ダメージ。討伐に参加したLv18のプレイヤーごとに1,250 EXPと140モラを確認し、60秒後に同じHPで再出現した。

HTTPでは無相の風と雷を同じ部屋の別マップで同時に動かした。それぞれの攻撃はそのマップにいる人だけに当たり、無相の雷を倒した2人にだけ報酬が付いた。受注済みの依頼と個人の討伐記録も確認した。 [Lua・HTTPの検証](../evidence/coop-electro-lua-http.json)

Chromeの2画面で風と雷の広場に分かれ、同じ合言葉のまま雷紋の岩棚に合流して約25秒で討伐した。両方で討伐記録を保存し、依頼が進んだのは受注者だけだった。初期セーブは `python test_electro_field.py`、Chromeの試走は `node test_coop_electro.mjs` で再現できる。 [ドリルを跳び越えた画面](../evidence/coop-electro-browser.png) · [Chromeの検証](../evidence/coop-electro-browser.json)

## 無相の岩を共闘する

璃月港から璃月の狩場を経由して無相の岩の挑戦入口へ進む。Lv32で右端の門を通り、層石の円庭に入る。無相の岩のHPはソロと同じ980。岩槌、3つの石弾、単柱の震動を共有する。

柱の受付中に近づいて攻撃すると、その場の誰が当てても同じカウントが進む。1つの攻撃につき1回で、異なる攻撃が3回当たると全員の画面で柱が消え、核が2.5秒間静止する。柱を壊した時点では報酬が発生せず、討伐に参加したLv32の各プレイヤーに5,900 EXPと160モラが付く。再出現は60秒後。

石弾は、同じマップにいる仲間が置いた岩壁や珊瑚壁でも止められる。岩壁の耐久が足りない場合は、吸収した分だけ石弾のダメージが減る。Luaでは仲間の壁が見え、最初の石弾を止め、次の石弾が当たった人だけが被弾した。柱の受付は149刻みまで。150刻みに処理した攻撃でカウントが進まないことと、4人の個別時刻が異なる場合も同じ受付になることを確認した。 [Lua・HTTPの検証](../evidence/coop-geo-lua-http.json)

Chromeの2画面で璃月港から円庭へ進み、二人が交互に3回攻撃した。全カウントと柱が消える瞬間を両画面で確認し、柱破壊から約17秒で討伐した。両方で記録を保存し、依頼は受注した側だけ進んだ。初期セーブは `python test_geo_field.py`、Chromeの試走は `node test_coop_geo.mjs` で再現できる。 [柱がある画面](../evidence/coop-geo-pillar.png) · [核の露出](../evidence/coop-geo-exposed.png) · [Chromeの検証](../evidence/coop-geo-browser.json)

## 氷風組曲を共闘する

Lv90でフォンテーヌの水辺の広場から氷風の舞台入口へ進む。入口の左の門は「コッペリアの葬送」、右の門は「コペリウスの劫罰」。各演目では二体の当たり判定があり、HPはソロと同じ1,030を共有する。ひとつの攻撃が二体を巻き込んでも、共有HPへのダメージは1回分。

「コペリウスの劫罰」では、コペリウス本人に別々の攻撃を3回当てると氷装甲が解除される。その場の参加者全員の攻撃を数え、装甲がある間のダメージ軽減も共有する。倒したときにどちらか一体の近くにいて、参加条件を満たしたLv90の人に169,000 EXPと325モラが付く。二体は60秒後に同時に再出現する。

Luaでは二体の舞いで風・氷それぞれの攻撃範囲にいた人だけが被弾し、三人が1回ずつ当てた攻撃で装甲が解除された。HTTPでは4人が同じ部屋で二演目に2人ずつ分かれ、各演目のHP、個人報酬、依頼、討伐記録を確認した。 [Lua・HTTPの検証](../evidence/coop-icewind-lua-http.json)

Chromeの2画面で二演目の会場に分かれた後、同じ部屋のまま合流し、二演目を続けて討伐した。どちらも戦闘開始から約26秒で、両プレイヤーに演目ごとに1件ずつ計2件の記録を保存した。両画面で氷装甲の解除を確認した。初期セーブは `python test_icewind_field.py`、Chrome試走は `node test_coop_icewind.mjs` で再現できる。 [氷装甲がある画面](../evidence/coop-icewind-armor.png) · [装甲解除](../evidence/coop-icewind-armor-broken.png) · [コッペリアの葬送](../evidence/coop-icewind-coppelia.png) · [Chromeの検証](../evidence/coop-icewind-browser.json)

## 水形タルパを共闘する

Lv88でフォンテーヌの水路沿いから潮影の洞へ進む。本体のHPはソロと同じ1,030。半タルパは全員が見える位置に1体出現し、別のHP26を持って本体へ近づく。同じ半タルパへ仲間の攻撃を重ね、接触前に倒すと吸収を阻止できる。吸収すると本体のHPはそのままで、奔流の幅が2倍、判定内のダメージが20から28になる。

半タルパの撃破や吸収には報酬がなく、本体への有効打と撃破時の距離に応じて個人の討伐報酬が付く。Lv88の試験では148,300 EXPと315モラ。本体を倒すと残っていた半タルパも消え、60秒後に本体が再出現する。

Luaの4人戦では別々の参加者が攻撃を重ね、吸収が起きる処理刻みの攻撃でも阻止できた。HTTPでは二人が洞窟を出ている間に半タルパの位置とHPが保たれ、合流後の本体討伐で両画面から消えた。 [Lua・HTTPの検証](../evidence/coop-tulpa-lua-http.json)

Chromeの2画面で12と14のダメージを重ねて半タルパを倒し、両方に「合流を阻止・小さな奔流」が出た。二人のセーブに討伐記録が1件ずつ入り、依頼を受けていた人の討伐数が進んだ。 [半タルパの出現](../evidence/coop-tulpa-half.png) · [吸収の阻止](../evidence/coop-tulpa-interrupt.png) · [Chromeの検証](../evidence/coop-tulpa-browser.json)

## 複数体いる地方伝説を共闘する

| 地方伝説 | Lv | 会場 | 個体ごとのHP |
| --- | ---: | --- | --- |
| 異色三連星 | 120 | ウィッツトリの丘・三連星の野営場 | 氷銃490・雷槌500・炎銃350 |
| 「戦羊」と「鉄爪」 | 120 | 火山南・戦羊と鉄爪の広場 | 戦羊690・鉄爪570 |
| 荒くれの異怪の獣衆 | 200 | ノヴォキッチェヴ市街地・鉱荷の集積場 | スタヴローギン870・バルバラ740・ヴェルホヴェンスキー1,000 |

各個体は固有のHPを持ち、組のHP欄に残りの合計が出る。最後の1体を倒した時点で、直前12秒にいずれかの個体に有効打を入れ、会場でいずれかの個体の近くにいる参加者に一度ずつ報酬が入る。途中で全員が退くと進行は止まり、戻れば続きから試せる。討伐後は全員で出口を通り、同じ部屋のまま入り直すと全個体と再戦できる。

生きている個体が順番に攻撃する。予告中に攻撃役を倒すと、その攻撃は消えて次の個体に移る。以下はラボ用の試作攻撃。

| 地方伝説 | 個体ごとの攻撃 |
| --- | --- |
| 異色三連星 | 氷銃は低い冷気弾、雷槌は踏み込みと追い打ち、炎銃は二つの着弾。 |
| 「戦羊」と「鉄爪」 | 戦羊は角を下げて突進、鉄爪は飛び込みから爪払い。 |
| 荒くれの異怪の獣衆 | スタヴローギンは木筒から水弾、バルバラは脚刃の二連撃、ヴェルホヴェンスキーは採鉱具の三連打。 |

Luaの4人試験で8体の予告と命中、距離と高さでの回避、討伐による予告の解除、途中報酬が出ないこと、セーブと再戦を確認した。HTTPの2人試験では、異色三連星から一時撤退しても、合流時に倒した個体が復活しないことを確認した。 [Lua・HTTPの検証](../evidence/coop-legend-groups-lua-http.json)

Chromeの2画面で冷気弾の予告を見て氷銃を倒し、雷槌の予告に切り替わることを確認した。最初の2体を倒した時点では討伐数0、3体目で両画面に討伐1件と550モラが入り、保存にも記録された。全員が退出してから同じ部屋で入り直すと3体が復帰する。初期セーブは `python test_coop_legend_groups.py`、Chromeの試走は `node test_coop_legend_groups.mjs` で再現できる。 [氷銃の予告](../evidence/coop-tristars-gather.png) · [氷銃討伐後の雷槌](../evidence/coop-tristars-first-down.png) · [Chromeの検証](../evidence/coop-tristars-browser.json)

## 深罪の浸礼者を共闘する

Lv74でスメールの地域の入口から三環の祭場へ進む。どちらの地点でも同じ部屋に合流できる。本体のHPは1,090。初回は炎・氷・雷で、詠弾が炎、落晶が氷、三環が炎・氷・雷の順に発動する。床の輪は順番と範囲を示し、本体には詠唱中も攻撃できる。三環の発動後は2.4秒の後隙があり、60秒後の再出現で次の元素構成に切り替わる。

Luaの4人戦で、先に置いた仲間の岩壁が詠弾を止め、落晶の同じ範囲にいた二人には各1回だけ当たった。ソロの途中で部屋を作った場合も、発動済みの輪からホストは再び被弾せず、あとから入った人には残っている判定が届く。HTTPの2人戦では、全員が入口に戻っている間に祭場の予兆が止まり、合流後は同じ位置と順番から再開した。Lv74の討伐では参加者それぞれに82,300 EXPと255モラが入り、依頼は受注者だけ進んだ。 [Lua・HTTPの検証](../evidence/coop-baptist-lua-http.json) · [ソロの試作仕様](field-boss-v1/QA_SUMERU_FIELD.md#2026-11-18-web版の深罪の浸礼者)

Chromeの2画面では入口で合流し、徒歩で祭場へ入り、二人とも通常攻撃を当てながら三つの技を経て討伐した。操作開始から約27秒で、双方のセーブに討伐記録が1件ずつ入った。初期セーブは `python test_coop_baptist.py`、Chrome試走は `node test_coop_baptist.mjs` で再現できる。 [三環の予兆](../evidence/coop-baptist-rings.png) · [討伐後の再出現表示](../evidence/coop-baptist-cleared.png) · [Chromeの検証](../evidence/coop-baptist-browser.json)

## 兆載永劫ドレイクを共闘する

Lv66で雨林の道から機翼の間へ進む。どちらの地点でも同じ部屋に合流できる。本体HPは1,310。胸砲の構え中に胸部コアへ一撃を当てると、発射済みの弾も消えて2.5秒ダウンする。通常の胴体への攻撃はHPを減らし、胸砲は続く。低空突進中は本体と当たり判定が上がり、最も高いところでは地上の通常攻撃が届かない。

Luaの4人戦で、同じ翼刃にいた二人への個別命中と、ソロ途中の同じ翼刃でホストの被弾を重ねず参加者を追加できることを確認した。HTTPの2人戦では、全員が一時退避してもダウンの残り時間を保持し、合流後に追撃できた。Lv66で討伐に参加した二人に46,150 EXPと235モラが入り、討伐調査は受注者だけが進む。 [Lua・HTTPの検証](../evidence/coop-aeonblight-lua-http.json) · [ドレイクの試作仕様](field-boss-v1/DEEP_RUINS_MOVESETS.md)

Chromeの2画面で雨林の道から機翼の間へ進み、左右から攻撃した。両方でダウンと低空突進を確認し、操作開始から約33秒で討伐した。双方のセーブに討伐記録が1件ずつ入った。全背景を読み込む通常構成で検証した。初期セーブは `python test_coop_aeonblight.py`、Chrome試走は `node test_coop_aeonblight.mjs` で再現できる。 [ダウン](../evidence/coop-aeonblight-down.png) · [低空突進](../evidence/coop-aeonblight-flight.png) · [Chromeの検証](../evidence/coop-aeonblight-browser.json)

## 迷彩・潜行・跳躍があるスメールの三戦

| ボス | Lv | 道順 | 本体HP |
| --- | ---: | --- | ---: |
| 半永久統制マトリックス | 70 | 地域の入口から砂鏡の遺構へ | 1,100 |
| 風蝕ウェネト | 72 | 地域の入口から風蝕の砂洞へ | 1,080 |
| 無相の草 | 68 | 雨林の道から枯蔓の洞へ | 1,120 |

マトリックスは半透明の間も本体を攻撃できる。絵と当たり判定は一緒に移動し、別々の参加者が草と炎を入れると燃焼が続く。ウェネトは36刻み（0.6秒）の完全潜行中に直接攻撃が届かない。出現印を共有し、潜行前の燃焼で倒した場合はその後の風弾が発生しない。無相の草は跳躍の頂点で地上の通常攻撃が届かず、仲間の岩壁で草弾を遮れる。 [既存の試作仕様](field-boss-v1/SUMERU_QUARTET_MOVESETS.md)

Luaの4人戦で人数によるHP変動がないこと、参加した人だけにEXP・モラが入ることを確認した。HTTPの2人戦では3会場とも全員が退いた間に技と位置を保持し、合流してからの追撃、各自の討伐記録、受注者の依頼進行を確認した。 [Lua・HTTPの検証](../evidence/coop-sumeru-field-lua-http.json)

Chromeの2画面で3会場に移動し、それぞれの通常攻撃で討伐に参加した。マトリックスの迷彩、ウェネトが出現印の位置から現れること、無相の草の跳躍中に核の座標が一致することを両画面で確認した。ウェネトの出現印には左右にも目印を置き、旅人が真上に立っても位置が分かるようにした。3戦とも各自のセーブに討伐、EXP、モラ、再出現までの待ち時間が入り、依頼は受注者だけ進んだ。 [マトリックスの記録](../evidence/coop-asimon-browser.json) · [ウェネトの記録](../evidence/coop-wenut-browser.json) · [無相の草の記録](../evidence/coop-dendro-browser.json) · [出現印](../evidence/coop-wenut-burrow.png) · [跳躍中の核](../evidence/coop-dendro-plunge.png)

`python test_coop_sumeru_field.py` で初期セーブを生成する。`python server.py --port 9020` でラボを開き、`node test_coop_field_routes.mjs asimon wenut dendro` で再現できる。

## 急凍樹

Lv16でモンドの挑戦入口から霜花の洞窟に進む。HPは570。根元への3回の攻撃で核を壊すと、進行中の技の発動が終わってから4秒ダウンする。Luaの4人戦で、同じ首落としや薙ぎに入った二人に各1回当たること、氷弾は先に触れた人で止まることを確認した。HTTPの2人戦では全員が退出するとダウン時間が止まり、合流後に続きから追撃できた。

Chromeの2画面で入口から入って二人で核を壊し、双方がダウンを見て討伐した。各自が900 EXP、125モラ、討伐1回を保存し、依頼は受注者だけ進んだ。`python test_cryo_field.py` で初期セーブを生成し、`node test_coop_field_routes.mjs cryo` で再現できる。 [Lua・HTTPの検証](../evidence/coop-cryo-field-lua-http.json) · [Chromeの検証](../evidence/coop-cryo-browser.json) · [核破壊後のダウン](../evidence/coop-cryo-down.png)

## 爆炎樹と迅電樹

| ボス | Lv | 道順 | 本体HP | 討伐参加者一人あたり |
| --- | ---: | --- | ---: | --- |
| 爆炎樹 | 28 | 璃月の挑戦入口から燠火の岩窟へ | 710 | 4,900 EXP・150モラ |
| 迅電樹 | 62 | スメールの雨林の道から紫脈の石窟へ | 1,240 | 39,950 EXP・225モラ |

首落としに当たった人には、直後に走る炎波や走雷が重ねて当たらない。首落としの外にいた人には、そこまで届いた波が当たる。どちらも別々の攻撃を計3回、根元に当てると4秒ダウンする。爆炎樹は炎波が終わってから倒れ、迅電樹は核が壊れた時点で走雷を中断する。

Luaの4人戦で、同じ範囲にいた二人への個別命中、双弾が別々の人に当たる場合、迅電樹の三点の落雷を確認した。HTTPの2人戦では全員が退くとダウンの残り時間が止まり、合流後に追撃できた。Chromeの2画面では町から各会場へ移動し、二人で核を壊して討伐した。各自のセーブに討伐、EXP、モラ、再出現の待ち時間が入り、依頼は受注者だけ進んだ。 [Lua・HTTPの検証](../evidence/coop-regisvine-fields-lua-http.json) · [爆炎樹のChrome試走](../evidence/coop-pyro-browser.json) · [迅電樹のChrome試走](../evidence/coop-electro-regisvine-browser.json)

`python test_pyro_field.py` と `python test_electro_regisvine_field.py` で初期セーブを作る。ラボの起動後、`node test_coop_field_routes.mjs pyro electro-regisvine` で再現できる。 [爆炎樹のダウン](../evidence/coop-pyro-down.png) · [迅電樹のダウン](../evidence/coop-electro-regisvine-down.png)

## エンシェントヴィシャップ・岩

Lv36で璃月の洞窟入口から伏竜の石窟へ進む。HPは970。前爪二連は前方、尾払いは後方、原岩の噴出は足元の低い範囲に届く。既存の盾が噴出のダメージを一部でも吸収すると、全員が追撃できる時間が1秒延びる。何人が盾で受けても延長は一度で、水の盾の反撃ダメージはそれぞれの使用者に帰属する。 [ラボの攻撃仕様](field-boss-v1/LIYUE_MOVESETS.md#5-エンシェントヴィシャップ岩盾を持たなくても倒せる大柄な相手)

Luaの4人戦で前爪と尾の命中、同じ噴出を受ける盾2枚、通常のジャンプ、盾の反撃でとどめを刺した後の攻撃終了、再出現時の水から炎への切り替えを確認した。HTTPの2人戦では、参加側が盾を使うと両画面の隙が延び、全員が外へ退いた間は同じ状態で止まった。再合流後の撃破では、盾の反撃も報酬の対象になった。 [Lua・HTTPの検証](../evidence/coop-primo-field-lua-http.json)

Chromeの2画面で盾の反応と隙の延長を確認し、双方が討伐に参加して各8,500 EXPと165モラを保存した。依頼は受注者だけ進んだ。`python test_primo_field.py` で初期セーブを生成し、`node test_coop_field_routes.mjs primo` で再現できる。 [Chromeの検証](../evidence/coop-primo-browser.json) · [シールドを使った戦闘画面](../evidence/coop-primo-shield.png)

## 純水精霊と魔偶剣鬼

| ボス | Lv | 道順 | 本体HP | 討伐参加者一人あたり |
| --- | ---: | --- | ---: | --- |
| 純水精霊 | 38 | 璃月の湖畔入口から軽策の水鏡へ | 900 | 12,250 EXP・170モラ |
| 魔偶剣鬼 | 44 | 稲妻の挑戦入口から剣鬼の古庭へ | 900 | 14,950 EXP・180モラ |

純水精霊は手前の水の幻形を攻撃すると共有HPが減る。水猪・水鶴・水蛙への変形中も、同じHPと元素付着を使う。水蛙の着地点は予告で固定され、跳躍中は当たり判定も一緒に上がる。魔偶剣鬼は居合と二段の斬り返しの向きを予告中に固定し、仮面は全画面で同じ走路を進む。 [両戦の仕様](field-boss-v1/OCEANID_INAZUMA_MOVESETS.md)

Luaの4人戦で水鶴の二波が別々の参加者に当たること、水蛙の着地と跳躍中の有効打、斬り返しの二打と仮面の個別命中を確認した。HTTPの2人戦で跳躍中と仮面の移動中に全員が退いても、その時点から再開できた。Chromeの2画面で着地印と仮面の走路が一致し、双方の討伐報酬を保存した。受注者は帰町して報告し、報告報酬4,000 EXP・300モラを保存した。 [Lua・HTTP検証](../evidence/coop-oceanid-maguu-lua-http.json) · [純水精霊のChrome試走](../evidence/coop-oceanid-browser.json) · [魔偶剣鬼のChrome試走](../evidence/coop-maguu-browser.json)

`python test_oceanid_field.py` と `python test_maguu_field.py` で初期セーブを作る。ポート9020でラボを起動し、`node test_coop_field_routes.mjs oceanid maguu` で再現できる。別のポートで起動したラボには環境変数 `LAB_URL` で接続する。 [水蛙の跳躍](../evidence/coop-oceanid-frog.png) · [剣鬼の仮面](../evidence/coop-maguu-mask.png)

## 恒常からくり陣形と雷音権現

| ボス | Lv | 稲妻の会場 | 本体HP | 討伐参加者一人あたり |
| --- | ---: | --- | ---: | --- |
| 恒常からくり陣形 | 46 | 機巧の石庭 | 960 | 17,450 EXP・185モラ |
| 雷音権現 | 48 | 雷鳴の岩峰 | 940 | 20,350 EXP・190モラ |

恒常からくり陣形は機刃・回転刃・跳躍へ形を変えても、HPと元素付着を引き継ぐ。雷音権現は三枚の雷羽を順に放ち、低空の雷走に入る前に突進の終点を固定する。両戦とも上昇中は絵と当たり判定が一緒に上がり、地上の通常攻撃は届かなくなる。 [ラボの攻撃仕様](field-boss-v1/OCEANID_INAZUMA_MOVESETS.md)

Luaの4人戦で予告と当たり判定、回転刃の個別命中、三枚の雷羽が別々の参加者に当たることを確認した。HTTPの2人戦では、全員が退いた間に飛行と予告の位置を保持し、合流して討伐した。Chromeの2画面で着地印と雷走の予告が一致し、討伐報酬は各自に入った。受注者は稲妻港に戻り、報告報酬4,000 EXPと300モラを受け取って保存した。 [Lua・HTTPの検証](../evidence/coop-inazuma-flight-lua-http.json) · [恒常からくり陣形のChrome試走](../evidence/coop-array-browser.json) · [雷音権現のChrome試走](../evidence/coop-thunder-browser.json)

`python test_array_field.py` と `python test_thunder_field.py` で初期セーブを作り、`node test_coop_field_routes.mjs array thunder` で再現できる。ポート9020以外のラボを使う場合は環境変数 `LAB_URL` に起動先を指定する。 [機核の跳躍](../evidence/coop-array-rocket.png) · [低空の雷走の予告](../evidence/coop-thunder-flight.png)

単独戦の同じコマで標準矩形と軽量16色を切り替えると、Luaが返す描画指示は陣形が4,293件から1,141件、雷音権現が5,843件から1,606件に減った。 [陣形の計測](../evidence/array-field-lua.json) · [雷音権現の計測](../evidence/thunder-field-lua.json)

## 無相の氷・炎・水

| ボス | Lv | 会場 | 本体HP | 討伐参加者一人あたり |
| --- | ---: | --- | ---: | --- |
| 無相の氷 | 20 | ドラゴンスパイン・霜輪の窪地 | 785 | 1,150 EXP・145モラ |
| 無相の炎 | 50 | 稲妻・燎火の石浜 | 990 | 23,750 EXP・195モラ |
| 無相の水 | 52 | 稲妻・潮紋の洞 | 1,010 | 27,700 EXP・200モラ |

無相の氷は氷輪の進路と落氷三本の位置を予告で固定する。無相の炎は炎拳の絵と当たり判定が着地点に向かって動き、炎蛇の弾は一発ずつ別の参加者にも当たる。無相の水は海豚の着地と三点の雨紋を共有し、水翼に当たった人へ後続の波を重ねて当てない。固有元素への無効と攻撃後に核がほどける演出は、従来の単独戦と同じ。

Luaの4人試験で個別の命中、途中参加、着地と攻撃後の核の表示を検証した。HTTPの2人試験では、氷輪または跳躍の途中で空になった会場の状態を保持し、合流後に討伐した。Chromeの2画面では予告を見ながら討伐し、各自の報酬と受注者の依頼報告を保存した。 [Lua・HTTPの検証](../evidence/coop-elemental-cubes-lua-http.json) · [無相の氷のChrome試走](../evidence/coop-cryo-cube-browser.json) · [無相の炎のChrome試走](../evidence/coop-pyro-cube-browser.json) · [無相の水のChrome試走](../evidence/coop-hydro-cube-browser.json)

`test_cryo_hypostasis_field.py`、`test_pyro_hypostasis_field.py`、`test_hydro_hypostasis_field.py` を Python で実行して初期セーブを作る。ポート9020でラボを起動し、`node test_coop_field_routes.mjs cryo-cube pyro-cube hydro-cube` で再現できる。別のポートは環境変数 `LAB_URL` で指定する。 [落氷の予告](../evidence/coop-cryo-cube-fall.png) · [炎拳の跳躍](../evidence/coop-pyro-cube-fist.png) · [海豚の跳躍](../evidence/coop-hydro-cube-dolphin.png)

## 黄金王獣と遺跡サーペント

| ボス | Lv | 会場 | 本体HP | 討伐参加者一人あたり |
| --- | ---: | --- | ---: | --- |
| 黄金王獣 | 54 | 稲妻・鶴観の霧浜遺跡 | 1,100 | 32,300 EXP・210モラ |
| 遺跡サーペント | 24 | 層岩巨淵・巨蛇岩穴の掘削場 | 900 | 2,350 EXP・150モラ |

黄金王獣の低空突進は終点を予告で固定し、飛行中は本体の絵と当たり判定が一緒に上がる。口から飛ばす黄金首弾は、絵と当たり判定が同じ軌道を進み、先に触れた参加者で止まる。遺跡サーペントは36刻み（0.6秒）の潜行中に直接攻撃を受けず、固定した印から出てから24刻み（0.4秒）後に掘り上げる。三点の掘削弾は着弾位置を共有する。 [黄金王獣の仕様](field-boss-v1/HYPOSTASES_WOLFLORD_MOVESETS.md#6-黄金王獣boss-22060101) · [サーペントの仕様](field-boss-v1/DEEP_RUINS_MOVESETS.md#3-遺跡サーペントboss-24010401)

Luaの4人試験で、首弾二発と掘削弾三発が別々の参加者に当たること、潜行前の燃焼で倒すと掘り上げが止まることを確認した。HTTPの2人試験では全員の退避中に飛行・潜行の状態を保持し、同じ部屋へ戻って追撃できた。Chromeの2画面で首弾の軌道と出現印が一致し、双方が討伐報酬を保存した。依頼は受注者が拠点へ戻って報告し、4,000 EXP・300モラと完了状態を保存した。 [Lua・HTTPの検証](../evidence/coop-wolflord-serpent-lua-http.json) · [黄金王獣のChrome試走](../evidence/coop-wolflord-browser.json) · [遺跡サーペントのChrome試走](../evidence/coop-serpent-browser.json)

`python test_wolflord_field.py` と `python test_ruin_serpent_field.py` で初期セーブを作り、ポート9020でラボを起動して `node test_coop_field_routes.mjs wolflord serpent` を実行する。別のポートは環境変数 `LAB_URL` で指定する。 [黄金首弾](../evidence/coop-wolflord-skull.png) · [短潜行からの出現](../evidence/coop-serpent-emerge.png)

## アビサルヴィシャップの群れ

淵下宮の入口拠点から探索路を経て、Lv46で双影の石庭へ入る。氷と雷の二体でHP1,120を共有し、どちらへ当てても同じゲージが減る。一発の範囲攻撃が両方に届いたときは一回分だけ減り、元素付着は当たった側に残る。HPが0になると二体が同時に倒れ、60秒後にそろって再出現する。 [ラボ版の設計](field-boss-v1/DEEP_RUINS_MOVESETS.md#4-アビサルヴィシャップの群れbathysmal-herd)

跳躍リレーは①の氷、②の雷の順に着地する。床の番号付きの印と実際の着地点は全画面でそろう。Luaの4人試験で段ごとの個別命中、二発の吐息が別々の参加者に当たること、雷側への最後の一撃で二体が消えることを確認した。HTTPでは全員が探索路に退避してから戻っても、同じ跳躍から再開した。 [Lua・HTTPの検証](../evidence/coop-bathysmal-lua-http.json)

討伐に参加した二人は各17,450 EXPと195モラを保存した。依頼の受注者は入口拠点に戻って報告し、4,000 EXPと300モラを受け取った。試験用のセーブは `python test_bathysmal_field.py` で生成する。ラボのURLを `LAB_URL` に設定し、`node test_coop_field_routes.mjs bathysmal` でChromeの試走を再現できる。 [跳躍中の画面](../evidence/coop-bathysmal-relay.png) · [Chromeの検証](../evidence/coop-bathysmal-browser.json)

## 実験用フィールド生成装置

フォンテーヌの水辺の広場から水路沿いを経て、Lv86で重力試験室へ入る。共闘のHPは1,020。三連地震の青い枠は全画面で同じ位置に出る。枠内にいるキャラクターだけ鉛直加速度が通常の55%になり、同じ入力で通常の約157pxに対して約290px跳べる。地震は枠の外へ出るか、枠の中で跳んでかわす。枠が消えると、室内全員の重力が元に戻る。 [ラボ版の設計](field-boss-v1/FONTAINE_FIELD_GENERATOR.md) · [低重力での跳躍](../evidence/coop-generator-gravity.png)

Luaの4人試験で、同時に跳んだ二人の高さが枠の内外で変わり、枠内の地上に残った人にだけ地震が当たることを確認した。HTTPの2人試験では全員が水路沿いへ出てから戻っても同じ低重力の状態が続いた。Chromeの2画面で討伐し、各自の129,550 EXP・305モラと受注者の報告報酬5,400 EXP・380モラを保存した。`python test_field_generator.py` で初期セーブを作り、ラボのURLを `LAB_URL` に設定して `node test_coop_field_routes.mjs generator` で試走を再現できる。 [Lua・HTTPの検証](../evidence/coop-generator-lua-http.json) · [Chromeの検証](../evidence/coop-generator-browser.json)

## 鉄甲熔炎帝王と千年真珠の海駿

水辺の広場で討伐調査を受け、水路沿いから各会場へ入る。鉄甲熔炎帝王は正面からの直接攻撃を72%に軽減し、双角の噴火後は2.4秒間、正面からも通常のダメージが入る。熔弾の二つの落下地点と、正面の守りが解けるタイミングは全参加者で一致する。 [熔炎帝王のラボ版仕様](field-boss-v1/FONTAINE_EMPEROR.md) · [噴火後の姿勢](../evidence/coop-emperor-exposed.png)

千年真珠の海駿は帯電中の真珠に直接攻撃を2回当てると、跳躍を中断して2.4秒の反撃時間に入る。別々の参加者が一撃ずつ当てても中断できる。同じ攻撃の再接触と、元素反応による追加ダメージでは真珠の進行は加算されない。真珠の印と消灯は全員に見える。 [海駿のラボ版仕様](field-boss-v1/FONTAINE_SEAHORSE.md) · [帯電中の真珠](../evidence/coop-seahorse-pearl.png)

| ボス | Lv | 会場 | HP | 討伐参加者一人あたり | 依頼を報告した人 |
| --- | ---: | --- | ---: | --- | --- |
| 鉄甲熔炎帝王 | 82 | 熔殻の洞 | 980 | 98,800 EXP・280モラ | 5,000 EXP・360モラ |
| 千年真珠の海駿 | 84 | 真珠珊瑚の洞 | 1,010 | 113,150 EXP・290モラ | 5,200 EXP・370モラ |

Luaの4人試験で個別の命中と反撃時間を確認し、HTTPの2人試験では全員が退避してから同じ状態へ合流した。Chromeの2画面で討伐、報告、保存を確認した。`python test_emperor_field.py` と `python test_seahorse_field.py` で初期セーブを作り、`LAB_URL` にラボのURLを設定して、`node test_coop_field_routes.mjs emperor seahorse` で再現できる。 [Lua・HTTPの検証](../evidence/coop-fontaine-weakpoints-lua-http.json) · [熔炎帝王のChrome試走](../evidence/coop-emperor-browser.json) · [海駿のChrome試走](../evidence/coop-seahorse-browser.json)

## 山隠れの猊獣と魔像レガトゥス

沈玉の谷では入口拠点から探索路を通り、懸練山の石庭で山隠れの猊獣と戦える。跳躍中は姿勢と当たり判定が一緒に上がり、青い印に着地する。着地と続く水波は、参加者ごとに合わせて一回だけ当たる。着地を避けた人も、水波の進路にいると被弾する。 [猊獣のラボ版仕様](field-boss-v1/CHENYU_SUANNI.md) · [跳躍と着地予告](../evidence/coop-suanni-fall.png)

フォンテーヌの水辺の広場から色褪せた城の入口を通ると、展示広間で魔像レガトゥスと戦える。部屋で一つの共鳴器を共有し、複数の参加者が同じ共鳴器を削れる。点火前にHP14を削り切ると炎と装甲が止まり、2.4秒の反撃時間に入る。共鳴器が残ると、予告された帯に炎が出る。討伐報酬は魔像の撃破時に付く。 [レガトゥスのラボ版仕様](field-boss-v1/FONTAINE_LEGATUS.md) · [共鳴器と炎の予告](../evidence/coop-legatus-resonator.png)

| ボス | Lv | HP | 討伐参加者一人あたり | 依頼を報告した人 |
| --- | ---: | ---: | --- | --- |
| 山隠れの猊獣 | 32 | 738 | 5,900 EXP・196モラ | 2,900 EXP・240モラ |
| 魔像レガトゥス | 92 | 1,010 | 191,700 EXP・335モラ | 6,200 EXP・420モラ |

Luaの4人試験とHTTPの2人試験で、個別の命中、共鳴器の破壊、会場を出た後の同じ状態への合流を確認した。Chromeの2画面で討伐、帰還、報告、保存まで試走した。`python test_suanni_field.py` と `python test_legatus_field.py` で試験用のセーブを作り、`LAB_URL` にラボのURLを設定して、`node test_coop_field_routes.mjs suanni legatus` で再現できる。 [Lua・HTTPの検証](../evidence/coop-suanni-legatus-lua-http.json) · [猊獣のChrome試走](../evidence/coop-suanni-browser.json) · [レガトゥスのChrome試走](../evidence/coop-legatus-browser.json)

## 暴君・金焔のクク竜と山の王・貪食のユムカ竜

ナタの谷の集落から岩場の道へ進み、各会場へ入る。クク竜の二つの降下地点と、床に刺さる一枚の羽根は部屋で共有する。複数の参加者で羽根のHP14を削り切ると、二度の降下を止めてクク竜を地上に戻せる。最初の降下に入る直前でも羽根の破壊が間に合う。討伐報酬はクク竜の撃破時に発生する。 [クク竜のラボ版仕様](field-boss-v1/NATLAN_QUCUSAUR.md) · [羽根と降下予告](../evidence/coop-qucusaur-feather.png)

ユムカ竜の腹落ちと二つの実は、決まった地点を全員に予告する。①②の順に実が落ち、着弾範囲にいる参加者が個別に被弾する。空を飛ぶ実は着弾の予告として表示する。 [ユムカ竜のラボ版仕様](field-boss-v1/NATLAN_YUMKA.md) · [実の軌道と着弾予告](../evidence/coop-yumka-fruits.png)

| ボス | Lv | 会場 | HP | 討伐参加者一人あたり | 依頼を報告した人 |
| --- | ---: | --- | ---: | --- | --- |
| 暴君・金焔のクク竜 | 102 | 金焔の岩窟 | 1,020 | 212,400 EXP・360モラ | 7,200 EXP・460モラ |
| 山の王・貪食のユムカ竜 | 104 | 山王の峡谷 | 1,035 | 212,400 EXP・370モラ | 7,400 EXP・470モラ |

Luaの4人試験で羽根の共同破壊、二度の降下の中断、実の着弾時の個別命中を確認した。HTTPの2人試験では退避後に同じ戦闘状態へ戻り、Chromeの2画面で討伐と依頼報告を保存した。`python test_qucusaur_field.py` と `python test_yumka_field.py` で試験用のセーブを作る。`LAB_URL` にラボのURLを設定し、`node test_coop_field_routes.mjs qucusaur yumka` で再現できる。 [Lua・HTTPの検証](../evidence/coop-natlan-saurians-lua-http.json) · [クク竜のChrome試走](../evidence/coop-qucusaur-browser.json) · [ユムカ竜のChrome試走](../evidence/coop-yumka-browser.json)

## 秘源機兵・機巧デバイスと深遠なるミミックパピラ・I型

秘源の機構室では、集積器の目盛りが点灯してから別々の直接攻撃を合計3回当てると、球雷砲が止まり、ボスが3秒ダウンする。参加者が別々に攻撃しても同じ目盛りに加算する。攻撃を出した時刻は部屋の受付時刻にそろえて判定し、点灯前に出した攻撃の後続ヒットは数に含まれない。 [機巧デバイスのラボ版仕様](field-boss-v1/NATLAN_CONFIG_DEVICE.md) · [共通の集積器と球雷砲の予告](../evidence/coop-config-device-collector.png)

紫影の石窟では、パピラが樹影・機竜影・菌獣影に擬態する。見た目と攻撃範囲が変わっても、参加者の攻撃は同じHPに届き、付着と発動済みの攻撃の標的も引き継ぐ。菌獣影は予告した位置に着地する。 [パピラのラボ版仕様](field-boss-v1/NATLAN_PAPILLA.md) · [菌獣影の姿と着地予告](../evidence/coop-papilla-morph.png)

| ボス | Lv | HP | 討伐参加者一人あたり | 依頼を報告した人 |
| --- | ---: | ---: | --- | --- |
| 秘源機兵・機巧デバイス | 106 | 1,020 | 240,900 EXP・380モラ | 7,600 EXP・480モラ |
| 深遠なるミミックパピラ・I型 | 108 | 1,050 | 273,250 EXP・395モラ | 7,800 EXP・500モラ |

Luaの4人試験では、時刻の基準が異なる三人で集積器を壊し、パピラでは擬態をまたぐ付着と遅れて届く攻撃を確認した。HTTPの2人試験では一時退避後に再合流し、Chromeの2画面で各自の討伐と受注者の報告を保存した。`python test_config_device_field.py` と `python test_papilla_field.py` で試験用のセーブを作る。`LAB_URL` にラボのURLを設定し、`node test_coop_field_routes.mjs config-device papilla` で再現できる。 [Lua・HTTPの検証](../evidence/coop-config-papilla-lua-http.json) · [機巧デバイスのChrome試走](../evidence/coop-config-device-browser.json) · [パピラのChrome試走](../evidence/coop-papilla-browser.json)

## 輝ける溶岩の龍像と秘源機兵・統御デバイス

ナタの岩場の道から溶岩棚へ進むと龍像と戦える。試作の熱目盛りを参加者で共有し、別々の炎攻撃を合計2回当てると熔焰の龍になる。さらに2回で過燃焼に入り、進行中の技が止まる。過燃焼は水・氷の直接攻撃か3秒の経過で解ける。熔岩噴出の二地点は固定し、参加者ごとに命中を判定する。 [龍像のラボ版仕様](field-boss-v1/NATLAN_LAVA_DRAGON.md) · [熔焰の龍と噴出予告](../evidence/coop-lava-dragon-eruption.png)

溶岩棚の入口側から分岐した統御の遺構では、三連噴流の位置と液流の目盛りを共有する。氷の直接攻撃は攻撃一回につき一目盛り減らし、1.2秒間蓄積を止める。各噴流の威力は噴き始めに決まり、途中で冷却しても同じ噴流内の参加者には同じ威力を適用する。 [統御デバイスのラボ版仕様](field-boss-v1/NATLAN_OVERSEER.md) · [冷却中の三連噴流](../evidence/coop-overseer-cooled.png)

| ボス | Lv | HP | 討伐参加者一人あたり | 依頼を報告した人 |
| --- | ---: | ---: | --- | --- |
| 輝ける溶岩の龍像 | 110 | 1,100 | 309,900 EXP・410モラ | 8,000 EXP・520モラ |
| 秘源機兵・統御デバイス | 112 | 1,125 | 351,500 EXP・420モラ | 8,200 EXP・540モラ |

Luaの4人試験で複数人の加熱と冷却、同じ噴流への個別命中を確認した。HTTPの2人試験では退避後に同じ戦闘状態へ合流し、Chromeの2画面で討伐と依頼報告を保存した。今回の共闘は現行のラボ試作を使用した。龍像を自発変身の三技にまとめる案と、統御デバイスの冷却受付や回復時間を調整する案は移行待ち。 [後半の動作設計案](field-boss-v1/NATLAN_REMAINING_MOVESETS.md) · [Lua・HTTPの検証](../evidence/coop-atocpan-lua-http.json)

`python test_lava_dragon_field.py` と `python test_overseer_field.py` で試験用のセーブを作る。`LAB_URL` にラボのURLを設定し、`node test_coop_field_routes.mjs lava-dragon overseer` で試走を再現できる。 [龍像のChrome試走](../evidence/coop-lava-dragon-browser.json) · [統御デバイスのChrome試走](../evidence/coop-overseer-browser.json)

## 迷える霊覚の修験者

Lv114の謎煙の修練窟へは、ナタ・岩場の道の門から入る。試作の本体HPは1,060。色彩の分身では本体が隠れ、4体の分身の位置と守りの残り層を全員で共有する。分身1体につき3層あり、新しい直接攻撃で1層、炎の直接攻撃で2層削れる。4体を倒すと本体が3秒間ダウンする。 [現行の戦闘仕様](field-boss-v1/NATLAN_SPIRITSPEAKER.md) · [分身が出現した画面](../evidence/coop-spiritspeaker-reflections.png)

本体を攻撃して討伐に参加した人に、各398,700 EXPと420モラが入る。依頼を受けた人が集落に戻って報告すると、8,600 EXPと560モラが入る。Luaの4人試験で攻撃の受付、途中参加、個別報酬を、HTTPの2人試験で全員離脱後の再合流と保存を確認した。Chromeの2画面では、同じ4体を倒して本体を追撃し、討伐と依頼報告を保存した。 [Lua・HTTPの検証](../evidence/coop-spiritspeaker-lua-http.json) · [Chromeの試走](../evidence/coop-spiritspeaker-browser.json)

`python test_spiritspeaker_field.py` で試験用のセーブを作り、`LAB_URL` を指定して `node test_coop_field_routes.mjs spiritspeaker` を実行すると試走を再現できる。本体を表示したまま二影が順に攻撃する案は後続の設計。 [二影の設計案](field-boss-v1/NATLAN_REMAINING_MOVESETS.md#fsp03色彩の二影順筆)

## ボコボコダックと重量級陸巡艦「バトルシップ」

ナド・クライの町の広場で部屋を作り、月明かりの道から各会場へ進む。ボコボコダックは工房裏の試運転場にいる。補修メカを1機壊すとバリアが60減り、2機とも壊すと本体が2.4秒間ダウンする。メカが本体に着くとバリアを25補修する。メカの残りHPと本体のバリアは全員で共有する。 [補修メカが出た画面](../evidence/coop-duckle-repair-units.png)

バトルシップは陸巡艦の整備庫にいる。参加者の炎攻撃で熱を4段階までためると、氷バリアを張って冷却を始める。バリアは5層。攻撃1回で1層、炎は2層削れる。燃焼の継続ダメージも炎として扱う。冷却放出の前にバリアを壊すと、放出を止めて本体を2.8秒間ダウンさせられる。 [氷バリアを張った画面](../evidence/coop-battleship-thermal-shield.png)

| ボス | Lv | HP | 討伐参加者一人あたり | 依頼を報告した人 |
| --- | ---: | ---: | ---: | ---: |
| ボコボコダック | 122 | 1,135 | 526,400 EXP・445モラ | 8,500 EXP・570モラ |
| バトルシップ | 124 | 1,170 | 597,050 EXP・455モラ | 8,800 EXP・590モラ |

Luaの4人試験で各参加者への命中とバリア破壊、HTTPの2人試験で退避後の再合流と保存を確認した。Chromeの2画面で両戦のバリア破壊と討伐を確認し、個別報酬と受注者の依頼報告を保存した。試走するには `python test_knuckle_duckle_field.py` と `python test_battleship_field.py` でセーブを作り、`LAB_URL` を指定して `node test_coop_field_routes.mjs duckle battleship` を実行する。 [Lua・HTTPの検証](../evidence/coop-nod-machines-lua-http.json) · [ダックのChrome試走](../evidence/coop-duckle-browser.json) · [バトルシップのChrome試走](../evidence/coop-battleship-browser.json)

共闘には現行の試作を使った。ダックの補修メカを前側に集める変更や、バトルシップが炎の蓄積とは独立して冷却を行う変更は後続の動作設計にある。 [後続の設計案](field-boss-v1/NOD_KRAI_QUARTET_MOVESETS.md)

## 霜夜の空を巡る霊主と昏き魘夢の主

ナド・クライの月明かりの道から霜夜の石壇へ進むと、霜夜の空を巡る霊主と戦える。薄闇に氷か月の攻撃を別々に3回当てると、その場の全員で解除できる。薄闇が時間切れになると、七元素のうち受けたダメージが最も多かった元素に3.5秒間適応する。途中から参加しても、効果が切れる時刻は全員に共通する。 [元素適応中の画面](../evidence/coop-herra-adaptation.png)

煙雲の山の昏き浜では、昏き魘夢の主が暗黒のシールドを張り、闇の漁師を4体召喚する。漁師を1体倒すたびにシールドが100削れ、月の攻撃はシールドに通常の3倍のダメージを与える。召喚位置と残りHP、シールド値を全員で共有する。シールドを壊すと残った漁師が消え、本体は3秒間ダウンする。 [闇の漁師が出た画面](../evidence/coop-nightmare-fishers.png)

| ボス | Lv | HP | 討伐参加者一人あたり | 依頼を報告した人 |
| --- | ---: | ---: | ---: | ---: |
| 霜夜の空を巡る霊主 | 126 | 1,200 | 677,150 EXP・465モラ | 9,000 EXP・610モラ |
| 昏き魘夢の主 | 128 | 1,340 | 768,050 EXP・475モラ | 9,200 EXP・630モラ |

Luaの4人試験で、参加者の時刻が異なっても元素適応の終了がそろうことと、召喚・シールド・個別命中の共有を確認した。HTTPの2人試験では退避後に同じ戦闘へ戻れた。Chromeの2画面で両戦の討伐・個別報酬・受注者の報告を保存した。霊主のChrome試走は氷技を2種使えるLv144で行い、レベル差を反映した440,148 EXPを各自が獲得した。 `python test_frostnight_herra_field.py` と `python test_whisperer_nightmares_field.py` でセーブを作り、`LAB_URL` を指定して `node test_coop_field_routes.mjs herra nightmare` を実行すると試走できる。 [Lua・HTTPの検証](../evidence/coop-nod-gloom-lua-http.json) · [霊主のChrome試走](../evidence/coop-herra-browser.json) · [魘夢の主のChrome試走](../evidence/coop-nightmare-browser.json)

今回は現行の試作を使った。霊主の薄闇を短い二連波にまとめる案や、魘夢の主の潜行と召喚を短く整理する案は後続の設計。 [後続の動作設計](field-boss-v1/NOD_KRAI_QUARTET_MOVESETS.md)

## 集光の幻月蝶と集光の月ヤモリ

ナド・クライの月明かりの道から、幻月蝶の岩窟と波追いの峠の月石洞に入れる。「集光の繭」は範囲にいたキャラクターごとにかかり、HPが満タンになるとそのキャラクターが脱出する。脱出したキャラクターは8秒間、与えるダメージが増える。味方の「集光の繭」と「脱出」も戦闘画面に表示する。 [幻月蝶戦の繭](../evidence/coop-moonfly-cocoons.png)

月ヤモリの月石の錨は5層。新しい直接攻撃で1層、岩攻撃で2層削れる。層は全員で共有する。錨が壊れると、最後の層を削った参加者の攻撃として本体に反動ダメージが入り、3秒間ダウンする。誰かが繭から脱出すると、本体に岩ダメージが通りやすい時間を8秒に更新する。 [月ヤモリ戦の月石の錨](../evidence/coop-moongecko-moonstone-anchor.png)

| ボス | Lv | HP | 討伐参加者一人あたり | 依頼を報告した人 |
| --- | ---: | ---: | ---: | ---: |
| 集光の幻月蝶 | 130 | 1,050 | 871,150 EXP・485モラ | 9,400 EXP・650モラ |
| 集光の月ヤモリ | 132 | 1,160 | 988,100 EXP・495モラ | 9,600 EXP・670モラ |

Luaの4人試験で、回復と脱出が個別に進むこと、錨を壊した人に本体への反動が付くことを確認した。破壊直後にその人が退場しても反動は発生し、その場にいる討伐条件を満たした人の報酬を一度だけ記録する。HTTPの2人試験で退避後の再合流と保存を確認した。Chromeの2画面で、繭からの個別脱出、錨の破壊、討伐と受注者の報告を保存した。 [Lua・HTTPの検証](../evidence/coop-nod-cocoons-lua-http.json) · [幻月蝶のChrome試走](../evidence/coop-moonfly-browser.json) · [月ヤモリのChrome試走](../evidence/coop-moongecko-browser.json)

`python test_coop_nod_cocoons.py` で未強化のアイテムLv68の花を装備した試験用セーブを作り、`LAB_URL` を指定して `node test_coop_field_routes.mjs moonfly moongecko` を実行すると再現できる。技の時間や数値は現行のラボ試作を使う。

## 守護者・堕天と合成獣・フリューゲルレーヴェ

守護者・堕天はドーンマンポートの入口拠点から入る風息山の石庭にいる。元素監視中は参加者全員の炎・水・雷・氷の直接ダメージを数える。1回目の記録と2回目の別元素は3ヒット、2回目の同元素は6ヒットで記録する。出現した元素星は全員で削れる。星を壊すと対応する攻撃が止まり、最後の層を削った人の攻撃として本体に反動ダメージが入る。2つ壊すと3秒間ダウンする。 [元素星が出た画面](../evidence/coop-vigil-elemental-stars.png)

フリューゲルレーヴェはスネージナヤの凍った街道から入る古獣の氷原の西谷にいる。招雷中の「雷の守り」は8層。破壊すると技が中断され、3秒間ダウンしてから使風に移る。使風中は風の球5個の位置と残り層を共有し、3個を壊すと集束が中断される。 [風の球が出た画面](../evidence/coop-flugel-wind-orbs.png)

| ボス | Lv | HP | 討伐参加者一人あたり | 依頼を報告した人 |
| --- | ---: | ---: | ---: | ---: |
| 守護者・堕天 | 18 | 700 | 1,250 EXP・155モラ | 1,400 EXP・220モラ |
| 合成獣・フリューゲルレーヴェ | 144 | 1,180 | 1,466,100 EXP・540モラ | 10,400 EXP・710モラ |

Luaの4人試験で、時刻の異なる参加者の攻撃を同じ記録や層に反映し、召喚前に始めた攻撃を除外することを確認した。元素星の破壊者が退場しても、反動の討伐報酬は条件を満たした人に一度だけ入る。HTTPの2人試験で退避後の再合流を確認し、Chromeの2画面で召喚、ダウン、各自の討伐報酬と受注者の依頼報告を保存した。 [Lua・HTTPの検証](../evidence/coop-vigil-flugel-lua-http.json) · [堕天のChrome試走](../evidence/coop-vigil-browser.json) · [フリューゲルのChrome試走](../evidence/coop-flugel-browser.json)

`python test_fallen_vigil_field.py` と `python test_flugel_field.py` でセーブを作り、`LAB_URL` を指定して `node test_coop_field_routes.mjs vigil flugel` を実行すると再現できる。現在の共闘は既存のラボ試作を使用する。 [堕天の後続設計](field-boss-v1/RADIANT_VIGIL_MOVESETS.md) · [フリューゲルの後続設計](field-boss-v1/SNEZHNAYA_QUARTET_MOVESETS.md)

## 游雪のブレードガーディアンと不滅の副産物

スネージナヤの凍った街道から氷冠の雪庭へ進むと、游雪のブレードガーディアンと戦える。本体HPが55％以下になると、一戦に一度だけ氷の棺を展開する。8層の棺は全員で削れる。期限までに壊すと回復と氷剣の反撃を止められ、壊し切れなければ本体が最大96 HPを一度だけ回復する。ソロ戦の途中から部屋を作っても、ソロ側に戻ったときの棺の使用済み記録を保持する。 [氷の棺の画面](../evidence/coop-drifting-snow-ice-coffin.png)

赤葉の根洞の不滅の副産物は、自分のHPを最大96使って蘇生の守りを張る。守りは6層で、直接攻撃2回につき1層が割れて次の小波を止める。全層を壊せば灼焔の華も中断できる。小波や灼焔の華が命中した際の回復は、何人に当たっても1回の展開につき最大72 HP。 [蘇生の守りの画面](../evidence/coop-immortal-construct-resurrection-guard.png)

| ボス | Lv | HP | 討伐参加者一人あたり | 依頼を報告した人 |
| --- | ---: | ---: | ---: | ---: |
| 游雪のブレードガーディアン | 148 | 1,200 | 1,868,400 EXP・560モラ | 10,800 EXP・730モラ |
| 不滅の副産物 | 142 | 1,260 | 1,298,650 EXP・550モラ | 10,600 EXP・720モラ |

Luaの4人試験で、展開前に始めた技や同じ技の多段ヒットを重ねて数えず、別々の参加者の攻撃で守りを削れることを確認した。HTTPの2人試験では退避からの再合流と保存、Chromeの2画面では同じ守りの残り量とダウン、個別報酬と受注者の依頼報告を確認した。 [Lua・HTTPの検証](../evidence/coop-snez-life-lua-http.json) · [游雪のChrome試走](../evidence/coop-drifting-snow-browser.json) · [不滅の副産物のChrome試走](../evidence/coop-immortal-construct-browser.json)

`python test_drifting_snow_field.py` と `python test_immortal_construct_field.py` でセーブを作り、`LAB_URL` を指定して `node test_coop_field_routes.mjs drifting-snow immortal-construct` を実行すると再現できる。現在の共闘は既存のラボ試作を使用する。 [後続の動作設計](field-boss-v1/SNEZHNAYA_QUARTET_MOVESETS.md)

## 波濤の投錨者

ノヴォキッチェヴの入口拠点で調査を受注し、探索路のx1030の門から西港の潮洞へ入る。Lv152、本体HPは1,160。飲み始めてからの新しい直接攻撃を全員で数え、4回分で止められる。雷は2回分に数え、豪胆値を3減らす。豪胆値が12に達すると勇躍し、薙ぎ払いの回数と錨の威力が増す。勇躍は時間でも解ける。 [勇躍中の錨と鎖](../evidence/coop-wavebinder-valiant-anchor.png)

Luaの4人試験では、参加者の時計が違っても受付前の攻撃を除外し、同じ多段攻撃は一度だけ数えることを確認した。薙ぎ払い・投錨・鎖は範囲に入った人に個別に当たる。ソロ戦の攻撃中に部屋を作った場合も、当たった人に同じ一撃が重複しない。HTTPの2人試験では、全員が探索路に退避してから戻っても飲酒の続きから再開した。 [Lua・HTTPの検証](../evidence/coop-wavebinder-lua-http.json)

討伐条件を満たした参加者には一人ずつ2,381,150 EXPと570モラが入り、受注者は報告時に11,200 EXPと750モラを受け取る。Chromeの2画面で戦闘から各自の保存と受注者の報告まで確認した。再試走には `python test_wavebinder_field.py` でセーブを作り、`LAB_URL` を指定して `node test_coop_field_routes.mjs wavebinder` を実行する。 [Chromeの検証](../evidence/coop-wavebinder-browser.json)

共闘には持続する豪胆値を使う現行試作を接続した。飲酒から三連錨までを一つの技にまとめる案は設計段階。 [現行の操作と後続案](field-boss-v1/SNEZHNAYA_WAVEBINDER.md)

## トワリンの週ボス戦

モンド城門広場で「風龍の再現戦・首の結晶」を受注し、南の街道のx1280から風龍の空域へ入る。Lv20。参加者は体勢24と本体HP600を共有する。前脚と頭で体勢を崩し、首の踏み場へ通常ジャンプで上がって結晶を攻撃する。 [共闘中の踏み場と結晶](../evidence/coop-dvalin-crystal.png)

攻撃の対象となる足場は、予告時に部屋へ先に入った組の操作キャラを基準に一つに決まる。その足場の範囲内にいる人にだけ攻撃が当たり、風弾や危険な床の命中間隔はキャラクターごとに進む。結晶が閉じると、乗っているキャラクターを載せたまま踏み場が床まで降りる。全員が空域を出ると戦闘は休止し、戻ると共有していた結晶HPから再開する。 [Lua・HTTPの検証](../evidence/coop-dvalin-lua-http.json)

体勢または結晶に有効打を入れ、通常の距離と時間の条件を満たしたLv20の参加者は、各自の討伐記録、3,450 EXP、300モラ、60秒の再出現待ちを保存できる。受注者は城門広場で1,400 EXPと360モラを受け取れる。自分の週ボス再出現待ちが続く間は、別の部屋の戦闘に参加しても討伐報酬を重ねて受け取れない。 [Chromeの2画面試走](../evidence/coop-dvalin-browser.json)

`python test_coop_dvalin.py` でLua・HTTP試験とLv20の試験用セーブを作り、`LAB_URL` を指定して `node test_coop_dvalin.mjs` でブラウザから通しプレイできる。 [ソロ戦と共通の戦闘ルール](weekly-boss-v1/DVALIN_WEB.md)

## 北風の王狼の週ボス戦

モンド城門広場で「王狼の再現戦・氷と北風」を受注し、南の街道のx940から狼の領の試練場へ入る。HP900を全員で削る。HPが半分以下になると、進行中の技を終えてから疾走試練へ一度だけ移る。左右の上段へ通常ジャンプで退避できる。被弾するのは走り込みと着地の範囲にいるキャラクターだけ。試練の後は鬣が白くなり、氷波・風刃・氷雨・咆哮・幻影が加わる。 [左右の上段への退避](../evidence/coop-andrius-upper-platforms.png) · [白い鬣の第2形態](../evidence/coop-andrius-awakened.png)

難度を指定して共闘するときは、部屋の仲間と同じ難度を入口で選ぶ。協力欄に仲間の難度が表示される。通常の依頼ルートからの入場や別難度の参加者は、同じ合言葉を使ったまま各試練を進められる。全員が同じ難度の試練から離れると、その戦闘は休止する。 [LuaとHTTPの検証](../evidence/coop-andrius-lua-http.json)

入門ではLv40で参加でき、現在の試作値では初回31,241 EXP・272,250モラ、再挑戦29,700 EXP・181,500モラ。初回かどうかを参加者ごとの討伐記録で判定する。受注者は城門広場で1,600 EXPと390モラを受け取る。Chromeで2人とも入門を選び、左右に分かれて上段へ退避し、討伐から保存と依頼報告まで通した。 [Chromeの検証](../evidence/coop-andrius-browser.json)

`python test_coop_andrius.py` でLua・HTTP試験を再現できる。Chromeの試走には `python test_weekly_difficulty_rewards.py` でLv40の試験用セーブを作り、`LAB_URL` を指定して `node test_coop_andrius.mjs` を実行する。 [王狼の戦闘仕様](weekly-boss-v1/ANDRIUS_WEB.md)

## 公子の週ボス戦

璃月・港の広場で「黄金屋の再現戦・水と雷」を受注し、x1040の門から黄金屋へ。水弓240、邪眼300、魔王武装420のHPを全員で削る。変身中は攻撃が通らず、前の形態の余剰ダメージ・弾・断流は移行時に消える。 [魔王武装への変身](../evidence/coop-childe-foul-legacy.png)

断流はプレイヤーの組ごとに一つ付き、操作を交代すると印も移る。金灯に触れて解除できるのは、自分の印だけ。追雨と水鯨は水断流のある組、追雷は雷断流のある組を対象に選ぶ。候補が複数いる場合は、その試練に入った順で選ぶ。追雷を受ける組が地点固定の前に解除または退場すると中止する。固定後は予告地点に落ち、範囲内のキャラクターに個別に当たる。 [同行者への断流の引き継ぎ](../evidence/coop-childe-riptide.png) · [LuaとHTTPの検証](../evidence/coop-childe-lua-http.json)

Lv28の通常ルートでは、討伐に参加した一人ずつに14,700 EXP・560モラと再出現待ちが入る。受注者が璃月・港の広場で報告すると18,000 EXP・1,800モラを受け取る。Chromeの2画面で、相手側の断流表示、交代と解除、三形態の討伐、各自の保存、依頼報告まで確認した。 [Chromeの検証](../evidence/coop-childe-browser.json)

`python test_childe_weekly.py` でソロ回帰と試験用セーブを生成できる。`python test_coop_childe.py` でLua・HTTPの共闘試験を行い、`LAB_URL` を指定して `node test_coop_childe.mjs` でChromeの試走を再現できる。 [公子の戦闘仕様](weekly-boss-v1/CHILDE_WEB.md)

## 若陀龍王の週ボス戦

璃月・港の広場で「伏龍の再現戦・二つの地脈」を受注する。受付で仲間と同じ元素の組み合わせを選び、x635の門から伏龍の再現戦へ入る。難度を指定する場合は難度も合わせる。異なる組み合わせや難度を選んだ参加者は、それぞれの試練を同じ合言葉の部屋で進められる。協力欄に仲間の組み合わせが出る。

HP1,500を全員で削り、2/3と1/3で地脈の吸収が始まる。尾が地上に出た後も、同じ本体HPを削る。雷の尾戦は左・中央・右の順に安全帯が移る。地裂や範囲攻撃は、当たったキャラクターごとに数える。 [水の地脈を吸収](../evidence/coop-azhdaha-absorption.png) · [尾戦の安全帯](../evidence/coop-azhdaha-tail.png)

元素刻印は被弾したキャラクターに付き、操作を交代してもそのキャラクターに残る。新しく盾を得ると自分の刻印が消える。命中直前に盾があれば、その一撃で盾が割れても刻印は付かない。Lv32の通常ルートでは、参加条件を満たした各自に17,700 EXP・660モラが入り、依頼の受注者は報告時に24,000 EXP・2,200モラを受け取る。 [Lua・HTTPの検証](../evidence/coop-azhdaha-lua-http.json) · [Chromeの2画面試走](../evidence/coop-azhdaha-browser.json)

`python test_coop_azhdaha.py` でLua・HTTPを、`python test_azhdaha_weekly.py` でソロ戦とブラウザ試験用のセーブを確認できる。`LAB_URL` を指定して `node test_coop_azhdaha.mjs` を実行すると、Chromeで水＋雷の二度の吸収、尾の討伐、報告まで再現できる。 [若陀龍王の戦闘仕様](weekly-boss-v1/AZHDAHA_WEB.md)

## 淑女の週ボス戦

稲妻・城下の広場で「天守の再現戦・氷と焔」を受注し、x995の入口から天守へ進む。氷480、炎800のHPと、間にある繭の耐久100を全員で削る。紅蓮蛾を拾った組は、操作を交代しても持ち続ける。取得後の新しい手動攻撃を繭に当てると1匹を使い、耐久を25削る。同じ蛾に同時に触れた場合は、先に試練に入った組が拾う。手動攻撃の受付間隔30tickは組ごとに進む。 [氷の繭と紅蓮蛾](../evidence/coop-signora-cocoon.png)

極寒・灼熱の蓄積は旅人と同行者の組ごとに進み、環境ダメージはその組の操作キャラが受ける。危険な床の接触はキャラクターごとに当たる。左右の温度装置と再充填は全員で共有し、Gの長押しで放出すると装置の近くにいる組の温度だけが0になる。周囲の危険床は消える。炎形態に移ると全員の温度が0から始まる。 [炎形態の画面](../evidence/coop-signora-flame.png)

全員が天守を出て戻っても、繭の耐久は続きから再開する。退出した組が持っていた蛾と温度は片付け、次の補充でも蛾を拾える。Lv44の通常ルートで、討伐条件を満たした各自に44,850 EXP・860モラ、依頼を報告した人に36,000 EXP・3,000モラが入る。 [LuaとHTTPの検証](../evidence/coop-signora-lua-http.json) · [Chromeの2画面試走](../evidence/coop-signora-browser.json)

`python test_coop_signora.py` でLua・HTTP試験を再現できる。`python test_signora_weekly.py` で試験用セーブを作り、`LAB_URL` を指定して `node test_coop_signora.mjs` を実行すると、Chromeで装置、繭、炎形態、討伐と報告まで確認できる。 [淑女の戦闘仕様](weekly-boss-v1/SIGNORA_WEB.md)

## 雷電将軍の週ボス戦

稲妻・城下の広場でLv48の「悪曜の再現戦・追念の花蕊」を受注し、x1305の入口から進む。HP1,500、凶運、装甲100、雷眼を共有する。残影を攻撃するときは、攻撃した組の操作キャラに最も近い残影を狙う。装甲への手動攻撃は各キャラにつき30tickに1回、全員で1秒に4まで削れる。 [週ボスの戦い方](weekly-boss-v1/RAIDEN_WEB.md)

共闘中に発生する花蕊は中央に現れる。複数のキャラが通常攻撃を当てて合計5回、または新しい雷攻撃1回で保護域が開く。大太刀が落ちる瞬間に保護域の内側にいるキャラは無傷で、外側ではそれぞれ通常のダメージ計算を通る。大太刀1回につき装甲が30減り、崩壊後は8秒間攻撃できる。 [花蕊の保護域](../evidence/coop-raiden-dome.png) · [装甲崩壊](../evidence/coop-raiden-collapse.png)

全員で会場から広場へ退避すると戦闘が止まり、再入場時に続きから再開する。試練に残った全キャラが倒れると、HP・凶運・装甲・花蕊を初期化する。Lv48の通常ルートでは、討伐条件を満たした各自に61,050 EXP・980モラ、受注者の報告に44,000 EXP・3,400モラが入る。 [LuaとHTTPの結果](../evidence/coop-raiden-lua-http.json) · [Chromeの2画面試走](../evidence/coop-raiden-browser.json)

`python test_coop_raiden.py` でLua・HTTP試験を再現できる。`python test_raiden_weekly.py` で試験用セーブを作り、`LAB_URL` を指定して `node test_coop_raiden.mjs` を実行すると、Chromeで花蕊の共同充填、個別の防護、装甲崩壊、討伐と報告を確認できる。

## 正機の神の週ボス戦

スメール・樹陰の広場で部屋を作り、Lv64の「工房の再現戦・端末と胸部」を受注してx950から入る。上半身590・全身1,040のHPと、充填100、後半の装甲100を全員で共有する。ブロックは操作キャラが拾い、同じブロックを同時に踏んだときは先に入場した組が拾う。左右の雷装置は別々の人が動かしても過負荷が起きる。 [上半身戦](../evidence/coop-shouki-upper.png)

端末は充填100で一人が予約できる。予約者の画面に照準、確定、中止が出て、他の画面には予約者の参加番号が出る。発射前の交代・退避・離席判定で予約を解き、充填は残る。発射時に100を使い、会場に仲間が残っていれば発射した人が退避しても弾は進む。装甲中の胸部への命中は装甲を25削る。 [予約中の戦闘画面](../evidence/coop-shouki-terminal.png)

滅度機は4基を全員で処理し、各組が自分の同行者の支援先を指定できる。各基の破壊で25ずつ充填され、4基を壊してから端末弾を胸部に当てると10秒間攻撃できる。装甲や滅度機への有効打も参加判定に含まれる。全員で広場へ退避した間は進行が止まり、残った全キャラが倒れると初期状態から再戦になる。 [滅度機](../evidence/coop-shouki-pods.png) · [神機崩落](../evidence/coop-shouki-exposure.png)

Lv64の通常ルートでは、討伐条件を満たした各自に119,850 EXP・1,370モラ、受注者の報告に80,000 EXP・5,200モラが入る。`python test_coop_shouki.py` でLua・HTTP試験を再現できる。`python test_shouki_weekly.py` で試験用セーブを作り、`LAB_URL` を指定して `node test_coop_shouki.mjs` を実行すると、Chromeの2画面で端末から討伐・報告まで確認できる。 [LuaとHTTPの結果](../evidence/coop-shouki-lua-http.json) · [Chromeの結果](../evidence/coop-shouki-browser.json)

## アペプのオアシス守護者の週ボス戦

スメール・樹陰の広場でLv68の「オアシスの再現戦・心の防衛」を受注し、x780から入る。暗色560・緑1,020のHPと、防衛の進行度を全員で共有する。進行度は25から始まり、取り巻き撃破や時間経過で増え、心を攻撃されると減る。同時に起きた効果は一度まとめて反映する。取り巻きの上限は8体。 [心の防衛](../evidence/coop-apep-defense.png)

小弾は最初に接触したキャラか心に一度だけ当たる。心に向かった弾をキャラが受け止めることもできる。障壁は全員を止め、各組は自分の同行者に攻撃する壁を指定できる。広場に全員が退避すると防衛が休止し、再入場で続きから再開する。残った全キャラが倒れると初期状態から再戦する。

緑の守護者の余波は、三つのドームのいずれかに足元と体が収まっているキャラが防げる。横の位置が合っていても上段が保護域の高さを超える場合は被弾する。最後の余波のあとには8秒の攻撃機会がある。 [ドームと余波](../evidence/coop-apep-domes.png) · [余波後の反撃](../evidence/coop-apep-exposure.png)

Lv68の通常ルートでは、討伐条件を満たした各自に160,050 EXP・1,500モラ、受注者の報告に90,000 EXP・5,600モラが入る。

Lua・HTTPの検証は `python test_coop_apep.py` で再現できる。Chromeでは `python test_apep_weekly.py` で試験用セーブを作り、`LAB_URL` を指定して `node test_coop_apep.mjs` を実行する。 [LuaとHTTPの結果](../evidence/coop-apep-lua-http.json) · [Chromeの結果](../evidence/coop-apep-browser.json)

## 呑星の鯨の週ボス戦

フォンテーヌ・水辺の広場でLv84の「星海の再現戦・幻形の核」を受注し、x700から入る。鯨のHP2,200、敵意100、渦の眼への命中8回を共有する。飲み込みが始まると、会場にいる組は同時に腹中に移る。生存者のHP、クールダウン、光界ゲージを引き継ぎ、旧戦場の攻撃や予約を片付ける。 [星海の渦の眼](../evidence/coop-narwhal-eye.png)

腹中では別の耐久を持つ幻影と戦う。核が開いてからの新しい手動攻撃4回を、複数人で分担できる。再入場や途中参加では、部屋が進行中の戦場に合流する。難度選択で入った戦闘は通常ルートと独立して進む。全員で広場へ退避した間は戦闘が止まり、残った全キャラが倒れると星海の初期状態から再戦になる。 [腹中の幻形の核](../evidence/coop-narwhal-kernel.png)

幻影撃破後は星海に戻り、鯨に最大HPの20％に相当する440ダメージが一度入る。衰弱の10秒間に攻撃できる。通常ルートで討伐条件を満たした各自に339,450 EXP・2,500モラ、受注者の報告に230,000 EXP・8,500モラが入る。 [星海への帰還](../evidence/coop-narwhal-return.png)

Lua・HTTPの検証は `python test_coop_narwhal.py` で再現できる。Chromeでは `python test_narwhal_weekly.py` で試験用セーブを作り、`LAB_URL` を指定して `node test_coop_narwhal.mjs` を実行する。 [LuaとHTTPの結果](../evidence/coop-narwhal-lua-http.json) · [Chromeの結果](../evidence/coop-narwhal-browser.json)

## 召使の週ボス戦

フォンテーヌ・水辺の広場でLv88の「凶月の再現戦・命の契約」を受注し、x186の門から入る。片鎌1,080・凶月の双鎌1,320のHPを共有する。「血償の宣告」は各組の操作キャラに契約を付ける。斬撃による付与、侵食、回復の返済、羽印はキャラごとに判定する。 [戦い方](weekly-boss-v1/KNAVE_WEB.md)

同じ返済灯を複数人で使える。各キャラが長押しすると45tick後に初回の返済が起こり、以後30tickごとに返済する。片方が手を離しても、もう片方は返済を続けられる。交代や変身でも契約と羽印は元のキャラに残り、変身中は侵食の時計が止まる。退避した組の契約と羽印は消え、戦場にいる仲間は続行できる。 [同じ返済灯の使用](../evidence/coop-knave-lamp.png)

赤宴の受付中に羽印を持つキャラのH「償還の一撃」が当たると、その赤宴を中断する。同時に当てた場合は最初に成立した一撃だけが羽印を使い、他のキャラは印を保持する。残りの攻撃は消え、全員が3.6秒の反撃時間を使える。討伐条件を満たした各自に444,900 EXP・2,800モラ、受注者の報告に280,000 EXP・9,600モラが入る。 [赤宴の中断](../evidence/coop-knave-interrupt.png) · [双鎌](../evidence/coop-knave-double.png)

Lua・HTTPの検証は `python test_coop_knave.py` で再現できる。Chromeでは `python test_knave_weekly.py` で試験用セーブを作り、`LAB_URL` を指定して `node test_coop_knave.mjs` を実行する。 [LuaとHTTPの結果](../evidence/coop-knave-lua-http.json) · [Chromeの結果](../evidence/coop-knave-browser.json)

## 蝕まれし源焔の主の週ボス戦

ナタ・谷の集落でLv104の「源焔の再現戦・虚界の障壁」を受注し、x351から入る。HP2,900と床を共有する。床は左端が88pxずつ最大3回崩れ、足場の幅が880pxから616pxまで縮む。落下したキャラだけに最大HPの25％相当の通常ダメージを要求し、生存者を安全な床に戻す。 [最初の床切断](../evidence/coop-primal-fire-cut.png) · [三回切断後](../evidence/coop-primal-fire-narrow.png)

障壁12、擬態芽4、三柱の各6は全員で削る。通常攻撃で1、元素攻撃で2を削り、同じキャラが同じ対象を削る間隔は24tick。ほかの人は同じ刻みに攻撃できる。期限前に試練を解くと8秒間攻撃でき、期限切れの衝撃は各キャラに判定する。 [虚界の障壁](../evidence/coop-primal-fire-gate.png) · [三柱](../evidence/coop-primal-fire-pillars.png)

蝕破は付いたキャラが120tick後に受け、交代しても引き継ぎ先は変わらない。退避した組の蝕破は消える。全員が広場へ出ると戦闘は止まり、戻ると床と障壁の続きから再開する。全滅時は床も復元する。通常ルートで討伐条件を満たした各自に637,200 EXP・3,400モラ、受注者の報告に420,000 EXP・12,800モラが入る。

Lua・HTTPは `python test_coop_primal_fire.py` で再現できる。Chromeでは `python test_primal_fire_weekly.py` で試験用セーブを作り、`LAB_URL` を指定して `node test_coop_primal_fire.mjs` を実行する。 [LuaとHTTPの結果](../evidence/coop-primal-fire-lua-http.json) · [Chromeの結果](../evidence/coop-primal-fire-browser.json)

## 扉に通ずる対局の週ボス戦

モンド・城門広場でLv112の「扉の対局・駒を誘う」を受注し、x442の入口から入る。前半の駒王900・女王駒620と、後半のキング1,100・クイーン1,000のHPを共有する。最初の3体のポーンには、右側にいる誘導役が突進を1体ずつ当てる。走路確定前に誘導役が離れた場合は選び直し、確定後は同じ終点まで進む。 [ポーンのある盤面](../evidence/coop-gate-pawns.png)

盤の左右の霜印は一人ずつ使う。操作中の旅人番号が見え、Gの長押しを終えるたびに凍結値が50増える。共有の待ち時間は2秒。被弾や途中退出で長押しは途切れるが、完了分は残る。クイーンの凍結後は誘導役がクイーンの向こう側に移動する。キングがクイーンに衝突すると津波が止まり、全員が6秒間反撃できる。 [固定された走路](../evidence/coop-gate-lure.png) · [反撃時間](../evidence/coop-gate-exposure.png)

片方が倒れると相方がHPを譲る。合計HPは譲渡前後で変わらず、成功は1戦に2回まで。二体を同じ一撃で倒したときは譲渡を挟まず討伐になる。通常ルートでは討伐条件を満たした各自に1,054,500 EXP・4,200モラ、受注者の報告に570,000 EXP・16,100モラが入る。 [HP譲渡](../evidence/coop-gate-transfer.png)

`python test_coop_gate.py` でLua・HTTP検査を再現する。`python test_gate_weekly.py` で試験用セーブを作り、`LAB_URL` を指定して `node test_coop_gate.mjs` を実行するとChromeの2画面で再現できる。 [戦い方](weekly-boss-v1/GATE_WEB.md) · [LuaとHTTPの結果](../evidence/coop-gate-lua-http.json) · [Chromeの結果](../evidence/coop-gate-browser.json)

## 「博士」・偽月の異端者の週ボス戦

ナド・クライ・町の広場でLv132の「偽月の再現戦・裂け目の向こう」を受注し、x210から入る。HPは3,400。停止と直視の禁令は組ごとに判定し、罰は違反した組の操作キャラだけに当たる。柱の保護枠ではキャラごとに衝撃を防ぐ。 [個人の禁令](../evidence/coop-false-moon-law.png) · [柱の保護枠](../evidence/coop-false-moon-ward.png)

裂け目でHを押すと自分の同意を登録する。戦場に接続中の生存組が全員同意すると確認が始まる。異界への移動が確定するまでは取り消しができ、新しく戦場に入った組の同意も必要になる。途中から異界に合流した場合は、残っている擬影と損傷予算を引き継ぐ。 [入場の同意](../evidence/coop-false-moon-vote.png) · [共有する異界](../evidence/coop-false-moon-rift.png)

擬影3体の撃破、出口での全員同意、時間切れのいずれかで外界に帰る。帰還時に倒した擬影1体につき136を一度だけ適用し、1戦の合計は816まで。予算を使い切っても帰還後に6秒間反撃できる。通常ルートの討伐条件を満たした各自に2,964,300 EXP・5,500モラ、受注者の報告に840,000 EXP・21,200モラが入る。 [帰還後の反撃](../evidence/coop-false-moon-returned.png)

`python test_coop_false_moon.py` でLua・HTTP検査を再現する。`python test_false_moon_weekly.py` で試験用セーブを作り、`LAB_URL` を指定して `node test_coop_false_moon.mjs` を実行するとChromeの2画面で再現できる。 [戦い方](weekly-boss-v1/FALSE_MOON_WEB.md) · [LuaとHTTPの結果](../evidence/coop-false-moon-lua-http.json) · [Chromeの結果](../evidence/coop-false-moon-browser.json)

## ドットーレ・左道の真諦者の週ボス戦

スメール・樹陰の広場でLv144の「左道の再現戦・結合点」を受注し、x222から入る。第一形態のHPは1,650、第二形態は2,250で、人数にかかわらず全員で同じHPを削る。第一形態を倒すと4秒かけて光背を構築する。 [形態移行](../evidence/coop-heretic-change.png)

左右どちらかの結合点に合計3回当てると、両方の結合点と押し壁が消えて本体の詠唱を中断できるようになる。押し壁の穴は床側と上段で交互に開く。穴の外に触れたキャラは約31px押される。押し壁によるHPダメージはない。 [押し壁と結合点](../evidence/coop-heretic-wall.png)

本体の詠唱には30秒以内に合計24回の有効打を当てる。同じキャラから同じ対象への受付は12tick間隔で、別のキャラは同じtickに命中できる。期限ちょうどの最終打まで受け付ける。成功すると1秒後から12秒間反撃できる。模倣の王と后は低い走路を進み、命中はキャラごとに判定する。 [詠唱の残数](../evidence/coop-heretic-chant.png) · [反撃時間](../evidence/coop-heretic-exposure.png)

全員で退避すると戦闘が止まり、戻ると同じ結合点と詠唱の続きから再開する。全滅時は第一形態から再戦する。通常ルートの討伐条件を満たした各自に4,398,300 EXP・6,600モラ、受注者の報告に1,230,000 EXP・26,500モラが入る。

`python test_coop_heretic.py` でLua・HTTP検査を再現する。`python test_heretic_weekly.py` で試験用セーブを作り、`LAB_URL` を指定して `node test_coop_heretic.mjs` を実行するとChromeの2画面で再現できる。 [戦い方](weekly-boss-v1/HERETIC_WEB.md) · [LuaとHTTPの結果](../evidence/coop-heretic-lua-http.json) · [Chromeの結果](../evidence/coop-heretic-browser.json)

## 測潮機関士と双杼織機の週ボス戦

璃月・港の広場で、測潮機関士の「夜間の潮位点検」と双杼織機の「夜明けまでに織機を止める」を各自で受注する。港のx1120からLv30の潮位較正室、x1240からLv34の埋もれた織房へ入れる。 [測潮機関士](weekly-boss-v1/TIDE_SURVEYOR_WEB.md) · [双杼織機](weekly-boss-v1/TWIN_SHUTTLE_LOOM_WEB.md)

測潮機関士のHP650と三つの段階は全員で共有する。測距印は被弾したキャラに付き、緑の接地板でそのキャラだけが解除できる。印が残った状態で反響パルスを受けると、追加ダメージ12が入る。 [測距印と接地板](../evidence/coop-original-weeklies-surveyor-mark.png)

双杼織機は芯のHP250、杼は左右それぞれHP24。左右の杼を分担でき、片方を壊すとその側の糸だけが止まる。両方を壊すと芯が13秒間開く。時間切れでは杼が再生し、芯の残りHPを引き継ぐ。杼への有効打も討伐の参加判定に入る。 [閉じた織機](../evidence/coop-original-weeklies-loom-closed.png) · [露出した芯](../evidence/coop-original-weeklies-loom-open.png)

全員が退避すると戦闘は止まり、戻ると続きから再開する。全滅すると初期状態から再戦する。討伐条件を満たした各自に、測潮機関士は17,700 EXP・340モラ、双杼織機は17,700 EXP・360モラが入る。依頼の報告も各自で行う。 [LuaとHTTPの結果](../evidence/coop-original-weeklies-lua-http.json) · [Chromeの結果](../evidence/coop-original-weeklies-browser.json)

## 赤璋巡岳府君とシネアスの共闘

赤璋巡岳府君・移即と天虞は、沈玉の谷・谷の南東の草段からLv95で「赤璋の丘」へ入る。移即と天虞のHP1,060を共有する。同じ範囲攻撃が両方に届いても、共有HPが減るのはその一撃につき一度。炎の踏み込みと氷の輪の予告は、全員の画面で同じ位置と順番に出る。 [炎と氷の予告](../evidence/coop-branch-legends-chizhang-warning.png)

シネアスは、往日の海・東端の別室からLv160で石床へ入る。入場には各自が「珊瑚の間の水の通り道」を報告している必要がある。HP1,320と突進や潮の予告は共有し、命中はキャラの位置と高さで決まる。 [潮の予告](../evidence/coop-branch-legends-cineas-warning.png)

全員で戦闘を離れると進行が止まり、未討伐なら続きから再開する。討伐後は全員が出口を通ると再戦できる。条件を満たした各自に、赤璋巡岳府君は231,550 EXP・280モラ、シネアスは2,816,850 EXP・440モラが入る。 [LuaとHTTPの結果](../evidence/coop-branch-legends-lua-http.json) · [Chromeの結果](../evidence/coop-branch-legends-browser.json)

## 湖辺のヴィヴィアンとニニアンの共闘

ヴィヴィアンはフォンテーヌ廷・市外北の坂、ニニアンはフォンテーヌ南部・西岬の洞口から入る。どちらも入口で部屋を作成・参加でき、門を通るには各自がLv100に達している必要がある。共有HPはヴィヴィアン1,040、ニニアン1,010。 [入場経路とドット絵](FONTAINE_LAKE_LEGENDS_WEB.md)

ヴィヴィアンの水波は予告された道筋に沿って進む。地上に離れて立つと別々の時点で当たり、跳んで越えられる。ニニアンの水柱は予告時の位置に立ち上がるので、横に離れてかわす。二段攻撃では水柱の後に低い返し波が来る。両方の戦闘で、共闘中も第5稿Aのドット絵を使う。 [ヴィヴィアンの水波](../evidence/coop-lake-legends-vivianne-warning.png) · [ニニアンの予告](../evidence/coop-lake-legends-ninianne-warning.png)

全員が退避すると戦闘が止まり、戻ると残りHPを引き継ぐ。討伐後は全員が出口を通ると再戦できる。参加条件を満たした各自に212,400 EXP、300モラ、個別の討伐記録が入る。 [LuaとHTTPの結果](../evidence/coop-lake-legends-lua-http.json) · [Chromeの結果](../evidence/coop-lake-legends-browser.json)

## フォンテーヌの陸上地方伝説5戦

各戦の入口で部屋を作り、Lv100の参加者が同じ門を通ると共闘に入る。ボスHPと二段攻撃の予告位置・順序を共有し、被弾はキャラごとの位置と高さで判定する。ロッキーの一撃目は本人が踏み込むため、狭い命中範囲が予告の中を進む。 [入口と攻略](FONTAINE_DRY_LEGENDS_WEB.md)

| 挑戦 | 共有HP | 参加者ごとの討伐報酬 | 戦闘画面 |
| --- | ---: | --- | --- |
| イゾルト | 1,020 | 212,400 EXP・300モラ | [霜の二列](../evidence/coop-dry-legends-yseut-warning.png) |
| 自律スーパー・コンピューティング型力場生成装置 | 1,230 | 212,400 EXP・360モラ | [二段の圧力区画](../evidence/coop-dry-legends-gravity-device-warning.png) |
| ロッキー・アヴィルドセン | 980 | 212,400 EXP・300モラ | [踏み込みと二撃目](../evidence/coop-dry-legends-rocky-warning.png) |
| リアム | 1,000 | 212,400 EXP・300モラ | [二つの着弾地点](../evidence/coop-dry-legends-liam-warning.png) |
| スネージヴナのディアンナラ | 1,130 | 212,400 EXP・330モラ | [風圧の二列](../evidence/coop-dry-legends-deianeira-warning.png) |

ディアンナラ戦は湾東の岬と水洞でも部屋を作れる。扉を開けるには各自が「水洞の奥の圧力扉」を報告する。報告が済んだ参加者が先に研究室へ入り、後から報告した参加者が同じ部屋に合流できる。全員が水洞に退けば戦闘が止まり、戻ると残りHPから再開する。討伐後は全員が出口を通ると再戦できる。 [LuaとHTTPの結果](../evidence/coop-dry-legends-lua-http.json) · [Chromeの結果](../evidence/coop-dry-legends-browser.json)

## オーシャン巡回法官と鉄皮の子爵の水中共闘

オーシャン巡回法官は中央湖の深い標識、鉄皮の子爵はベリル地下の見張り棚か排熱水洞で部屋を作る。各自Lv100で入場できる。鉄皮の子爵の門には、各自の「ベリル地下の排熱門」の報告も必要。報告を終えた仲間が先に入り、後から報告した仲間も同じ部屋に合流できる。 [巡回法官の入口](FONTAINE_OCEAN_JUDGE_WEB.md) · [鉄皮の子爵の依頼](FONTAINE_IRON_VISCOUNT_WEB.md)

巡回法官はHP1,050。押し波は全員に同じ深さで表示され、上下へ離れれば避けられる。装甲が閉じた間は、正面の水撃より背後の水撃が通る。鉄皮の子爵はHP1,180。受け止め可能な波にKを合わせたキャラは、次のJで反撃できる。同じ波を受けた仲間は、自分の位置とガードの有無で結果が決まる。 [巡回法官の押し波](../evidence/coop-aquatic-crabs-ocean-judge-wave.png) · [鉄皮の子爵の反撃画面](../evidence/coop-aquatic-crabs-iron-viscount-counter.png)

水中では移動と門の操作を案内し、戦闘の水域に入ると水撃・急回避・その戦闘で使える水中技のボタンを表示する。キーボードではJを長押しして水撃を繰り返せる。

全員が退避すると戦闘を保持し、戻ると残りHPから再開する。討伐後は全員が出口を通ると再戦できる。条件を満たした各自に212,400 EXP、巡回法官は320モラ、鉄皮の子爵は345モラと、個別の討伐記録が入る。 [LuaとHTTPの検証](../evidence/coop-aquatic-crabs-lua-http.json) · [Chromeの検証](../evidence/coop-aquatic-crabs-browser.json)

ソロ試験の `test_ocean_judge.py` と `test_iron_viscount.py` でセーブを生成し、`python -X utf8 test_coop_aquatic_crabs.py` でLuaとHTTPの検証を実行する。サーバーのURLを `LAB_URL` に設定して、`node test_coop_aquatic_crabs.mjs` でChromeの2人試走を再現できる。

## 双生妖精の騎士と深谷の剣の水中共闘

双生妖精の騎士は南の沈水層の入口、深谷の剣は北の水底の坂で部屋を作る。各自Lv100で門を通ると同じ水域で戦える。双生妖精の騎士はアンジェリカとミドロが初手で上・下の順に水刃を放ち、深谷の剣はコルタナとモーグレイが上下同時に放つ。全員に同じ深さと発射順が見え、二本の間へ泳いで避けられる。 [双生妖精の騎士の予告](../evidence/coop-ray-pairs-fairy-knight-twins-blades.png) · [深谷の剣の同時攻撃](../evidence/coop-ray-pairs-swords-of-the-gorge-blades.png)

二体は一つのHPを共有する。どちらに水撃を当てても減り、二体が重なったところに一度撃った場合も一発ぶん減る。双生妖精の騎士はHP910で、討伐の参加条件を満たした各自に212,400 EXP・355モラ。深谷の剣はHP980で、各自に212,400 EXP・370モラ。各戦の討伐記録は一人につき1件入る。全員で退避した場合はHPを引き継ぎ、討伐後に全員が出口を通ると再戦できる。 [LuaとHTTPの結果](../evidence/coop-ray-pairs-lua-http.json) · [Chromeの結果](../evidence/coop-ray-pairs-browser.json)

## 消えゆく老兵・ドアーチュ・ルケアの水中共闘

消えゆく老兵と隠者の王・ドアーチュは、潜伏中に波紋の方向へKを使う。探知が届くと、発射済みの水弾も消え、約2.3秒間は全員が姿を見てJで攻撃できる。Kの再使用待ちは押した人にだけ付き、露出中にもう一度Kを押しても反撃時間は延びない。極彩色のルケアは、本体と命中範囲が予告どおり同じ深さを進む。離れた位置にいる仲間には別々の時点で届き、上下に外れれば回避できる。

| 挑戦 | 共闘部屋を作れる入口 | 共有HP | 参加者ごとの討伐報酬 | 戦闘画面 |
| --- | --- | ---: | --- | --- |
| 消えゆく老兵 | 南の水底のトンネル | 985 | 212,400 EXP・375モラ | [探知で姿を現した場面](../evidence/coop-aquatic-hunts-fading-veteran-reveal.png) |
| 隠者の王・ドアーチュ | 市街西の水底 | 1,050 | 212,400 EXP・390モラ | [探知後の反撃時間](../evidence/coop-aquatic-hunts-dobharcu-reveal.png) |
| 極彩色のルケア | 水門西の深い棚 | 1,040 | 212,400 EXP・402モラ | [水平突進の命中範囲](../evidence/coop-aquatic-hunts-luachra-dash.png) |

門を通るには各自Lv100が必要。全員が退避すると残りHPを引き継ぎ、討伐後に全員が出口を通ると再戦できる。 [LuaとHTTPの結果](../evidence/coop-aquatic-hunts-lua-http.json) · [Chromeの結果](../evidence/coop-aquatic-hunts-browser.json)

## シャサニョンと魔剣クルージュの水中共闘

シャサニョンは湾の南の沈水溝か塔の圧力室で部屋を作る。「モルテの塔の水門調査」の報告前は塔外、報告後は塔内の門から入る。別々の入口から来た二人は、各自の背景を見ながらHPと泡を共有する。帰りは各自が使える門へ戻る。魔剣クルージュは工房の地下入口かエリニュスの根の地下水脈で部屋を作れる。割れ目の門には各自の「エリニュスの根へ続く水脈」の報告が必要。両戦とも各自Lv100。 [シャサニョンの経路](FONTAINE_BUBBLE_ARENAS_WEB.md) · [クルージュの経路](FONTAINE_CORROUGE_WEB.md)

届く深さで泡に向いてKを押すと、返された泡が本体へ向かう。同じ泡を返せるのは一度で、命中時に返したキャラへ貢献を付ける。返した人が退いても仲間が戦場に残れば泡は進む。全員が退けば飛んでいる途中で止まり、同じ部屋に戻ったときに続く。シャサニョンは動く泡、クルージュは爆発前の止まった泡を返せる。 [塔外のシャサニョン](../evidence/coop-bubble-returns-chassanion-outside.png) · [塔内のシャサニョン](../evidence/coop-bubble-returns-chassanion-inside.png) · [クルージュへの泡返し](../evidence/coop-bubble-returns-corrouge-return.png)

Chromeの2画面で、泡を1個返すとシャサニョンのHPが1,125から969に、クルージュは1,190から1,028に減った。Luaでは、返した人が着弾前に町で物理ダメージを25%上げる装備に替えても、戦場に残った泡は同じダメージで当たった。 [LuaとHTTPの結果](../evidence/coop-bubble-returns-lua-http.json) · [Chromeの結果](../evidence/coop-bubble-returns-browser.json)

討伐に参加した各自に212,400 EXPと、シャサニョンは410モラ、クルージュは430モラが入る。各自が討伐記録を保存し、全員が出口を通ると再戦できる。これで、ラボの水中地方伝説9戦がローカル共闘に対応した。

## マッシュラプトル

Lv60で雨林の道から菌傘の谷へ進む。本体HPは800。ついばみの当たり判定、跳躍の着地地点、3回の胞子の位置を共有し、各参加者が個別に被弾する。跳躍中は本体の絵と当たり判定が一緒に上がる。Luaの4人戦で各自の被弾を、HTTPの2人戦で退避後の再合流と討伐保存を確認した。Chromeの2画面で同じ着地と胞子を確認し、討伐に参加した双方に39,950 EXPと180モラが入った。試験用のセーブは `python test_jadeplume_field.py` で生成し、`node test_coop_jadeplume.mjs` で再現できる。 [Lua・HTTPの検証](../evidence/coop-jadeplume-lua-http.json) · [Chromeの検証](../evidence/coop-jadeplume-browser.json) · [跳躍中の画面](../evidence/coop-jadeplume-leap.png)

## 確認したこと

- HTTPで、既存の敵6体とHP15の先頭の敵を確認した。2人の有効打を同じ敵に入れ、1回の撃破から双方への個別報酬、受注の有無による討伐カウント、異なる指定セットの落下品を確認した。ドロップ試験は抽選シードを指定した。 [試験の記録と応答計測](../evidence/coop-local-http.json)
- Chromeの2つのプロフィールを各々町から徒歩で進め、相手と同行者の表示、共通の敵の撃破、M地図を開いている間の進行、再読み込み、部屋にいる間の保存、退出、390px幅を確認した。 [2人と同行者の表示](../evidence/coop-local-browser.png) · [Chromeの検証](../evidence/coop-local-browser.json)
- 4人のHTTP試験では、同じ敵が15→11→7→3→0と減り、全員の有効打と1回ずつの報酬を確認した。2人だけが受注した依頼はその2人だけが進み、聖遺物は各自の指定セットになった。満員時の5人目の拒否と、4人目が読み込み直した場合の合流も確認した。 [4人の戦闘記録](../evidence/coop-local-http.json)
- Chromeで4つのプロフィールを同じ部屋に入れ、全画面に他の3組が表示されることと、4人目の再読み込み後の合流を確認した。PNGと軽量16色を両方表示した。 [4人のPNG](../evidence/coop-four-browser.png) · [4人の軽量16色](../evidence/coop-four-light-browser.png)

## 描画データと通信量

協力部屋のブラウザには、同じ絵の矩形データを1フレームにつき1組送り、描画位置と向きはキャラごとに送る。ブラウザ側で元と同じ順に矩形を描く。標準・32色・16色の3設定で全矩形の座標、色、不透明度が従来の出力と一致した。32 KiB以上の応答は、クライアントが受け付けるときにgzipで圧縮する。

| 人数・描画 | 従来の応答サイズ | 新方式の応答サイズ | 1人あたりの応答数/秒 |
| --- | ---: | ---: | ---: |
| 2人・PNG | 13.4 kB | 13.4 kB | 30.0 |
| 4人・PNG | 14.9 kB | 14.9 kB | 30.0 |
| 2人・軽量16色 | 368.0 kB | 17.9 kB | 19.0 → 30.0 |
| 4人・軽量16色 | 633.3 kB | 18.1 kB | 5.6 → 20.8 |

同じPCから各接続が毎秒30回の受信を目指す短時間試験。サイズはHTTP応答本文の中央値。4人の軽量16色では描画する矩形が5,251個のまま、本文は97.1%減り、応答時間の中央値は101.89msから27.54msになった。表は通信とLuaの試験で、Chromeの描画FPSや幻境実機の値は含まない。 [生の計測結果](../evidence/coop-local-http.json)

原作通常ボス49戦、原作週ボス14戦、ラボ独自の週ボス2戦と通常ボス15戦、現行台帳の地方伝説56戦、幽境のファルカ・隊長・シュバランケ・レリルの4戦を共闘に登録した。残りの幽境、週ボスの観戦、汎用支援による参加判定、別端末からの通信、星々の幻境実機は確認待ち。人数でボスHPを増やさない方針は採用済み。 [11月16日の採用仕様](../sources/20261116-amendment.md)
