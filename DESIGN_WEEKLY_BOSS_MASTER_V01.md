# 週ボス設計：原作の攻略体験を2Dへ移す v0.6

2026-11-17 JST。入口のファイル名は参照互換のためV01のまま保持。モンド・璃月・稲妻・スメール・フォンテーヌ各2戦に続き、蝕まれし源焔の主と扉に通ずる対局を追加した。後者はモンドの挑戦であり、このバッチの2戦を同じ国のボスと扱わない。

## 位置づけ

このチャットはデザインを決め、Codexが素材制作・許可された実装を行う。現在の初期詳細設計はトワリン、北風の王狼、公子、若陀龍王、淑女、禍津御建鳴神命、正機の神、アペプのオアシス守護者、呑星の鯨、召使、蝕まれし源焔の主、扉に通ずる対局の12戦。全週ボスの完成宣言ではない。ゲームコード、既存技、敵登録、報酬、セーブ、素材、実機テストは変更しない。全体の分担と技の実装保留はCHAT_HANDOFF.md／AGENTS.mdを優先。

幽境は人物を相手に本作用の独自戦闘を作る。週ボスはまず「原作で何をして勝つ相手か」を保存し、3Dの操作を横スクロールに置き換える。技の種類を増やすことや、全員をロノヴァ以上の難度にすることを目的にしない。具体値は制作開始案であり、ユーザーが各値を個別承認したという意味ではない。

## 設計の入口

| ボス | 既存エンカウントID | 設計 | 項目数 |
|---|---|---|---:|
| 空を裂く魔龍・トワリン | boss-29010101 | [DVALIN.md](docs/weekly-boss-v1/DVALIN.md) | 8（攻撃・場面ギミック7＋弱点露出1） |
| 北風の王狼・アンドリアス | boss-29020101 | [ANDRIUS.md](docs/weekly-boss-v1/ANDRIUS.md) | 11（連携・フェーズ移行を含む） |
| 公子・タルタリヤ | boss-29030101 | [CHILDE.md](docs/weekly-boss-v1/CHILDE.md) | 14（攻撃12＋断流状態＋形態移行） |
| 若陀龍王 | boss-29040101 | [AZHDAHA.md](docs/weekly-boss-v1/AZHDAHA.md) | 14（攻撃・移行13＋刻印状態） |
| 淑女 | boss-29050101 | [SIGNORA.md](docs/weekly-boss-v1/SIGNORA.md) | 16（攻撃、繭、羽化、温度・装置） |
| 禍津御建鳴神命 | boss-29060201 | [RAIDEN_SHOGUN.md](docs/weekly-boss-v1/RAIDEN_SHOGUN.md) | 18（攻撃、装置、形態・ゲージ状態） |
| 正機の神 | boss-29070101 | [SHOUKI_NO_KAMI.md](docs/weekly-boss-v1/SHOUKI_NO_KAMI.md) | 18（攻撃、六装置、盾、端末、試練、ダウン） |
| アペプのオアシス守護者 | boss-29080101 | [APEP_GUARDIAN.md](docs/weekly-boss-v1/APEP_GUARDIAN.md) | 18（本体攻撃、6役の増殖体、防衛、移行、保護） |
| 呑星の鯨 | boss-29090101 | [ALL_DEVOURING_NARWHAL.md](docs/weekly-boss-v1/ALL_DEVOURING_NARWHAL.md) | 16（外海、眼、敵意、幻影、捕食/帰還、露出） |
| 召使 | boss-29091001 | [THE_KNAVE.md](docs/weekly-boss-v1/THE_KNAVE.md) | 18（鎌、契約/返済、血汐、赤宴、羽化/双鎌） |
| 蝕まれし源焔の主 | boss-29091101 | [LORD_OF_ERODED_PRIMAL_FIRE.md](docs/weekly-boss-v1/LORD_OF_ERODED_PRIMAL_FIRE.md) | 18（二剣、障壁、芽/柱、床切断、蝕破、露出） |
| 扉に通ずる対局 | boss-29122000 | [GAME_BEFORE_THE_GATE.md](docs/weekly-boss-v1/GAME_BEFORE_THE_GATE.md) | 20（駒、人型二体、誘導、凍結、HP譲渡、進行） |

合計189項目。原作の全モーション数・実装済みの技数ではなく、本作の制作カード数。璃月28項目には別時間割10件、稲妻34項目には別時間割6件、スメール36項目には別時間割3件、フォンテーヌ34項目には別時間割3件を持つ。源焔・対局38項目は固定28＋イベント10。攻撃しない状態も数えるので「189の攻撃技完成」と呼ばない。

