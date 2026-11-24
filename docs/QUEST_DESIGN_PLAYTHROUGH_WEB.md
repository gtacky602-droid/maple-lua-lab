# クエスト設計153件のLuaラボ検証

設計台帳の153件は、メイン24件、通常サブ40件、日次候補40件、高難度27件、隠し世界6件、成長16件。依頼IDは画面とセーブで使う既存のIDに対応させている。日次候補40件は、全地域共通の主依頼1枠と追加2枠で受注する。 [クエスト設計](../DESIGN_QUEST_MASTER_V01.md) · [設計IDの対応表](../content/coverage.json)

## 現行ラボの依頼

新規受注できる279件すべてを、受注・目標達成・報酬支給を確認した試験に対応付けた。旧加入依頼4件は、旧形式の受注状況を入れたテスト用セーブから残っていた討伐を済ませ、報告して仲間を選べた。日次は40候補の支給記録がある。各試験では、開始Lv、訪問履歴、必要に応じて戦闘状態を用意している。 [依頼ごとの対応資料](../evidence/authored-quest-playthrough.json)

- 訪問24件はM地図に沿って往復し、報告前と報告後の保存から再開した。討伐12件は途中から再開し、周回契約では再受注後の報告も試した。どちらも同じ報告の二重支給を防ぐことを確認した。 [訪問依頼](../evidence/visit-quest-round-trips-lua.json) · [討伐と旧加入依頼](../evidence/hunt-quest-round-trips-lua.json)
- フォンテーヌの「水洞の奥の圧力扉」と「ベリル地下の排熱門」は、LuaとChromeで深さを合わせて調べ、拠点で報告し、再開後に開いた門を往復した。 [Lua](../evidence/fontaine-access-surveys-lua.json) · [Chrome](../evidence/fontaine-access-surveys-browser.json)

## 見つかった不具合

- ナド・クライの「近道、寄り道、月の道」で林か海岸のどちらかを終えると、次の目的地が箱影の入江になる。入江に着く前の保存データを読み込むと、入江が未訪問であることを理由に受理されなかった。保存の検査で分岐の完了条件を使うように修正した。分岐の訪問記録は各行程で検査する。LuaとChromeで両方のルートを選び、入江の手前で保存して町から再開し、入江へ進んで報告した。 [Lua](../evidence/nod-moon-paths-lua.json) · [Chrome・林](../evidence/nod-moon-paths-wood-browser.json) · [Chrome・海岸](../evidence/nod-moon-paths-coast-browser.json)
- モンドの南の街道で、町へ戻る門の近くにLv5の門が重なっていた。配達の木箱の近くでもGを押すと隠し入口を先に調べていた。門と調査範囲を離し、配達と帰還をChrome、金リンゴ群島の発見とモンド全51地点をLuaで再試験した。 [モンドの配達](../evidence/mondstadt-m01-browser.json) · [モンドの地図検証](../evidence/mondstadt-waypoint-test.json)
- 稲妻の綾華加入テストを、仲間ごとにHPと技の待ち時間を保持する現行仕様に合わせた。アンバーに戻したときはアンバーの記録、綾華を再選択したときは綾華の記録に戻ることを確認した。白虹峠では足跡調査と駅での踊りの稽古を、ジャンプと着地から報告・復元まで試験に加えた。 [稲妻加入](../evidence/inazuma-s01-lua.json) · [白虹峠](../evidence/white-pass-chapter.json)

## 検証コマンド

- `python -X utf8 docs/quest-v1/validate_manifest.py` で、設計索引の153件と本文12文書、37件の物語順序を検査する。
- `python -X utf8 test_quest_design_progression.py` で、レベル・受注場所・停止中・前の依頼・成長条件による受注判定と、目標達成前に報告できないことをLuaで検査する。レベルと前提状態はケースごとに用意する。 [受注判定の結果](../evidence/quest-design-progression.json)
- `python -X utf8 test_quest_design_playthrough.py` で、地域章・通常サブ・高難度・隠し世界・成長・日次の81シナリオを実行する。153件それぞれについて、受注と報酬支給が起きたテスト名を記録した。開始レベル、前の依頼の進行、移動位置や戦闘開始条件はシナリオごとに設定する。 [受注・支給の結果](../evidence/quest-design-playthrough.json)

Lv1からLv200まで8地域を進む試走では、各地域の本編と一部の寄り道を確認している。本ページは依頼ごとの試験をまとめたもので、全依頼を一つのセーブで進める試験、全戦闘の全フェーズ、星々の幻境での実機検証は別途必要。 [Lv1〜200の試走](../evidence/cap-fresh-route.json)
