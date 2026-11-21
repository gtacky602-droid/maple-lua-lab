# ローカルラボの協力プレイ

ローカルラボの通常の冒険を、参加者それぞれのブラウザプロフィールで開く。画面下の「協力プレイ（ローカル試作）」を開き、対応する65地点のいずれかで部屋を作る。他の参加者は対応地点で合言葉を入力し、「参加」を押す。同じ地点に4人が集まると、旅人と同行者が計8体表示される。 [部屋を作成・参加できる地点](../content/coop-preview.json)

参加者の入力をサーバーのLuaへ送り、マップごとに敵のHP、攻撃、再出現を60Hzの刻みで進める。仲間の現在地は画面下の協力欄に表示され、同じ共有マップにいる操作キャラには水色の名前が出る。地図を開いたプレイヤーの移動・攻撃入力は止まり、その場の戦闘は続く。

装備、依頼、同行者、EXP、モラは各人の冒険のデータを使う。現行の参加判定は、12秒以内に敵へ有効なダメージを与え、撃破時に横420px・縦180px以内にいること。自分の同行者の攻撃も含める。対象者ごとにEXPとモラを付け、受注済みの討伐依頼だけを進める。聖遺物は各自の指定セットと抽選記録を使い、各自の画面で回収する。閾値は試作設定。 [設定](../content/coop-preview.json)

画面を再読み込みすると、60秒の離席猶予の間は同じ部屋に復帰できる。「部屋から出る」を選ぶ、保存を読み込む、通常の冒険を離れると退出する。保存は各自が行い、読み込みは通常どおり町から再開する。協力部屋はローカルサーバーの起動中に使える。ランキング対象の冒険からは通常の冒険を開いて参加する。

## 別々のマップで遊ぶ

ポータルで別れると、各マップにいる人だけで戦闘が続く。討伐時に別のマップへ出た人には、その討伐の報酬が入らない。共有マップに接続中の参加者がいなくなると、敵HPと再出現の残り時間を保持して休止し、誰かが戻ると続きから進む。対応地点以外へ進んだ場合は、部屋に所属したまま各自の戦闘になる。

HTTPで、同じ部屋の4人が南の街道と風鳴りの広場に2人ずつ分かれ、各マップの討伐に参加した2人それぞれへ報酬が付くことを確認した。Chromeの2画面では、町と広場からの参加、離れたマップの進行、再読み込み、広場への合流を確認した。 [HTTPの検証](../evidence/coop-travel-http.json) · [別行動時の協力欄](../evidence/coop-travel-split.png) · [広場での合流](../evidence/coop-travel-regroup.png) · [Chromeの検証](../evidence/coop-travel-browser.json)

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

Luaで各3組の個体HP、途中報酬なし、距離と有効打による報酬対象、セーブ、再戦を確認。HTTPでは異色三連星が途中で全員退出しても、倒した個体が倒されたまま残ることを確かめた。各組の専用技は今後の制作項目。 [Lua・HTTPの検証](../evidence/coop-legend-groups-lua-http.json)

Chromeの2画面で合言葉を入力し、通常攻撃で三連星を順に討伐した。最初の2体を倒した時点では討伐数0、3体目で両画面に討伐1件と550モラが入り、保存にも記録された。二人で出口を通ってから再入場すると、同じ合言葉の部屋で3体が復帰した。初期セーブは `python test_coop_legend_groups.py`、Chromeの試走は `node test_coop_legend_groups.mjs` で再現できる。 [合流](../evidence/coop-tristars-gather.png) · [一体目の討伐](../evidence/coop-tristars-first-down.png) · [Chromeの検証](../evidence/coop-tristars-browser.json)

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

ほかの通常ボス・週ボス・幽境の共闘、回復や支援による参加判定、別端末からの通信、星々の幻境実機は確認待ち。人数でボスHPを増やさない方針は採用済み。 [11月16日の採用仕様](../sources/20261116-amendment.md)