既存content/encounter-details.jsonでは、トワリンは浄化後の待機本体、王狼は通常形態、公子は第一形態と魔王武装、若陀は本体、淑女は氷期/炎期、雷電は強化姿、正機は全身、アペプ守護者は暗色/緑の候補がある。鯨は本体待機、召使は双鎌衣装、源焔はgosoythoth、対局はgate-king/gate-queenの候補。待機画像の存在を戦闘完成とは扱わず、原画を残して不足する武器・形態・結晶・尾・巨腕・端末・心・取り巻き・腹中の幻影・翼・駒・全攻撃を制作する。候補の現況は作業前にライブ台帳を再確認する。

検証はバッチ別：[モンドQA](docs/weekly-boss-v1/QA.md)、[璃月QA](docs/weekly-boss-v1/QA_LIYUE.md)、[稲妻QA](docs/weekly-boss-v1/QA_INAZUMA.md)、[スメールQA](docs/weekly-boss-v1/QA_SUMERU.md)、[フォンテーヌQA](docs/weekly-boss-v1/QA_FONTAINE.md)、[源焔・対局QA](docs/weekly-boss-v1/QA_PRIMAL_GATE.md)。

索引：[璃月](docs/weekly-boss-v1/MANIFEST_LIYUE.json)、[稲妻](docs/weekly-boss-v1/MANIFEST_INAZUMA.json)、[スメール](docs/weekly-boss-v1/MANIFEST_SUMERU.json)、[フォンテーヌ](docs/weekly-boss-v1/MANIFEST_FONTAINE.json)、[源焔・対局](docs/weekly-boss-v1/MANIFEST_PRIMAL_GATE.json)。全て設計索引であり実行用ゲームデータではない。

## 共通規格

- U=旅人の表示高88px。座標x右・z上、60tick/秒、半開区間[start,end)。秒数と寸法は本作の制作開始値で、原作動画の実測値ではない。
- 姿勢と予兆→対象位置固定→攻撃→終了姿勢→攻撃機会で読む。生成tickと衝突tickを分け、武器・尾・残像・装飾に無断で判定を追加しない。
- 共通の音・カメラ・表示優先度は[幽境COMMON](docs/stygian-motion-v1/COMMON.md)を参照。ただし人型の頭身、幽境の復活、全ての終了時間にHP攻撃可能という前提は移植しない。変身/準備終端、場面移行、起上がりは明示的なexposureと区別する。WC14、WS09、WR09/14、WN08、WP05/13/16、WV07/14/15、WK11、WG08/17、WT09/18等の例外は各票/QAを優先。
- 巨竜・四足獣・巨大機体・鯨に人体の約3頭身を適用しない。頭、首、爪、翼、尾、脚の輪郭と実判定を優先する。人型は最新ART_REFERENCE_POLICYを使い、巨大化しても足元原点を保つ。神腕・翼・長い肢・浮遊輪は本体とは別レイヤー。
- 本番背景は3D。敵・技は現在の2D方針。大きな本体と付属物を分け、予兆・自機・足場・状態表示を保護する。
- トワリンは体勢ゲージと首のHP弱点を分ける。王狼は本体へ攻める間合い戦。公子は水→雷→水雷の三形態と断流の外周解除。若陀は岩→第一元素→第二元素、尻尾の露出と元素刻印を扱う。
- 淑女は氷→封印耐久→炎。温度と床、装置、蛾はHPから分離。雷電はHP一本で通常→強化→ダウン→通常を循環し、凶運Oと装甲Gを区別する。
- 正機は二HP区間、充填C・盾G・弱点試練を区別。端末の自動支援は盾までで、HPを代わりに全削りしない。アペプ守護者は初戦HP→味方の心の蘇生P→最終HP。心を殴る対象へ誤変換しない。
- 鯨は主HP一本、敵意Hと腹中の幻影耐久Sを分離。場面移行でHP/CT/光界を補充しない。召使は二HP区間、actor別契約Dと羽毛の印Fを分ける。満HPでも回復がDへ先払いされる。
- 源焔は一本HP・蝕破A予約・障壁G・床境界を分離。対局は前半区間と後半二HP、凍結F、HP譲渡を区別。敵同士の譲渡を人間プレイヤーの蘇生機能へ転用しない。
- 公子のHP区間は3つ、若陀は1本。若陀の4元素組合せを入口で表示し、現実曜日の待機や原作の耐性倍率を自動導入しない。
- 週ボスという分類名を週1回制限に直結させない。報酬頻度・樹脂・挑戦回数・難度数は今回決めない。
- ロノヴァの復活の灯・命・確定死を一般週ボスへ追加しない。原作雷電/正機/対局の致死性、源焔の大損傷と貫通蝕破に対し、本版は通常ダメージ処理を使用。原作通りの致死/貫通版は別採否。参加人数でHPを増やさず、他の実プレイヤーを蘇生する機能も追加しない。
- 必須操作は通常移動・ジャンプ・通常攻撃と明示された舞台装置で完結させる。弓・浮遊・特定同行者を必須にしない。若陀の盾なし攻略、花/滅度機/核/源焔障壁の物理代替、低い胸、蘇生ドーム、返済灯、霜印の駒は本作独自で、採否と操作成立を検証する。
- 淑女の床はWS15、正機の床はWN18、源焔の床はWG18が独立寿命を持つ例外。WP16のドームも次のWP17全体を守る親シーケンスへ属する。全ての弾をRECOVERY後へ残してよい意味ではない。フォンテーヌの弾/危険は各cast終了までに失効する。
- アペプ防衛の取り巻きは一役一主動作を基本とし、モブの派手な被弾より役割と支援リンクを優先。生存上限8体は初期値。同じ敵を増やすだけの長い待ち時間にしない。
- 鯨の内部幻形は一時的な攻撃実体で、別の雑魚撃破報酬なし。召使の文脈反撃や霜印操作でJ保持・E交代・Q光界・既存マクロを奪わない。全システムの敵ギミックを主人公60技へ数えない。

