# クエスト設計153件のLuaラボ検証

設計台帳の153件は、メイン24件、通常サブ40件、日次候補40件、高難度27件、隠し世界6件、成長16件。依頼IDは画面とセーブで使う既存のIDに対応させている。日次候補40件は、全地域共通の主依頼1枠と追加2枠で受注する。 [クエスト設計](../DESIGN_QUEST_MASTER_V01.md) · [設計IDの対応表](../content/coverage.json)

## 見つかった不具合

- ナド・クライの「近道、寄り道、月の道」で林か海岸のどちらかを終えると、次の目的地が箱影の入江になる。入江に着く前の保存データを読み込むと、入江が未訪問であることを理由に受理されなかった。保存の検査で分岐の完了条件を使うように修正した。分岐の訪問記録は各行程で検査する。LuaとChromeで両方のルートを選び、入江の手前で保存して町から再開し、入江へ進んで報告した。 [Lua](../evidence/nod-moon-paths-lua.json) · [Chrome・林](../evidence/nod-moon-paths-wood-browser.json) · [Chrome・海岸](../evidence/nod-moon-paths-coast-browser.json)
- モンドの南の街道で、町へ戻る門の近くにLv5の門が重なっていた。配達の木箱の近くでもGを押すと隠し入口を先に調べていた。門と調査範囲を離し、配達と帰還をChrome、金リンゴ群島の発見とモンド全51地点をLuaで再試験した。 [モンドの配達](../evidence/mondstadt-m01-browser.json) · [モンドの地図検証](../evidence/mondstadt-waypoint-test.json)
- 稲妻の綾華加入テストを、仲間ごとにHPと技の待ち時間を保持する現行仕様に合わせた。アンバーに戻したときはアンバーの記録、綾華を再選択したときは綾華の記録に戻ることを確認した。白虹峠では足跡調査と駅での踊りの稽古を、ジャンプと着地から報告・復元まで試験に加えた。 [稲妻加入](../evidence/inazuma-s01-lua.json) · [白虹峠](../evidence/white-pass-chapter.json)

## 検証コマンド

- `python -X utf8 docs/quest-v1/validate_manifest.py` で、設計索引の153件と本文12文書、37件の物語順序を検査する。
- `python -X utf8 test_quest_design_progression.py` で、レベル・受注場所・停止中・前の依頼・成長条件による受注判定と、目標達成前に報告できないことをLuaで検査する。レベルと前提状態はケースごとに用意する。 [受注判定の結果](../evidence/quest-design-progression.json)
- `python -X utf8 test_quest_design_playthrough.py` で、地域章・通常サブ・高難度・隠し世界・成長・日次の81シナリオを実行する。153件それぞれについて、受注と報酬支給が起きたテスト名を記録した。開始レベル、前の依頼の進行、移動位置や戦闘開始条件はシナリオごとに設定する。 [受注・支給の結果](../evidence/quest-design-playthrough.json)

クエストのラボ内試作を検査した結果。全地域をLv1から順に進める連続プレイ、ボス固有技の全フェーズ、マルチの個別報酬、星々の幻境実機の検証は別途必要。
