# 呑星の鯨の週ボス試作

Lv84でフォンテーヌ・水辺の広場の依頼「星海の再現戦・幻形の核」を受け、広場のx700から入る。星海の試作HPは2,200、腹中の幻影は初回760。

## 星海と腹中

- 星海では攻撃と経過時間で敵意が高まる。渦の眼は通常の命中8回で壊せる。敵意100の後、進行中の技が終わると腹中へ移る。鯨のHPが20％以下になると以後の捕食を行わない。
- 腹中では幻影の耐久だけを攻撃できる。幻形の核が開いてから5秒以内に、通常攻撃を4回新しく出して命中させる。多段攻撃は核に対して一回分。地面から核の当たり判定の下端まで57.2pxなので、通常攻撃が足元から届く。核の中断で幻影の最大耐久の25％が減少する。受付が終わると、獣・竜・クラゲのうち一つが出る。
- 幻影を倒して星海へ戻ると、鯨に最大HPの20％相当が一度入る。続く衰弱の10秒間は側腹を攻撃できる。移動時は生存者のHP・クールダウンを引き継ぎ、旧戦場の攻撃は消える。

HUDでは、捕食が始まってから腹中へ切り替わるまでと、腹中で操作できるようになるまでを別々にカウントする。帰還時は星海へ戻るまで、到着後は反撃できるまでを表示する。帰還ダメージが入ると、ダメージ量と反撃開始までの残り時間が同時に見える。反撃が始まってからの10秒間も表示する。

共闘では星海と腹中が同じ試行を使う。途中参加者は進行中の戦場に合流し、核の受付回数を全員で共有する。 [共闘の入口・操作・検証](../COOP_WEB_PREVIEW.md#呑星の鯨の週ボス戦) · [ラボを開く](http://127.0.0.1:9053/)

## 素材

鯨は既存のドット絵。腹中の幻影は内蔵ImageGenで約3.1頭身の独自の鎧に仕上げた。既存キャラは頭身、3Dモデルのプレビューは装甲の明暗を参照した。外側は既存の洞窟背景、腹中は新規の仮背景を使う。本番背景は3D配置の方針。連続作画、投擲用の手元と大剣の分離、音、難度調整、遠隔同期と幻境実機は後続。 [生成プロンプトと参照記録](../../assets/narwhal-weekly-generation-v1.json) ／ [鯨の原画の記録](../../evidence/narwhal-reference-audit.json)

## 検証

フォンテーヌの水洞とベリル地下を報告済みのLv94セーブを使い、同行者の攻撃を控えて呑星の鯨の依頼を再走した。M地図で水辺の広場から星海、腹中への移動と帰還を案内できた。渦の眼の8命中、核の4入力、幻影への190ダメージ、帰還時に一度だけ入る鯨への440ダメージを確認した。討伐後に230,000 EXPと8,500モラの依頼報酬を受け取り、1勝と報告済みの状態を読み直した。核の同一フレームは標準矩形7,392件、軽量16色2,106件。 [Lv94からのChrome検証](../../evidence/earned-fontaine-narwhal-browser.json)

獲得済みのLv200セーブで最上級の2経路を比較するには、`python -X utf8 test_earned_narwhal_return.py --from-save work/current-atlas-recheck/current-atlas-save.json --output-dir work/narwhal-return-frames` を実行する。ラボを配信中に `node test_earned_weekly_frames.mjs work/narwhal-return-frames work/narwhal-return-comparison` を実行すると、HUDと元絵・中間・軽量の13場面を確認できる。 [最上級の比較と共闘の記録](../../evidence/narwhal-return-branches-20261128.json)

- [攻撃設計](ALL_DEVOURING_NARWHAL.md) の核の部分には [修正版の5秒受付](CORRECTIONS_V02.md) を適用。アルケーの入力タグは現行ラボに未登録のため、受け入れ検証は通常攻撃で行った。
- `test_narwhal_weekly.py` は時刻、同HPの部位重複、眼の命中、核の入力由来と受付終了、内外の実ノード切り替え、保存復元を確認する。 [Luaの結果](../../evidence/narwhal-weekly-lua.json)
- `test_narwhal_weekly.mjs` は装備付きLv84で受注し、通常攻撃で眼を破壊、腹中に移動、核を4回で中断、星海へ帰還、討伐、報告、保存再開を確認した。 [Chromeの結果](../../evidence/narwhal-weekly-browser.json) ／ [星海](../../evidence/narwhal-weekly-outer.png) ／ [腹中](../../evidence/narwhal-weekly-kernel.png)
- 核の同一フレームはPNGで15件、標準矩形で7,897件、軽量16色で2,237件。軽量版は標準矩形より71.7％少ない。 [PNG](../../evidence/narwhal-weekly-png.png) ／ [標準矩形](../../evidence/narwhal-weekly-standard.png) ／ [軽量16色](../../evidence/narwhal-weekly-light.png)