## 原作資料と未確認範囲

モンド：
- https://library.keqingmains.com/enemy-data/bosses/weekly-bosses/stormterror
- https://library.keqingmains.com/enemy-data/bosses/weekly-bosses/andrius-boreas

璃月：
- https://library.keqingmains.com/enemy-data/bosses/weekly-bosses/childe/eleventh-of-the-fatui-harbingers-tartaglia
- https://library.keqingmains.com/enemy-data/bosses/weekly-bosses/childe/delusion-unleashed-childe
- https://library.keqingmains.com/enemy-data/bosses/weekly-bosses/childe
- https://library.keqingmains.com/enemy-data/bosses/weekly-bosses/azhdaha
- https://library.keqingmains.com/evidence/combat-mechanics/enemy-mechanics/enemy-interactions
- https://www.hoyolab.com/article/8722322

稲妻：
- https://library.keqingmains.com/enemy-data/bosses/weekly-bosses/signora/la-signora
- https://library.keqingmains.com/enemy-data/bosses/weekly-bosses/signora/crimson-witch-of-flame
- https://library.keqingmains.com/enemy-data/bosses/weekly-bosses/the-shogun
- https://library.keqingmains.com/evidence/combat-mechanics/enemy-mechanics/enemy-interactions#the-shogun--magatsu-mitake-narukami-no-mikoto
- https://www.hoyolab.com/article/3498630

スメール：
- https://genshin.hoyoverse.com/en/news/detail/25433
- https://wiki.hoyolab.com/pc/genshin/entry/2975?lang=en-us
- https://www.hoyolab.com/article/13287665/
- https://www.hoyolab.com/article/17634171
- https://genshin.hoyoverse.com/en/news/detail/111055
- https://www.hoyolab.com/article/29773824
- https://www.hoyolab.com/article/29620753

フォンテーヌ：
- https://genshin.hoyoverse.com/en/news/detail/113556
- https://www.hoyolab.com/article/22822437
- https://www.hoyolab.com/article/27604025
- https://prtimes.jp/main/html/rd/p/000000199.000096124.html
- https://wiki.hoyolab.com/pc/genshin/entry/5653?lang=en-us
- https://wikiwiki.jp/genshinwiki/敵/呑星の鯨
- https://wikiwiki.jp/genshinwiki/敵/「召使」

源焔・対局：
- https://genshin.hoyoverse.com/ja/news/detail/127791
- https://www.hoyolab.com/article/36002098
- https://genshin.hoyoverse.com/en/news/detail/155739
- https://www.hoyolab.com/article/38627459
- https://wiki.hoyolab.com/pc/genshin/entry/7672?lang=ja-jp
- https://www.hoyolab.com/article/38674732
- https://wikiwiki.jp/genshinwiki/敵/蝕まれし源焔の主
- https://wikiwiki.jp/genshinwiki/敵/扉に通ずる対局

