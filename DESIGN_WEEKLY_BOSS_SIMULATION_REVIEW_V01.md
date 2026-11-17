# 週ボス14戦・シミュレーション結果の入口

> **修正後の入口（2026-11-17）:** [採用した修正仕様](DESIGN_WEEKLY_BOSS_CORRECTIONS_V02.md)と[再検証v2](docs/weekly-boss-v1/simulation-v2/README.md)を先に読む。以下は修正前の検査履歴で、「G12などは未採用」は当時の状態。本依頼で設計基準と二つの索引を修正した。旧モデルと入力は再現用に保持し、ゲーム本体は変更していない。

2026-11-17 JST。入力固定コミット `9c810e929237dc2b710851a75acabfb6ef613d79`。

[結果と修正優先度](docs/weekly-boss-v1/simulation-v1/README.md)を読む。現行14戦の選定ギミック・反撃時間・状態契約をPythonの独立モデルで検査した。**ゲーム本体や全227項目の幾何を動かした実プレイではない**。

実行した期限モデルは10,584条件（元設定8,316、修正候補2,268）、反撃機会42条件、先行入力72条件、状態算術と入力由来の反例、モデル自体の単体テスト11件。源焔WG05/WG16は単独・物理通常の24回分が受付9〜10秒に間に合わない。鯨WV11の高さ/窓、対局WT17の装置側からの初回誘導、召使の返済時間にも検討点がある。失敗例・候補成立はモデル条件付きで、人間の勝率や実機不具合の確定を意味しない。

再現用: [simulate.py](docs/weekly-boss-v1/simulation-v1/simulate.py)、[fixtures.json](docs/weekly-boss-v1/simulation-v1/fixtures.json)、[test_simulate.py](docs/weekly-boss-v1/simulation-v1/test_simulate.py)、[prefire_boundary.py](docs/weekly-boss-v1/simulation-v1/prefire_boundary.py)。当該ディレクトリで `python simulate.py --out results`、`python -m unittest -v test_simulate`、`python prefire_boundary.py`。依存は標準ライブラリのみ。

元の[週ボス設計](DESIGN_WEEKLY_BOSS_MASTER_V01.md)は書き換えていない。G12/受付12秒などは比較候補で未採用。ゲームコード・画像・音・敵カタログ・報酬・セーブは未変更、技実装保留も解除しない。入力元・予約解放・実際の当たり領域をCodex側で接続してから、通常だけ/同行無反応→同行あり→マルチの順で実プレイを行う。
