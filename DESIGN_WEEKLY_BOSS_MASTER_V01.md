# 週ボス設計：原作の攻略体験を2Dへ移す v0.3

2026-11-17 JST。入口のファイル名は参照互換のためV01のまま保持。幽境5ボスの次に週ボスを設計し、モンド2戦・璃月2戦に続いて稲妻2戦を追加した。

## 位置づけ

このチャットはデザインを決め、Codexが素材制作・許可された実装を行う。現在の初期詳細設計はトワリン、北風の王狼、公子、若陀龍王、淑女、禍津御建鳴神命の6戦。全週ボスの完成宣言ではない。ゲームコード、既存技、敵登録、報酬、セーブ、素材、実機テストは変更しない。全体の分担と技の実装保留はCHAT_HANDOFF.md／AGENTS.mdを優先。

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

合計81項目。これは原作の全モーション数・実装済みの技数ではなく、本作の制作カード数。璃月28項目には別時間割10件、稲妻34項目には別時間割6件を持つ。攻撃しない状態も数えるので「81の攻撃技完成」と呼ばない。

既存content/encounter-details.jsonでは、トワリンは浄化後の待機本体候補、王狼は通常形態の待機候補。公子は第一形態と魔王武装の本体待機候補、若陀龍王は待機本体候補。淑女は氷期・炎期の本体候補、雷電は強化姿の本体候補がある。待機画像の存在を戦闘完成とは扱わず、原画を残して不足する武器・形態・繭・結晶・尾・攻撃を制作する。候補の現況は作業前にライブ台帳を再確認する。

検証はバッチ別に分ける：[モンドQA](docs/weekly-boss-v1/QA.md)、[璃月QA](docs/weekly-boss-v1/QA_LIYUE.md)、[稲妻QA](docs/weekly-boss-v1/QA_INAZUMA.md)。[MANIFEST_LIYUE.json](docs/weekly-boss-v1/MANIFEST_LIYUE.json)と[MANIFEST_INAZUMA.json](docs/weekly-boss-v1/MANIFEST_INAZUMA.json)は設計索引であり実行用ゲームデータではない。

## 共通規格

- U=旅人の表示高88px。座標x右・z上、60tick/秒、半開区間[start,end)。秒数と寸法は本作の制作開始値で、原作動画の実測値ではない。
- 姿勢と予兆→対象位置固定→攻撃→終了姿勢→攻撃機会で読む。生成tickと衝突tickを分け、武器・尾・残像・装飾に無断で判定を追加しない。
- 共通の音・カメラ・表示優先度は[幽境COMMON](docs/stygian-motion-v1/COMMON.md)を参照。ただし人型の頭身、幽境の復活、全ての終了時間にHP攻撃可能という前提は移植しない。WC14、WS09、WR09の変身終端やWR14の準備終端は攻撃可能な後隙ではない（各QA参照）。
- 巨竜・四足獣に人体の約3頭身を適用しない。頭、首、爪、翼、尾、脚の輪郭と実判定を優先する。人型は最新ART_REFERENCE_POLICYを使い、巨大化しても足元原点を保つ。雷電の神腕・淑女の翼は人体とは別レイヤー。
- 本番背景は3D。敵・技は現在の2D方針。大きな本体と付属物を分け、予兆・自機・足場・状態表示を保護する。
- トワリンは体勢ゲージと首のHP弱点を分ける。王狼は本体へ攻める間合い戦。公子は水→雷→水雷の三形態と断流の外周解除。若陀は岩→第一元素→第二元素、尻尾の露出と元素刻印を扱う。
- 淑女は氷→封印耐久→炎。温度と床、装置、蛾はHPから分離。雷電はHP一本で通常→強化→ダウン→通常を循環し、凶運Oと装甲Gを区別する。
- 公子のHP区間は3つ、若陀は1本。若陀の4元素組合せを入口で表示し、現実曜日の待機や原作の耐性倍率を自動導入しない。
- 週ボスという分類名を週1回制限に直結させない。報酬頻度・樹脂・挑戦回数・難度数は今回決めない。
- ロノヴァの復活の灯・命・確定死を一般週ボスへ追加しない。原作雷電の大技には致死処理があるが、本版WR15は通常大ダメージへ翻案している。原作通りの致死版は別採否。参加人数でHPを増やさず、他の実プレイヤーを蘇生する機能も追加しない。
- 必須操作は通常移動・ジャンプ・通常攻撃と明示された舞台装置で完結させる。弓・浮遊・特定同行者を必須にしない。若陀の盾は有利だが盾なし回避・HP維持を検証する。花の物理充填は本作独自の代替。
- 淑女の床は意図的に技の後へ残る。castと別のWS15環境managerが所有する明示的な例外であり、全ての弾をRECOVERY後へ残してよいという意味ではない。

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

KQMはコミュニティの実戦・検証資料、HoYoLABの該当記事はユーザーによる攻略観察であり、運営の公式ボス仕様書ではない。技の構造を参照し、具体的な2D座標・時間・段数・安全策・状態所有単位は本作用に定義した。原作の映像全フレーム、モデル全角度、最新挙動の実機再現は未測定。過去の候補数を原神の最新全件数としない。

## バッチ2で決めた重点

公子は、巨鯨の出現と着水を分けて予告し、印を消すために外周へ動く駆け引きを残す。水/雷の切替は武器・構え・射程が変わることで示す。若陀は、炎の残留床、水の移動球、雷の切替帯、氷の遅延結晶を区別する。地下本体と尾の二重命中を防ぎ、潜行中HP0で追加一撃を要求しない。

28項目と10分岐は索引の静的検査を実施。ゲーム起動、回避可能性、作画品質、AI、マルチ、FPS、幻境実機は未検証。先行2戦の検証状態をこの検査で上書きしない。

## バッチ3で決めた重点

淑女16項目は、氷の小さい手首動作から炎の大きな鞭へ切替。蛾を拾って操作キャラの攻撃を当てる、温度を下げるため外周へ動く、残る床を避けるという攻略を主役にする。装置の誤破壊、温度の交代リセット、蛾のAI誤消費を防ぎ、繭を特定元素必須の壁にしない。

雷電18項目は、通常2武器と巨腕の強化形態、破壊する眼とX字の本体、三杭の波、花の充填と保護、強化解除後の8秒を揃える。大技の原作致死判定と本作初版の通常大ダメージを区別する。光界ゲージを原作の元素エネルギーに見立てて勝手に奪わない。

34項目・別時間割6件・固定ルート35・イベント状態5、飛翔体8定義、独立床5定義、WR14→WR15の接続を静的検査。保存した索引のGit blob SHAは `d06083b2bac6cc3587a00f0ef2a5712f7ba7d7b6`。検査は算術・構造のみで、操作検証や原作精密照合の代わりではない。

## 以後の設計順

次は正機の神・アペプ、その後に呑星の鯨・召使などへ展開する。未着手ボスを削除せず、追加候補や名称は各回に現行台帳と原作資料を照合する。操作試験前に回避可能・完成とは判定しない。