KQMはコミュニティの実戦・検証資料。HoYoLABには運営投稿とユーザー攻略の両方があり、全部を公式仕様書とは呼ばない。公式紹介は画像主体で、読めなかった本文・未精読の図がある。転載された公式図を見た箇所も原ページ全図を直接読んだとは表記しない。必要に応じコミュニティの行動記録で補助照合し、出典種別を各票へ明記。具体的な2D座標・時間・段数・安全策・状態所有単位は本作用。原作全フレーム、モデル全角度、最新挙動の実機再現は未測定。過去の候補数を原神の最新全件数としない。

## バッチ2で決めた重点

公子は巨鯨の出現/着水の二段予告と断流の外周解除、形態ごとの武器/構え/射程を重視。若陀は炎の残留床、水の移動球、雷の切替帯、氷の遅延結晶を分離。地下本体と尾の重複命中を防ぎ、潜行中HP0で追加一撃を要求しない。28項目と10分岐の静的検査のみ、操作・作画・実機は未検証。詳細は璃月QA。

## バッチ3で決めた重点

淑女16項目は小さな手首から大きな鞭へ切替、蛾・温度・床・装置を独立管理。雷電18項目は通常2武器と巨腕、眼とX字本体、三杭、花と保護、強化解除後8秒を整理。原作の致死と本作大ダメージを区別。34項目・別時間割6・固定35・イベント5、弾8・床5・WR14→15接続を静的検査。索引SHA `d06083b2bac6cc3587a00f0ef2a5712f7ba7d7b6`。詳細は稲妻QA。

## バッチ4で決めた重点

正機18項目は六装置、二雷6秒停止、共有C予約、盾G、四基→端末射撃→10秒露出を接続。失敗で盾全回復/永久無敵にしない。アペプ18項目は心の進行と防衛6役、蘇生、ドームと余波、8秒反撃。支援循環、偽の撃破加算、ドーム先消えを防ぐ。36項目・別時間割3・固定33・イベント6、弾5・壁1・床3と親子保護寿命を静的検査。索引SHA `96a4e87eab968cbf24e3409a2ce5d589c631df35`。詳細はスメールQA。

## バッチ5で決めた重点

鯨16項目は外海で殴れる部位、敵意H、眼、捕食、腹中の幻影S、三種幻形、帰還後10秒を接続。核の通常攻撃代替と低HP時の再捕食取消は本作値。移行で旧攻撃を消し、HP/CTを回復しない。全身の巨大な絵に無条件接触判定を付けない。

召使18項目は片鎌/双鎌、Dの回復先払い、F取得、指定赤宴への中断、3.6秒反撃を整理。返済灯はDだけを減らす独自案。空中大技WK18は中断不可で、赤宴と表示を分ける。自己HP回復は支出上限内で一度、マルチ人数で増殖させない。FはAI/設置技に誤消費させない。

34項目・別時間割3・基本固定28・固定計31・イベント6、飛翔体5定義、露出600/216tick、中断先、回復4算術例を静的検査。8,780bytes、索引SHA `b716fcb2c2481fde104601ba7d92031ccfc4e8d7`。詳細はフォンテーヌQA。

## バッチ6で決めた重点

源焔18項目は炎/紫の二剣、蝕破の遅延予約、障壁/芽/柱、床を三回切断する進行、8秒の露出を接続。切断後も最低7U、床上限3、安全経路を維持する。蝕破の原作貫通や最大HP固定損傷はそのまま移植しない。障壁は物理でも処理可能な開始案。

対局20項目は、駒をキングの突進へ当てる前半、人型二体の連携、Fの試練、凍ったクイーンへ誘導する後半、6秒の反撃と合計HPを保存する相方蘇生。霜印の駒は編成救済の独自案。蘇生は全戦2回、敵同士だけ。二体が同時に無関係な大技を乱発しない。

38項目、固定28、イベント10、固定飛翔体6定義、イベント飛翔体1定義、独立床5定義、露出480/360tick、F操作最短300tick、HP転送1,000算術例を検査。9,979bytes、索引SHA `ba5d6ee4c35bdf2acc1cd2c8b373b4aedb946fbb`。保存内容と一致。幾何/経路・動画全コマ・作画・ゲーム・AI/マルチ・実機は未検証。各バッチの検査は他バッチを再検証した証明ではない。

## 以後の設計

この12戦で全週ボスが完成したとはしない。残る候補は現行のエンカウント台帳を照合して順次扱い、名称・別形態・独立挑戦の区別を確認する。未着手ボスを削除しない。操作試験前に回避可能・完成とは判定せず、技実装保留は維持する。
